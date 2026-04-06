/**
 * TransformStore — backend for scene graph transforms.
 *
 * Stores all node transforms in flat typed arrays for cache-friendly batch propagation.
 * Replaces the per-node recursive syncHierarchy() with a single flat loop over
 * topologically-sorted slots.
 *
 * @ignore
 */

import {
    setTRSFromArray,
    setTRSScalars,
    mulAffine2Arrays,
    extractScale,
    extractRotationQuat,
    transformPointArray,
    invertAffine
} from './math-helpers.js';

const LOCAL_STRIDE = 10;  // 3 pos + 4 quat + 3 scale
const WORLD_STRIDE = 16;  // 4x4 column-major matrix

const DIRTY_LOCAL = 0x01;
const DIRTY_WORLD = 0x02;
const SCALE_COMP  = 0x04;
const ENABLED     = 0x08;
const CUSTOM_SYNC = 0x10;

// Pre-allocated scratch space (module scope, reused, zero GC)
const _tempLocal = new Float32Array(16);
const _tempScale = new Float32Array(3);
const _tempQuat = new Float32Array(4);
const _tempPos = new Float32Array(3);
const _topoStack = new Int32Array(16384);

// --- Typed array growth helpers ---

function growFloat32(old, newLen) {
    const arr = new Float32Array(newLen);
    arr.set(old);
    return arr;
}

function growUint16(old, newLen) {
    const arr = new Uint16Array(newLen);
    arr.set(old);
    return arr;
}

function growUint32(old, newLen) {
    const arr = new Uint32Array(newLen);
    arr.set(old);
    return arr;
}

function growInt32(old, newLen, fill = 0) {
    const arr = new Int32Array(newLen);
    if (fill !== 0) arr.fill(fill);
    arr.set(old);
    return arr;
}

class TransformStore {
    /** @type {number} */
    capacity;

    /** @type {number} */
    count = 0;

    /** @type {number} */
    currentFrame = 1;

    /** @type {Float32Array} */
    localData;

    /** @type {Float32Array} */
    localMatData;

    /** @type {Float32Array} */
    worldData;

    /** @type {Float32Array} */
    worldInvData;

    /** @type {Uint16Array} */
    flags;

    /** @type {Int32Array} */
    parentSlot;

    /** @type {Int32Array} */
    firstChild;

    /** @type {Int32Array} */
    nextSibling;

    /** @type {Int32Array} */
    prevSibling;

    /** @type {Uint32Array} */
    lastWorldUpdate;

    /** @type {Uint32Array} */
    lastInvUpdate;

    /** @type {Int32Array} */
    topoOrder;

    /** @type {number} */
    topoLength = 0;

    /** @type {boolean} */
    topoDirty = true;

    /** @type {Array<object|null>} */
    nodeRefs;

    /** @type {Int32Array} - Pre-allocated buffer for slots updated during propagate() */
    _updatedSlots;

    /** @type {number} - Number of slots updated in the last propagate() call */
    _updatedCount = 0;

    /** @type {number[]} */
    _freeList = [];

    /** @type {number} */
    _nextSlot = 0;

