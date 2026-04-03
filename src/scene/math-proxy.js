import { math } from '../core/math/math.js';
import { Vec3 } from '../core/math/vec3.js';
import { Vec4 } from '../core/math/vec4.js';
import { Quat } from '../core/math/quat.js';
import { Mat4 } from '../core/math/mat4.js';

/**
 * Vec3Proxy — zero-copy view into a Float32Array region.
 *
 * Provides .x/.y/.z getters/setters that read/write directly from the backing
 * typed array. No per-frame allocation — the proxy object is created once per
 * node and reused across its lifetime.
 */
export class Vec3Proxy {
    /**
     * @type {Float32Array}
     * @private
     */
    _data;

    /**
     * @type {number}
     * @private
     */
    _offset;

    constructor(data, offset) {
        this._data = data;
        this._offset = offset;
    }

    set x(v) {
        this._data[this._offset] = v;
    }

    get x() {
        return this._data[this._offset];
    }

    set y(v) {
        this._data[this._offset + 1] = v;
    }

    get y() {
        return this._data[this._offset + 1];
    }

    set z(v) {
        this._data[this._offset + 2] = v;
    }

    get z() {
        return this._data[this._offset + 2];
    }

    set(x, y, z) {
        this._data[this._offset] = x;
        this._data[this._offset + 1] = y;
        this._data[this._offset + 2] = z;
        return this;
    }

    copy(v) {
        return this.set(v.x, v.y, v.z);
    }

    add(v) {
        this._data[this._offset] += v.x;
        this._data[this._offset + 1] += v.y;
        this._data[this._offset + 2] += v.z;
        return this;
    }

    clone() {
        return new Vec3(this.x, this.y, this.z);
    }

    equals(v) {
        return this.x === v.x && this.y === v.y && this.z === v.z;
    }

    /** Update backing array reference after store grows */
    _rebind(data, offset) {
        this._data = data;
        this._offset = offset;
    }
}

/**
 * QuatProxy — zero-copy view into a Float32Array region for quaternions.
 */
export class QuatProxy {
    /**
     * @type {Float32Array}
     * @private
     */
    _data;

    /**
     * @type {number}
     * @private
     */
    _offset;

    constructor(data, offset) {
        this._data = data;
        this._offset = offset;
    }

    set x(v) {
        this._data[this._offset] = v;
    }

    get x() {
        return this._data[this._offset];
    }

    set y(v) {
        this._data[this._offset + 1] = v;
    }

    get y() {
        return this._data[this._offset + 1];
    }

    set z(v) {
        this._data[this._offset + 2] = v;
    }

    get z() {
        return this._data[this._offset + 2];
    }

    set w(v) {
        this._data[this._offset + 3] = v;
    }

    get w() {
        return this._data[this._offset + 3];
    }

    set(x, y, z, w) {
        this._data[this._offset] = x;
        this._data[this._offset + 1] = y;
        this._data[this._offset + 2] = z;
        this._data[this._offset + 3] = w;
        return this;
    }

    copy(q) {
        return this.set(q.x, q.y, q.z, q.w);
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    }

    normalize() {
        let len = this.length();
        if (len === 0) {
            return this.set(0, 0, 0, 1);
        }
        len = 1 / len;
        return this.set(this.x * len, this.y * len, this.z * len, this.w * len);
    }

    conjugate(src = this) {
        return this.set(-src.x, -src.y, -src.z, src.w);
    }

    invert(src = this) {
        return this.conjugate(src).normalize();
    }

    mul(rhs) {
        const q1x = this.x, q1y = this.y, q1z = this.z, q1w = this.w;
        const q2x = rhs.x, q2y = rhs.y, q2z = rhs.z, q2w = rhs.w;
        return this.set(
            q1w * q2x + q1x * q2w + q1y * q2z - q1z * q2y,
            q1w * q2y + q1y * q2w + q1z * q2x - q1x * q2z,
            q1w * q2z + q1z * q2w + q1x * q2y - q1y * q2x,
            q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z
        );
    }

