import { Mat4 } from '../core/math/mat4.js';
import { Quat } from '../core/math/quat.js';
import { Vec3 } from '../core/math/vec3.js';

const DIRTY_LOCAL_WORLD = 0x03; // DIRTY_LOCAL | DIRTY_WORLD

/**
 * A Vec3 subclass that reads/writes from a backing store's typed array. Every write sets dirty
 * flags on the store, enabling change tracking for the transform system.
 */
class Vec3View extends Vec3 {
    /** @private */
    _store;

    /** @private */
    _arrayName;

    /** @private */
    _offset;

    /** @private */
    _slot;

    /**
     * @param {object} store - The backing store object containing typed arrays and flags.
     * @param {string} arrayName - The property name of the typed array on the store.
     * @param {number} offset - The starting index into the typed array.
     * @param {number} slot - The slot index into the store's flags array.
     */
    constructor(store, arrayName, offset, slot) {
        super();
        // super() creates instance properties x, y, z that shadow our getters/setters.
        // Delete them so the prototype accessors take effect.
        delete this.x;
        delete this.y;
        delete this.z;
        this._store = store;
        this._arrayName = arrayName;
        this._offset = offset;
        this._slot = slot;
    }

    get x() {
        return this._store[this._arrayName][this._offset];
    }

    set x(value) {
        const store = this._store;
        if (!store) return; // guard: called during super() before fields are set
        store[this._arrayName][this._offset] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    get y() {
        return this._store[this._arrayName][this._offset + 1];
    }

    set y(value) {
        const store = this._store;
        if (!store) return;
        store[this._arrayName][this._offset + 1] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    get z() {
        return this._store[this._arrayName][this._offset + 2];
    }

    set z(value) {
        const store = this._store;
        if (!store) return;
        store[this._arrayName][this._offset + 2] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    /**
     * Sets the x, y and z components of the vector.
     *
     * @param {number} x - The x value.
     * @param {number} y - The y value.
     * @param {number} z - The z value.
     * @returns {Vec3View} Self for chaining.
     */
    set(x, y, z) {
        const arr = this._store[this._arrayName];
        const o = this._offset;
        arr[o] = x;
        arr[o + 1] = y;
        arr[o + 2] = z;
        this._store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
        return this;
    }

    /**
     * Copies the contents of a source vector to this vector.
     *
     * @param {Vec3} rhs - A vector to copy.
     * @returns {Vec3View} Self for chaining.
     */
    copy(rhs) {
        const arr = this._store[this._arrayName];
        const o = this._offset;
        arr[o] = rhs.x;
        arr[o + 1] = rhs.y;
        arr[o + 2] = rhs.z;
        this._store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
        return this;
    }

    /**
     * Returns a clone as a plain Vec3 (not backed by the store).
     *
     * @returns {Vec3} A new Vec3 with the same component values.
     */
    clone() {
        return new Vec3(this.x, this.y, this.z);
    }
}

/**
 * A Quat subclass that reads/writes from a backing store's typed array. Every write sets dirty
 * flags on the store, enabling change tracking for the transform system.
 */
class QuatView extends Quat {
    /** @private */
    _store;

    /** @private */
    _arrayName;

    /** @private */
    _offset;

    /** @private */
    _slot;

    /**
     * @param {object} store - The backing store object containing typed arrays and flags.
     * @param {string} arrayName - The property name of the typed array on the store.
     * @param {number} offset - The starting index into the typed array.
     * @param {number} slot - The slot index into the store's flags array.
     */
    constructor(store, arrayName, offset, slot) {
        super();
        // super() creates instance properties x, y, z, w that shadow our getters/setters.
        // Delete them so the prototype accessors take effect.
        delete this.x;
        delete this.y;
        delete this.z;
        delete this.w;
        this._store = store;
        this._arrayName = arrayName;
        this._offset = offset;
        this._slot = slot;
    }

    get x() {
        return this._store[this._arrayName][this._offset];
    }

    set x(value) {
        const store = this._store;
        if (!store) return; // guard: called during super() before fields are set
        store[this._arrayName][this._offset] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    get y() {
        return this._store[this._arrayName][this._offset + 1];
    }

    set y(value) {
        const store = this._store;
        if (!store) return;
        store[this._arrayName][this._offset + 1] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    get z() {
        return this._store[this._arrayName][this._offset + 2];
    }

    set z(value) {
        const store = this._store;
        if (!store) return;
        store[this._arrayName][this._offset + 2] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    get w() {
        return this._store[this._arrayName][this._offset + 3];
    }

    set w(value) {
        const store = this._store;
        if (!store) return;
        store[this._arrayName][this._offset + 3] = value;
        store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
    }

    /**
     * Sets the x, y, z and w components of the quaternion.
     *
     * @param {number} x - The x value.
     * @param {number} y - The y value.
     * @param {number} z - The z value.
     * @param {number} w - The w value.
     * @returns {QuatView} Self for chaining.
     */
    set(x, y, z, w) {
        const arr = this._store[this._arrayName];
        const o = this._offset;
        arr[o] = x;
        arr[o + 1] = y;
        arr[o + 2] = z;
        arr[o + 3] = w;
        this._store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
        return this;
    }

    /**
     * Copies the contents of a source quaternion to this quaternion.
     *
     * @param {Quat} rhs - A quaternion to copy.
     * @returns {QuatView} Self for chaining.
     */
    copy(rhs) {
        const arr = this._store[this._arrayName];
        const o = this._offset;
        arr[o] = rhs.x;
        arr[o + 1] = rhs.y;
        arr[o + 2] = rhs.z;
        arr[o + 3] = rhs.w;
        this._store.flags[this._slot] |= DIRTY_LOCAL_WORLD;
        return this;
    }

    /**
     * Returns a clone as a plain Quat (not backed by the store).
     *
     * @returns {Quat} A new Quat with the same component values.
     */
    clone() {
        return new Quat(this.x, this.y, this.z, this.w);
    }
}

/**
 * A Mat4 subclass whose `.data` is a subarray view into a backing store's typed array. Unlike
 * Vec3View/QuatView, Mat4View does NOT set dirty flags on writes because world/local matrices are
 * computed outputs, not user inputs.
 */
class Mat4View extends Mat4 {
    /** @private */
    _store;

    /** @private */
    _arrayName;

    /** @private */
    _offset;

    /**
     * @param {object} store - The backing store object containing typed arrays.
     * @param {string} arrayName - The property name of the typed array on the store.
     * @param {number} offset - The starting index into the typed array.
     */
    constructor(store, arrayName, offset) {
        super();
        this._store = store;
        this._arrayName = arrayName;
        this._offset = offset;
        this.data = store[arrayName].subarray(offset, offset + 16);
    }

    /**
     * Rebinds this view to a (possibly new) store array after store growth. Since subarrays hold a
     * reference to the original typed array, this must be called when the store replaces its array.
     *
     * @param {object} store - The backing store object.
     * @param {string} arrayName - The property name of the typed array on the store.
     * @param {number} offset - The starting index into the typed array.
     */
    _rebind(store, arrayName, offset) {
        this._store = store;
        this._arrayName = arrayName;
        this._offset = offset;
        this.data = store[arrayName].subarray(offset, offset + 16);
    }
}

export { Mat4View, QuatView, Vec3View };