    /**
     * @param {number} [initialCapacity] - Initial number of slots.
     */
    constructor(initialCapacity = 2048) {
        this.capacity = initialCapacity;

        this.localData = new Float32Array(LOCAL_STRIDE * initialCapacity);
        this.localMatData = new Float32Array(WORLD_STRIDE * initialCapacity);
        this.worldData = new Float32Array(WORLD_STRIDE * initialCapacity);
        this.worldInvData = new Float32Array(WORLD_STRIDE * initialCapacity);

        this.flags = new Uint16Array(initialCapacity);
        this.parentSlot = new Int32Array(initialCapacity).fill(-1);
        this.firstChild = new Int32Array(initialCapacity).fill(-1);
        this.nextSibling = new Int32Array(initialCapacity).fill(-1);
        this.prevSibling = new Int32Array(initialCapacity).fill(-1);

        this.lastWorldUpdate = new Uint32Array(initialCapacity);
        this.lastInvUpdate = new Uint32Array(initialCapacity);

        this.topoOrder = new Int32Array(initialCapacity);
        this._updatedSlots = new Int32Array(initialCapacity);
        this.nodeRefs = new Array(initialCapacity).fill(null);

        // Initialize identity transforms for all slots
        for (let i = 0; i < initialCapacity; i++) {
            const lo = i * LOCAL_STRIDE;
            this.localData[lo + 6] = 1;  // quat.w = 1
            this.localData[lo + 7] = 1;  // scale.x = 1
            this.localData[lo + 8] = 1;  // scale.y = 1
            this.localData[lo + 9] = 1;  // scale.z = 1
        }
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

		// Reset slot to identity transform
		const lo = slot * LOCAL_STRIDE;
		this.localData[lo] = 0;
		this.localData[lo + 1] = 0;
		this.localData[lo + 2] = 0; // pos
		this.localData[lo + 3] = 0;
		this.localData[lo + 4] = 0;
		this.localData[lo + 5] = 0; // quat xyz
		this.localData[lo + 6] = 1; // quat w
		this.localData[lo + 7] = 1;
		this.localData[lo + 8] = 1;
		this.localData[lo + 9] = 1; // scale

        this.flags[slot] = ENABLED | DIRTY_LOCAL | DIRTY_WORLD;
        this.parentSlot[slot] = -1;
        this.firstChild[slot] = -1;
        this.nextSibling[slot] = -1;
        this.prevSibling[slot] = -1;
        this.lastWorldUpdate[slot] = 0;
        this.lastInvUpdate[slot] = 0;
        this.nodeRefs[slot] = null;
        this.topoDirty = true;

        return slot;
    }

    /**
     * Free a slot.
     *
     * @param {number} slot - The slot index to free.
     */
    freeSlot(slot) {
        // Detach all children first
        let child = this.firstChild[slot];
        while (child >= 0) {
            const next = this.nextSibling[child];
            this.parentSlot[child] = -1;
            this.prevSibling[child] = -1;
            this.nextSibling[child] = -1;
            child = next;
        }
        this.firstChild[slot] = -1;

        this._detach(slot);
        this.flags[slot] = 0;
        this.nodeRefs[slot] = null;
        this._freeList.push(slot);
        this.count--;
        this.topoDirty = true;
    }

    /**
     * Write local position into the store and mark dirty.
     *
     * @param {number} slot - Slot index.
     * @param {number} x - X.
     * @param {number} y - Y.
     * @param {number} z - Z.
     */
    setLocalPosition(slot, x, y, z) {
        const o = slot * LOCAL_STRIDE;
        this.localData[o] = x;
        this.localData[o + 1] = y;
        this.localData[o + 2] = z;
        this.flags[slot] |= DIRTY_LOCAL | DIRTY_WORLD;
    }

    /**
     * Write local rotation quaternion into the store and mark dirty.
     *
     * @param {number} slot - Slot index.
     * @param {number} x - Quaternion X.
     * @param {number} y - Quaternion Y.
     * @param {number} z - Quaternion Z.
     * @param {number} w - Quaternion W.
     */
    setLocalRotation(slot, x, y, z, w) {
        const o = slot * LOCAL_STRIDE + 3;
        this.localData[o] = x;
        this.localData[o + 1] = y;
        this.localData[o + 2] = z;
        this.localData[o + 3] = w;
        this.flags[slot] |= DIRTY_LOCAL | DIRTY_WORLD;
    }

    /**
     * Write local scale into the store and mark dirty.
     *
     * @param {number} slot - Slot index.
     * @param {number} x - Scale X.
     * @param {number} y - Scale Y.
     * @param {number} z - Scale Z.
     */
    setLocalScale(slot, x, y, z) {
        const o = slot * LOCAL_STRIDE + 7;
        this.localData[o] = x;
        this.localData[o + 1] = y;
        this.localData[o + 2] = z;
        this.flags[slot] |= DIRTY_LOCAL | DIRTY_WORLD;
    }