    mul2(lhs, rhs) {
        const q1x = lhs.x, q1y = lhs.y, q1z = lhs.z, q1w = lhs.w;
        const q2x = rhs.x, q2y = rhs.y, q2z = rhs.z, q2w = rhs.w;
        return this.set(
            q1w * q2x + q1x * q2w + q1y * q2z - q1z * q2y,
            q1w * q2y + q1y * q2w + q1z * q2x - q1x * q2z,
            q1w * q2z + q1z * q2w + q1x * q2y - q1y * q2x,
            q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z
        );
    }

    mulScalar(scalar, src = this) {
        return this.set(src.x * scalar, src.y * scalar, src.z * scalar, src.w * scalar);
    }

    setFromEulerAngles(ex, ey, ez) {
        if (ex && typeof ex === 'object') {
            const vec = ex;
            ex = vec.x; ey = vec.y; ez = vec.z;
        }
        const halfToRad = 0.5 * math.DEG_TO_RAD;
        ex *= halfToRad; ey *= halfToRad; ez *= halfToRad;
        const sx = Math.sin(ex), cx = Math.cos(ex);
        const sy = Math.sin(ey), cy = Math.cos(ey);
        const sz = Math.sin(ez), cz = Math.cos(ez);
        return this.set(
            sx * cy * cz - cx * sy * sz,
            cx * sy * cz + sx * cy * sz,
            cx * cy * sz - sx * sy * cz,
            cx * cy * cz + sx * sy * sz
        );
    }

    setFromMat4(m) {
        const d = m.data;
        let m00 = d[0], m01 = d[1], m02 = d[2];
        let m10 = d[4], m11 = d[5], m12 = d[6];
        let m20 = d[8], m21 = d[9], m22 = d[10];

        const det = m00 * (m11 * m22 - m12 * m21) -
                    m01 * (m10 * m22 - m12 * m20) +
                    m02 * (m10 * m21 - m11 * m20);
        if (det < 0) { m00 = -m00; m01 = -m01; m02 = -m02; }

        let l;
        l = m00 * m00 + m01 * m01 + m02 * m02;
        if (l === 0) return this.set(0, 0, 0, 1);
        l = 1 / Math.sqrt(l); m00 *= l; m01 *= l; m02 *= l;

        l = m10 * m10 + m11 * m11 + m12 * m12;
        if (l === 0) return this.set(0, 0, 0, 1);
        l = 1 / Math.sqrt(l); m10 *= l; m11 *= l; m12 *= l;

        l = m20 * m20 + m21 * m21 + m22 * m22;
        if (l === 0) return this.set(0, 0, 0, 1);
        l = 1 / Math.sqrt(l); m20 *= l; m21 *= l; m22 *= l;

        if (m22 < 0) {
            if (m00 > m11) {
                this.set(1 + m00 - m11 - m22, m01 + m10, m20 + m02, m12 - m21);
            } else {
                this.set(m01 + m10, 1 - m00 + m11 - m22, m12 + m21, m20 - m02);
            }
        } else {
            if (m00 < -m11) {
                this.set(m20 + m02, m12 + m21, 1 - m00 - m11 + m22, m01 - m10);
            } else {
                this.set(m12 - m21, m20 - m02, m01 - m10, 1 + m00 + m11 + m22);
            }
        }
        return this.mulScalar(1.0 / this.length());
    }

    getEulerAngles(eulers) {
        if (!eulers) eulers = new Vec3();
        const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
        const a2 = 2 * (qw * qy - qx * qz);
        let x, y, z;
        if (a2 <= -0.99999) {
            x = 2 * Math.atan2(qx, qw); y = -Math.PI / 2; z = 0;
        } else if (a2 >= 0.99999) {
            x = 2 * Math.atan2(qx, qw); y = Math.PI / 2; z = 0;
        } else {
            x = Math.atan2(2 * (qw * qx + qy * qz), 1 - 2 * (qx * qx + qy * qy));
            y = Math.asin(a2);
            z = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
        }
        return eulers.set(x * math.RAD_TO_DEG, y * math.RAD_TO_DEG, z * math.RAD_TO_DEG);
    }

    transformVector(vec, res) {
        if (!res) res = new Vec3();
        const x = vec.x, y = vec.y, z = vec.z;
        const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
        const ix = qw * x + qy * z - qz * y;
        const iy = qw * y + qz * x - qx * z;
        const iz = qw * z + qx * y - qy * x;
        const iw = -qx * x - qy * y - qz * z;
        res.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        res.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        res.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
        return res;
    }

