/**
 * CullingStore — data-oriented storage for frustum culling data.
 *
 * Stores bounding spheres, flags, and back-references in flat typed arrays
 * for cache-friendly batch culling. Follows the same slot allocation pattern
 * as TransformStore.
 *
 * @ignore
 */

const SPHERE_STRIDE = 4; // cx, cy, cz, radius

// Flag bits for flagsData
const CULL_VISIBLE     = 0x01; // mesh instance visible property
const CULL_ENABLED     = 0x02; // frustum culling enabled (cull property)
const CULL_TRANSPARENT = 0x04; // transparent bucket
const CULL_CUSTOM      = 0x08; // has custom visibility callback (slow path)

// --- Typed array growth helpers ---

function growFloat32(old, newLen) {
    const arr = new Float32Array(newLen);
    arr.set(old);
    return arr;
}

function growUint8(old, newLen) {
    const arr = new Uint8Array(newLen);
    arr.set(old);
    return arr;
}

function growInt32(old, newLen, fill = 0) {
    const arr = new Int32Array(newLen);
    if (fill !== 0) arr.fill(fill);
    arr.set(old);
    return arr;
}

class CullingStore {
    /** @type {number} */
    capacity;

    /** @type {number} */
    count = 0;

    /** @type {Float32Array} - world-space bounding spheres [cx, cy, cz, r, ...] */
    sphereData;

    /** @type {Float32Array} - local-space bounding spheres [cx, cy, cz, r, ...] */
    localBoundsData;

    /** @type {Uint8Array} - per-slot flag bits */
    flagsData;

    /** @type {Int32Array} - culling slot -> graph node slot (for world matrix lookup) */
    graphNodeSlots;

    /** @type {Array<object|null>} - culling slot -> MeshInstance back-reference */
    meshInstances;

    /** @type {number[]} */
    _freeList = [];

    /** @type {number} */
    _nextSlot = 0;

    /**
     * @param {number} [initialCapacity] - Initial number of slots.
     */
    constructor(initialCapacity = 1024) {
        this.capacity = initialCapacity;
        this.sphereData = new Float32Array(SPHERE_STRIDE * initialCapacity);
        this.localBoundsData = new Float32Array(SPHERE_STRIDE * initialCapacity);
        this.flagsData = new Uint8Array(initialCapacity);
        this.graphNodeSlots = new Int32Array(initialCapacity).fill(-1);
        this.meshInstances = new Array(initialCapacity).fill(null);
    }

    /**
     * Allocate a new slot.
     *
     * @returns {number} The slot index.
     */
    allocSlot() {
        let slot;
        if (this._freeList.length > 0) {
            slot = this._freeList.pop();
        } else {
            slot = this._nextSlot++;
            if (slot >= this.capacity) this._grow();
        }
        this.count++;

        // Clear slot state
        const off = slot * SPHERE_STRIDE;
        this.sphereData[off] = 0;
        this.sphereData[off + 1] = 0;
        this.sphereData[off + 2] = 0;
        this.sphereData[off + 3] = 0;
        this.localBoundsData[off] = 0;
        this.localBoundsData[off + 1] = 0;
        this.localBoundsData[off + 2] = 0;
        this.localBoundsData[off + 3] = 0;
        this.flagsData[slot] = 0;
        this.graphNodeSlots[slot] = -1;
        this.meshInstances[slot] = null;

        return slot;
    }

    /**
     * Free a slot.
     *
     * @param {number} slot - The slot index to free.
     */
    freeSlot(slot) {
        const off = slot * SPHERE_STRIDE;
        this.sphereData[off] = 0;
        this.sphereData[off + 1] = 0;
        this.sphereData[off + 2] = 0;
        this.sphereData[off + 3] = 0;
        this.localBoundsData[off] = 0;
        this.localBoundsData[off + 1] = 0;
        this.localBoundsData[off + 2] = 0;
        this.localBoundsData[off + 3] = 0;
        this.flagsData[slot] = 0;
        this.graphNodeSlots[slot] = -1;
        this.meshInstances[slot] = null;

        this._freeList.push(slot);
        this.count--;
    }

    /**
     * Write local-space bounding sphere data for a slot.
     *
     * @param {number} slot - The culling slot index.
     * @param {number} cx - Local center X.
     * @param {number} cy - Local center Y.
     * @param {number} cz - Local center Z.
     * @param {number} radius - Local bounding sphere radius.
     */
    setLocalBounds(slot, cx, cy, cz, radius) {
        const off = slot * SPHERE_STRIDE;
        this.localBoundsData[off] = cx;
        this.localBoundsData[off + 1] = cy;
        this.localBoundsData[off + 2] = cz;
        this.localBoundsData[off + 3] = radius;
    }