    /**
     * Set the parent of a child slot. Pass -1 to make it a root.
     *
     * @param {number} childSlot - The child slot.
     * @param {number} newParent - The parent slot (or -1).
     */
    setParent(childSlot, newParent) {
        this._detach(childSlot);
        this.parentSlot[childSlot] = newParent;
        if (newParent >= 0) {
            const oldFirst = this.firstChild[newParent];
            this.nextSibling[childSlot] = oldFirst;
            this.prevSibling[childSlot] = -1;
            if (oldFirst >= 0) {
                this.prevSibling[oldFirst] = childSlot;
            }
            this.firstChild[newParent] = childSlot;
        }
        this.flags[childSlot] |= DIRTY_WORLD;
        this.topoDirty = true;
    }

    /**
     * Batch propagation — the core hot loop. Updates all dirty world matrices in topo order.
     */
    propagate() {
        if (this.topoDirty) {
            this._rebuildTopoOrder();
        }

        const frame = ++this.currentFrame;
        const topo = this.topoOrder;
        const len = this.topoLength;
        const flags = this.flags;
        const parentSlots = this.parentSlot;
        const localData = this.localData;
        const localMatData = this.localMatData;
        const worldData = this.worldData;
        const lastUpdate = this.lastWorldUpdate;
        const updated = this._updatedSlots;
        let updatedCount = 0;

        for (let i = 0; i < len; i++) {
            const slot = topo[i];

            const selfDirty = (flags[slot] & (DIRTY_LOCAL | DIRTY_WORLD)) !== 0;
            const pSlot = parentSlots[slot];
            const parentUpdated = pSlot >= 0 && lastUpdate[pSlot] === frame;

            if (!selfDirty && !parentUpdated) continue;

            if (flags[slot] & CUSTOM_SYNC) {
                // CUSTOM_SYNC nodes (Element components) compute their own
                // world matrix in Phase 2 via _sync(). Skip world computation
                // here — screen-space elements need a different transform.
                // Build the local matrix into localMatData for _sync() to use.
                const lo = slot * LOCAL_STRIDE;
                const wo = slot * WORLD_STRIDE;
                setTRSFromArray(localData, lo, localMatData, wo);
                lastUpdate[slot] = frame;
                // Preserve dirty flags for Phase 2 — _sync() reads them.
                updated[updatedCount++] = slot;
                continue;
            }

            // Skip non-CUSTOM_SYNC children of CUSTOM_SYNC parents.
            // Their world matrix depends on the parent's final transform which
            // is only known after Phase 2 _sync(). Phase 2 will propagate to
            // these children after updating the parent.
            if (pSlot >= 0 && (flags[pSlot] & CUSTOM_SYNC)) {
                continue;
            }

            const lo = slot * LOCAL_STRIDE;
            const wo = slot * WORLD_STRIDE;
            setTRSFromArray(localData, lo, _tempLocal, 0);

            if (pSlot < 0) {
                // Root: world = local
                worldData.set(_tempLocal, wo);
            } else if (flags[slot] & SCALE_COMP) {
                // Scale compensation path (rare)
                this._syncScaleCompensated(slot, pSlot, lo, wo);
            } else {
                // Standard: world = parent.world * local
                const po = pSlot * WORLD_STRIDE;
                mulAffine2Arrays(worldData, po, _tempLocal, 0, worldData, wo);
            }

            lastUpdate[slot] = frame;
            flags[slot] &= ~(DIRTY_LOCAL | DIRTY_WORLD);
            updated[updatedCount++] = slot;
        }

        this._updatedCount = updatedCount;
    }

    /**
     * Propagate world matrices to non-CUSTOM_SYNC children of a given slot.
     * Called in Phase 2 after _sync() sets the final world matrix for a
     * CUSTOM_SYNC node, so that internal GraphNode children (e.g. image/text
     * mesh nodes) pick up the correct parent world transform.
     *
     * @param {number} parentSlotId - The parent slot whose children need updating.
     */
    propagateToChildren(parentSlotId) {
        const localData = this.localData;
        const worldData = this.worldData;
        const flags = this.flags;
        const po = parentSlotId * WORLD_STRIDE;

        let child = this.firstChild[parentSlotId];
        while (child >= 0) {
            if ((flags[child] & ENABLED) && !(flags[child] & CUSTOM_SYNC)) {
                const clo = child * LOCAL_STRIDE;
                const cwo = child * WORLD_STRIDE;
                setTRSFromArray(localData, clo, _tempLocal, 0);
                mulAffine2Arrays(worldData, po, _tempLocal, 0, worldData, cwo);
            }
            child = this.nextSibling[child];
        }
    }

