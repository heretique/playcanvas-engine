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