    /**
     * Recompute world-space bounding spheres for all slots whose linked graph node
     * was updated in the given frame.
     *
     * Must be called after syncHierarchy() completes (both propagate and CUSTOM_SYNC phases).
     *
     * @param {object} transformStore - The transform store to read world matrices from.
     * @param {number} currentFrame - The current frame number.
     */
    updateWorldSpheres(transformStore, currentFrame) {
        const worldData = transformStore.worldData;
        const lastWorldUpdate = transformStore.lastWorldUpdate;
        const graphNodeSlots = this.graphNodeSlots;
        const localBounds = this.localBoundsData;
        const spheres = this.sphereData;
        const maxSlot = this._nextSlot;

        for (let slot = 0; slot < maxSlot; slot++) {
            const nodeSlot = graphNodeSlots[slot];
            if (nodeSlot < 0) continue; // freed slot
            if (lastWorldUpdate[nodeSlot] !== currentFrame) continue; // not updated this frame

            const lb = slot * SPHERE_STRIDE;
            const lcx = localBounds[lb];
            const lcy = localBounds[lb + 1];
            const lcz = localBounds[lb + 2];
            const lr = localBounds[lb + 3];

            // Read world matrix (column-major 4x4) at nodeSlot * 16
            const wo = nodeSlot * 16;
            const m0 = worldData[wo];      // col0.x
            const m1 = worldData[wo + 1];  // col0.y
            const m2 = worldData[wo + 2];  // col0.z
            const m4 = worldData[wo + 4];  // col1.x
            const m5 = worldData[wo + 5];  // col1.y
            const m6 = worldData[wo + 6];  // col1.z
            const m8 = worldData[wo + 8];  // col2.x
            const m9 = worldData[wo + 9];  // col2.y
            const m10 = worldData[wo + 10]; // col2.z
            const m12 = worldData[wo + 12]; // translation.x
            const m13 = worldData[wo + 13]; // translation.y
            const m14 = worldData[wo + 14]; // translation.z

            // Transform local center by world matrix
            const wcx = m0 * lcx + m4 * lcy + m8 * lcz + m12;
            const wcy = m1 * lcx + m5 * lcy + m9 * lcz + m13;
            const wcz = m2 * lcx + m6 * lcy + m10 * lcz + m14;

            // Scale radius by max column length (max axis scale)
            const sx = Math.sqrt(m0 * m0 + m1 * m1 + m2 * m2);
            const sy = Math.sqrt(m4 * m4 + m5 * m5 + m6 * m6);
            const sz = Math.sqrt(m8 * m8 + m9 * m9 + m10 * m10);
            const maxScale = Math.max(sx, sy, sz);

            const sb = slot * SPHERE_STRIDE;
            spheres[sb] = wcx;
            spheres[sb + 1] = wcy;
            spheres[sb + 2] = wcz;
            spheres[sb + 3] = lr * maxScale;
        }
    }

    /**
     * Test a list of culling slots against frustum planes.
     *
     * @param {Float32Array} planeData - Flattened frustum planes (24 floats from Frustum.getPlaneData).
     * @param {number[]|Int32Array} slots - Array of culling slot indices to test.
     * @param {Uint8Array} results - Output: results[slot] set to 1 if visible, untouched otherwise.
     */
    cullFrustum(planeData, slots, results) {
        const spheres = this.sphereData;
        const flags = this.flagsData;
        const slotCount = slots.length;

        for (let i = 0; i < slotCount; i++) {
            const slot = slots[i];
            if (!(flags[slot] & CULL_VISIBLE)) continue;

            if (!(flags[slot] & CULL_ENABLED)) {
                results[slot] = 1;
                continue;
            }

            const off = slot * SPHERE_STRIDE;
            const cx = spheres[off];
            const cy = spheres[off + 1];
            const cz = spheres[off + 2];
            const r = spheres[off + 3];

            let visible = true;
            for (let p = 0; p < 24; p += 4) {
                if (planeData[p] * cx + planeData[p + 1] * cy + planeData[p + 2] * cz + planeData[p + 3] <= -r) {
                    visible = false;
                    break;
                }
            }

            if (visible) {
                results[slot] = 1;
            }
        }
    }

    /** @private */
    _grow() {
        const newCapacity = this.capacity * 2;

        this.sphereData = growFloat32(this.sphereData, SPHERE_STRIDE * newCapacity);
        this.localBoundsData = growFloat32(this.localBoundsData, SPHERE_STRIDE * newCapacity);
        this.flagsData = growUint8(this.flagsData, newCapacity);
        this.graphNodeSlots = growInt32(this.graphNodeSlots, newCapacity, -1);

        const oldRefs = this.meshInstances;
        this.meshInstances = new Array(newCapacity).fill(null);
        for (let i = 0; i < oldRefs.length; i++) {
            this.meshInstances[i] = oldRefs[i];
        }

        this.capacity = newCapacity;
    }
}

export { CullingStore, CULL_VISIBLE, CULL_ENABLED, CULL_TRANSPARENT, CULL_CUSTOM, SPHERE_STRIDE };