    /**
     * Get the offset into worldInvData for the given slot's inverse matrix.
     * Lazily recomputes if stale.
     *
     * @param {number} slot - Slot index.
     * @returns {number} Offset into worldInvData.
     */
    getWorldInverseOffset(slot) {
        const wo = slot * WORLD_STRIDE;
        if (this.lastInvUpdate[slot] !== this.currentFrame) {
            invertAffine(this.worldData, wo, this.worldInvData, wo);
            this.lastInvUpdate[slot] = this.currentFrame;
        }
        return wo;
    }

    /** @private */
    _syncScaleCompensated(slot, pSlot, localOff, worldOff) {
        const localData = this.localData;
        const worldData = this.worldData;
        const flags = this.flags;
        const parentSlots = this.parentSlot;

        // 1. Walk up to find first uncompensated ancestor
        let scaleAncestor = pSlot;
        while (scaleAncestor >= 0 && (flags[scaleAncestor] & SCALE_COMP)) {
            scaleAncestor = parentSlots[scaleAncestor];
        }
        if (scaleAncestor >= 0) {
            scaleAncestor = parentSlots[scaleAncestor];
        }

        // 2. Compute compensated scale = ancestorWorldScale * localScale
        let sx = localData[localOff + 7];
        let sy = localData[localOff + 8];
        let sz = localData[localOff + 9];
        if (scaleAncestor >= 0) {
            extractScale(worldData, scaleAncestor * WORLD_STRIDE, _tempScale, 0);
            sx *= _tempScale[0];
            sy *= _tempScale[1];
            sz *= _tempScale[2];
        }

        // 3. World rotation = parent world rotation * local rotation
        const pwo = pSlot * WORLD_STRIDE;
        extractRotationQuat(worldData, pwo, _tempQuat, 0);

        const prx = _tempQuat[0], pry = _tempQuat[1], prz = _tempQuat[2], prw = _tempQuat[3];
        const lro = localOff + 3;
        const lrx = localData[lro], lry = localData[lro + 1], lrz = localData[lro + 2], lrw = localData[lro + 3];

		// Hamilton product: parentWorldRot * localRot
        const wrx = prw * lrx + prx * lrw + pry * lrz - prz * lry;
        const wry = prw * lry - prx * lrz + pry * lrw + prz * lrx;
        const wrz = prw * lrz + prx * lry - pry * lrx + prz * lrw;
        const wrw = prw * lrw - prx * lrx - pry * lry - prz * lrz;

        // 4. Compensated position
        let useTempLocal = false;

        if (flags[pSlot] & SCALE_COMP) {
			// Build compensated parent matrix for position transform
            const parentLocalOff = pSlot * LOCAL_STRIDE;
            let psx = localData[parentLocalOff + 7];
            let psy = localData[parentLocalOff + 8];
            let psz = localData[parentLocalOff + 9];
            if (scaleAncestor >= 0) {
                psx *= _tempScale[0];
                psy *= _tempScale[1];
                psz *= _tempScale[2];
            }
            setTRSScalars(
                worldData[pwo + 12], worldData[pwo + 13], worldData[pwo + 14],
                prx, pry, prz, prw,
                psx, psy, psz,
                _tempLocal, 0
            );
            useTempLocal = true;
        }

		// Transform local position by the (possibly compensated) parent matrix
        const src = useTempLocal ? _tempLocal : worldData;
        const srcOff = useTempLocal ? 0 : pwo;
        transformPointArray(src, srcOff, localData, localOff, _tempPos, 0);

        // 5. Write world = TRS(compensatedPos, compensatedRot, compensatedScale)
        setTRSScalars(
            _tempPos[0], _tempPos[1], _tempPos[2],
            wrx, wry, wrz, wrw,
            sx, sy, sz,
            worldData, worldOff
        );
    }

	// -----------------------------------------------------------
	// Iterative topological sort (DFS preorder via explicit stack)
	// 