    clone() {
        return new Quat(this.x, this.y, this.z, this.w);
    }

    equals(v) {
        return this.x === v.x && this.y === v.y && this.z === v.z && this.w === v.w;
    }

    /** Update backing array reference after store grows */
    _rebind(data, offset) {
        this._data = data;
        this._offset = offset;
    }
}

/**
 * Mat4Proxy — zero-copy view into a Float32Array region for 4x4 matrices.
 *
 * Exposes a `.data` subarray view and implements the Mat4 API so it can be
 * used as a drop-in replacement wherever a Mat4 is expected.
 */
export class Mat4Proxy {
    /**
     * @type {Float32Array}
     * @private
     */
    _data;

    /**
     * @type {number}
     * @private
     */
    _offset;

    /**
     * Subarray view into the backing typed array (16 floats). This is the same
     * property that Mat4 exposes, so code that reads `mat.data` works unchanged.
     *
     * @type {Float32Array}
     */
    data;

    constructor(data, offset) {
        this._data = data;
        this._offset = offset;
        this.data = data.subarray(offset, offset + 16);
    }

    /**
     * Sets matrix data from an array.
     *
     * @param {number[]|Float32Array} src - Source array. Must have 16 values.
     * @returns {Mat4Proxy} Self for chaining.
     */
    set(src) {
        const d = this.data;
        d[0] = src[0];
        d[1] = src[1];
        d[2] = src[2];
        d[3] = src[3];
        d[4] = src[4];
        d[5] = src[5];
        d[6] = src[6];
        d[7] = src[7];
        d[8] = src[8];
        d[9] = src[9];
        d[10] = src[10];
        d[11] = src[11];
        d[12] = src[12];
        d[13] = src[13];
        d[14] = src[14];
        d[15] = src[15];
        return this;
    }

    /**
     * Copies the contents of a source 4x4 matrix.
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} rhs - A 4x4 matrix to copy.
     * @returns {Mat4Proxy} Self for chaining.
     */
    copy(rhs) {
        return this.set(rhs.data);
    }

    /**
     * Creates a duplicate of this matrix (as a regular Mat4).
     *
     * @returns {import('../core/math/mat4.js').Mat4} A duplicate matrix.
     */
    clone() {
        return new Mat4().set(Array.from(this.data));
    }

    /**
     * Reports whether two matrices are equal.
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} rhs - The other matrix.
     * @returns {boolean} True if the matrices are equal.
     */
    equals(rhs) {
        const l = this.data, r = rhs.data;
        return l[0] === r[0] && l[1] === r[1] && l[2] === r[2] && l[3] === r[3] &&
               l[4] === r[4] && l[5] === r[5] && l[6] === r[6] && l[7] === r[7] &&
               l[8] === r[8] && l[9] === r[9] && l[10] === r[10] && l[11] === r[11] &&
               l[12] === r[12] && l[13] === r[13] && l[14] === r[14] && l[15] === r[15];
    }

    /**
     * Reports whether this is the identity matrix.
     *
     * @returns {boolean} True if identity.
     */
    isIdentity() {
        const m = this.data;
        return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 0 &&
               m[4] === 0 && m[5] === 1 && m[6] === 0 && m[7] === 0 &&
               m[8] === 0 && m[9] === 0 && m[10] === 1 && m[11] === 0 &&
               m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1;
    }

    /**
     * Sets this matrix to the identity matrix.
     *
     * @returns {Mat4Proxy} Self for chaining.
     */
    setIdentity() {
        const m = this.data;
        m[0] = 1;  m[1] = 0;  m[2] = 0;  m[3] = 0;
        m[4] = 0;  m[5] = 1;  m[6] = 0;  m[7] = 0;
        m[8] = 0;  m[9] = 0;  m[10] = 1; m[11] = 0;
        m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
        return this;
    }