    /** @private */
    _rebuildTopoOrder() {
        let writeIdx = 0;
        let stackTop = 0;

        // Find all root nodes
        for (let i = 0; i < this._nextSlot; i++) {
            if ((this.flags[i] & ENABLED) && this.parentSlot[i] < 0) {
                _topoStack[stackTop++] = i;
            }
        }

        while (stackTop > 0) {
            const slot = _topoStack[--stackTop];
            this.topoOrder[writeIdx++] = slot;

			// Push children in reverse order so first child pops first
            let childCount = 0;
            let child = this.firstChild[slot];
            const base = stackTop;
            while (child >= 0) {
                if (this.flags[child] & ENABLED) {
                    _topoStack[stackTop++] = child;
                    childCount++;
                }
                child = this.nextSibling[child];
            }
			// Reverse children on stack so iteration order matches hierarchy order
            if (childCount > 1) {
                let lo = base, hi = stackTop - 1;
                while (lo < hi) {
                    const tmp = _topoStack[lo];
                    _topoStack[lo] = _topoStack[hi];
                    _topoStack[hi] = tmp;
                    lo++; hi--;
                }
            }
        }

        this.topoLength = writeIdx;
        this.topoDirty = false;
    }

    /** @private */
    _detach(slot) {
        const parent = this.parentSlot[slot];
        if (parent < 0) return;

        const prev = this.prevSibling[slot];
        const next = this.nextSibling[slot];

        if (prev >= 0) {
            this.nextSibling[prev] = next;
        } else {
            this.firstChild[parent] = next;
        }
        if (next >= 0) {
            this.prevSibling[next] = prev;
        }

        this.parentSlot[slot] = -1;
        this.nextSibling[slot] = -1;
        this.prevSibling[slot] = -1;
    }

    /** @private */
    _grow() {
        const newCap = Math.max(this.capacity * 2, 64);

        this.localData = growFloat32(this.localData, newCap * LOCAL_STRIDE);
        this.localMatData = growFloat32(this.localMatData, newCap * WORLD_STRIDE);
        this.worldData = growFloat32(this.worldData, newCap * WORLD_STRIDE);
        this.worldInvData = growFloat32(this.worldInvData, newCap * WORLD_STRIDE);

        this.flags = growUint16(this.flags, newCap);
        this.parentSlot = growInt32(this.parentSlot, newCap, -1);
        this.firstChild = growInt32(this.firstChild, newCap, -1);
        this.nextSibling = growInt32(this.nextSibling, newCap, -1);
        this.prevSibling = growInt32(this.prevSibling, newCap, -1);

        this.lastWorldUpdate = growUint32(this.lastWorldUpdate, newCap);
        this.lastInvUpdate = growUint32(this.lastInvUpdate, newCap);

        this.topoOrder = growInt32(this.topoOrder, newCap, 0);
        this._updatedSlots = growInt32(this._updatedSlots, newCap, 0);

        // Grow nodeRefs
        const oldRefs = this.nodeRefs;
        this.nodeRefs = new Array(newCap).fill(null);
        for (let i = 0; i < oldRefs.length; i++) {
            this.nodeRefs[i] = oldRefs[i];
        }

        for (let i = this.capacity; i < newCap; i++) {
            const lo = i * LOCAL_STRIDE;
            this.localData[lo + 6] = 1;
            this.localData[lo + 7] = 1;
            this.localData[lo + 8] = 1;
            this.localData[lo + 9] = 1;
        }

        // Rebind all proxy objects that hold subarray views into the old arrays
        for (let i = 0; i < this._nextSlot; i++) {
            const node = this.nodeRefs[i];
            if (node && node._rebindProxies) {
                node._rebindProxies();
            }
        }

        this.capacity = newCap;
    }
}

/**
 * Global singleton TransformStore instance, shared across all GraphNodes.
 *
 * @type {TransformStore}
 * @ignore
 */
const transformStore = new TransformStore(4096);

export { TransformStore, transformStore, LOCAL_STRIDE, WORLD_STRIDE, DIRTY_LOCAL, DIRTY_WORLD, SCALE_COMP, ENABLED, CUSTOM_SYNC };