    /**
     * Multiplies two 4x4 matrices together and stores the result in this instance.
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} lhs - First multiplicand.
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} rhs - Second multiplicand.
     * @returns {Mat4Proxy} Self for chaining.
     */
    mul2(lhs, rhs) {
        const a = lhs.data;
        const b = rhs.data;
        const r = this.data;

        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        let b0, b1, b2, b3;

        b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
        r[0] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        r[1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        r[2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        r[3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        r[4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        r[5] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        r[6] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        r[7] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        r[8] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        r[9] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        r[10] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        r[11] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        r[12] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
        r[13] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
        r[14] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
        r[15] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;

        return this;
    }

    /**
     * Optimized multiply for affine transformation matrices (row 3 = [0,0,0,1]).
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} lhs - First multiplicand.
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} rhs - Second multiplicand.
     * @returns {Mat4Proxy} Self for chaining.
     */
    mulAffine2(lhs, rhs) {
        const a = lhs.data;
        const b = rhs.data;
        const r = this.data;

        const a00 = a[0], a01 = a[1], a02 = a[2];
        const a10 = a[4], a11 = a[5], a12 = a[6];
        const a20 = a[8], a21 = a[9], a22 = a[10];
        const a30 = a[12], a31 = a[13], a32 = a[14];

        let b0, b1, b2;

        b0 = b[0]; b1 = b[1]; b2 = b[2];
        r[0] = a00 * b0 + a10 * b1 + a20 * b2;
        r[1] = a01 * b0 + a11 * b1 + a21 * b2;
        r[2] = a02 * b0 + a12 * b1 + a22 * b2;
        r[3] = 0;

        b0 = b[4]; b1 = b[5]; b2 = b[6];
        r[4] = a00 * b0 + a10 * b1 + a20 * b2;
        r[5] = a01 * b0 + a11 * b1 + a21 * b2;
        r[6] = a02 * b0 + a12 * b1 + a22 * b2;
        r[7] = 0;

        b0 = b[8]; b1 = b[9]; b2 = b[10];
        r[8] = a00 * b0 + a10 * b1 + a20 * b2;
        r[9] = a01 * b0 + a11 * b1 + a21 * b2;
        r[10] = a02 * b0 + a12 * b1 + a22 * b2;
        r[11] = 0;

        b0 = b[12]; b1 = b[13]; b2 = b[14];
        r[12] = a00 * b0 + a10 * b1 + a20 * b2 + a30;
        r[13] = a01 * b0 + a11 * b1 + a21 * b2 + a31;
        r[14] = a02 * b0 + a12 * b1 + a22 * b2 + a32;
        r[15] = 1;

        return this;
    }

    /**
     * Multiplies this matrix by the specified 4x4 matrix.
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} rhs - Second multiplicand.
     * @returns {Mat4Proxy} Self for chaining.
     */
    mul(rhs) {
        return this.mul2(this, rhs);
    }

    /**
     * Sets this matrix to the concatenation of a translation, quaternion rotation and scale.
     *
     * @param {{x: number, y: number, z: number}} t - Translation.
     * @param {{x: number, y: number, z: number, w: number}} r - Rotation quaternion.
     * @param {{x: number, y: number, z: number}} s - Scale.
     * @returns {Mat4Proxy} Self for chaining.
     */
    setTRS(t, r, s) {
        const qx = r.x, qy = r.y, qz = r.z, qw = r.w;
        const sx = s.x, sy = s.y, sz = s.z;

        const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
        const xx = qx * x2, xy = qx * y2, xz = qx * z2;
        const yy = qy * y2, yz = qy * z2, zz = qz * z2;
        const wx = qw * x2, wy = qw * y2, wz = qw * z2;

        const m = this.data;
        m[0] = (1 - (yy + zz)) * sx;
        m[1] = (xy + wz) * sx;
        m[2] = (xz - wy) * sx;
        m[3] = 0;
        m[4] = (xy - wz) * sy;
        m[5] = (1 - (xx + zz)) * sy;
        m[6] = (yz + wx) * sy;
        m[7] = 0;
        m[8] = (xz + wy) * sz;
        m[9] = (yz - wx) * sz;
        m[10] = (1 - (xx + yy)) * sz;
        m[11] = 0;
        m[12] = t.x;
        m[13] = t.y;
        m[14] = t.z;
        m[15] = 1;

        return this;
    }

    /**
     * Sets this matrix to the inverse of a source matrix.
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} [src] - Matrix to invert. Defaults to self.
     * @returns {Mat4Proxy} Self for chaining.
     */
    invert(src = this) {
        const s = src.data;

        const a00 = s[0], a01 = s[1], a02 = s[2], a03 = s[3];
        const a10 = s[4], a11 = s[5], a12 = s[6], a13 = s[7];
        const a20 = s[8], a21 = s[9], a22 = s[10], a23 = s[11];
        const a30 = s[12], a31 = s[13], a32 = s[14], a33 = s[15];

        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;

        const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (det === 0) {
            this.setIdentity();
        } else {
            const invDet = 1 / det;
            const t = this.data;

            t[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
            t[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet;
            t[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
            t[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet;
            t[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet;
            t[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
            t[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet;
            t[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
            t[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
            t[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet;
            t[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
            t[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet;
            t[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet;
            t[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
            t[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet;
            t[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;
        }

        return this;
    }

    /**
     * Sets this matrix to the transpose of a source matrix.
     *
     * @param {Mat4Proxy|import('../core/math/mat4.js').Mat4} [src] - Matrix to transpose. Defaults to self.
     * @returns {Mat4Proxy} Self for chaining.
     */
    transpose(src = this) {
        const s = src.data;
        const t = this.data;

        if (s === t) {
            let tmp;
            tmp = s[1]; t[1] = s[4]; t[4] = tmp;
            tmp = s[2]; t[2] = s[8]; t[8] = tmp;
            tmp = s[3]; t[3] = s[12]; t[12] = tmp;
            tmp = s[6]; t[6] = s[9]; t[9] = tmp;
            tmp = s[7]; t[7] = s[13]; t[13] = tmp;
            tmp = s[11]; t[11] = s[14]; t[14] = tmp;
        } else {
            t[0] = s[0]; t[1] = s[4]; t[2] = s[8]; t[3] = s[12];
            t[4] = s[1]; t[5] = s[5]; t[6] = s[9]; t[7] = s[13];
            t[8] = s[2]; t[9] = s[6]; t[10] = s[10]; t[11] = s[14];
            t[12] = s[3]; t[13] = s[7]; t[14] = s[11]; t[15] = s[15];
        }

        return this;
    }

    /**
     * Extracts the translational component.
     *
     * @param {{set: Function}} [t] - Vec3-like to receive the translation.
     * @returns {{x: number, y: number, z: number}} The translation.
     */
    getTranslation(t) {
        if (!t) t = new Vec3();
        return t.set(this.data[12], this.data[13], this.data[14]);
    }

    /**
     * Extracts the x-axis.
     *
     * @param {{set: Function}} [v] - Vec3-like to receive the x axis.
     * @returns {{x: number, y: number, z: number}} The x-axis.
     */
    getX(v) {
        if (!v) v = new Vec3();
        return v.set(this.data[0], this.data[1], this.data[2]);
    }

    /**
     * Extracts the y-axis.
     *
     * @param {{set: Function}} [v] - Vec3-like to receive the y axis.
     * @returns {{x: number, y: number, z: number}} The y-axis.
     */
    getY(v) {
        if (!v) v = new Vec3();
        return v.set(this.data[4], this.data[5], this.data[6]);
    }

    /**
     * Extracts the z-axis.
     *
     * @param {{set: Function}} [v] - Vec3-like to receive the z axis.
     * @returns {{x: number, y: number, z: number}} The z-axis.
     */
    getZ(v) {
        if (!v) v = new Vec3();
        return v.set(this.data[8], this.data[9], this.data[10]);
    }

    /**
     * Extracts the scale component.
     *
     * @param {{set: Function}} [scale] - Vec3-like to receive the scale.
     * @returns {{x: number, y: number, z: number}} The scale.
     */
    getScale(scale) {
        if (!scale) scale = new Vec3();
        const m = this.data;
        return scale.set(
            Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]),
            Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]),
            Math.sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10])
        );
    }

    /**
     * -1 if the matrix has an odd number of negative scales (mirrored); 1 otherwise.
     *
     * @type {number}
     * @ignore
     */
    get scaleSign() {
        const m = this.data;
        // x-axis cross y-axis
        const cx = m[1] * m[6] - m[2] * m[5];
        const cy = m[2] * m[4] - m[0] * m[6];
        const cz = m[0] * m[5] - m[1] * m[4];
        // dot with z-axis
        const dot = cx * m[8] + cy * m[9] + cz * m[10];
        return dot < 0 ? -1 : 1;
    }

    /**
     * Extracts the Euler angles equivalent to the rotational portion.
     *
     * @param {{set: Function, mulScalar: Function}} [eulers] - Vec3-like to receive the Euler angles.
     * @returns {{x: number, y: number, z: number}} Euler angles in degrees.
     */
    getEulerAngles(eulers) {
        if (!eulers) eulers = new Vec3();
        this.getScale(eulers);
        const sx = eulers.x, sy = eulers.y, sz = eulers.z;

        if (sx === 0 || sy === 0 || sz === 0) {
            return eulers.set(0, 0, 0);
        }

        const m = this.data;
        const RAD_TO_DEG = 180 / Math.PI;

        const ry = Math.asin(-m[2] / sx);
        const halfPi = Math.PI * 0.5;

        let rx, rz;
        if (ry < halfPi) {
            if (ry > -halfPi) {
                rx = Math.atan2(m[6] / sy, m[10] / sz);
                rz = Math.atan2(m[1] / sx, m[0] / sx);
            } else {
                rz = 0;
                rx = -Math.atan2(m[4] / sy, m[5] / sy);
            }
        } else {
            rz = 0;
            rx = Math.atan2(m[4] / sy, m[5] / sy);
        }

        return eulers.set(rx * RAD_TO_DEG, ry * RAD_TO_DEG, rz * RAD_TO_DEG);
    }

    /**
     * Transforms a 3-dimensional point by this matrix.
     *
     * @param {{x: number, y: number, z: number}} vec - The point to transform.
     * @param {{x: number, y: number, z: number}} [res] - Optional result vector.
     * @returns {{x: number, y: number, z: number}} The transformed point.
     */
    transformPoint(vec, res) {
        if (!res) res = new Vec3();
        const m = this.data;
        const { x, y, z } = vec;
        res.x = x * m[0] + y * m[4] + z * m[8] + m[12];
        res.y = x * m[1] + y * m[5] + z * m[9] + m[13];
        res.z = x * m[2] + y * m[6] + z * m[10] + m[14];
        return res;
    }

    /**
     * Transforms a 3-dimensional vector by this matrix (no translation).
     *
     * @param {{x: number, y: number, z: number}} vec - The vector to transform.
     * @param {{x: number, y: number, z: number}} [res] - Optional result vector.
     * @returns {{x: number, y: number, z: number}} The transformed vector.
     */
    transformVector(vec, res) {
        if (!res) res = new Vec3();
        const m = this.data;
        const { x, y, z } = vec;
        res.x = x * m[0] + y * m[4] + z * m[8];
        res.y = x * m[1] + y * m[5] + z * m[9];
        res.z = x * m[2] + y * m[6] + z * m[10];
        return res;
    }

    /**
     * Transforms a 4-dimensional vector by this matrix.
     *
     * @param {{x: number, y: number, z: number, w: number}} vec - The vector to transform.
     * @param {{x: number, y: number, z: number, w: number}} [res] - Optional result vector.
     * @returns {{x: number, y: number, z: number, w: number}} The transformed vector.
     */
    transformVec4(vec, res) {
        if (!res) res = new Vec4();
        const m = this.data;
        const { x, y, z, w } = vec;
        res.x = x * m[0] + y * m[4] + z * m[8] + w * m[12];
        res.y = x * m[1] + y * m[5] + z * m[9] + w * m[13];
        res.z = x * m[2] + y * m[6] + z * m[10] + w * m[14];
        res.w = x * m[3] + y * m[7] + z * m[11] + w * m[15];
        return res;
    }

    /**
     * Converts this matrix to string form.
     *
     * @returns {string} The matrix in string form.
     */
    toString() {
        return `[${this.data.join(', ')}]`;
    }

    /** Update backing array reference after store grows */
    _rebind(data, offset) {
        this._data = data;
        this._offset = offset;
        this.data = data.subarray(offset, offset + 16);
    }
}
