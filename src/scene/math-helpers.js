/**
 * Array-native math helpers for SoA scene graph.
 * All functions operate directly on Float32Array regions by offset — zero allocation.
 *
 * @module SoaMath
 * @ignore
 */

/**
 * Build a 4x4 column-major matrix from interleaved TRS data.
 * Reads pos[3], quat[4], scale[3] from `src` at `srcOff`.
 * Writes 16 floats into `dst` at `dstOff`.
 *
 * @param {Float32Array} src - Source array with interleaved TRS.
 * @param {number} srcOff - Offset into source.
 * @param {Float32Array} dst - Destination array for 4x4 matrix.
 * @param {number} dstOff - Offset into destination.
 * @ignore
 */
function setTRSFromArray(src, srcOff, dst, dstOff) {
    const tx = src[srcOff];
    const ty = src[srcOff + 1];
    const tz = src[srcOff + 2];

    const qx = src[srcOff + 3];
    const qy = src[srcOff + 4];
    const qz = src[srcOff + 5];
    const qw = src[srcOff + 6];

    const sx = src[srcOff + 7];
    const sy = src[srcOff + 8];
    const sz = src[srcOff + 9];

    const x2 = qx + qx;
    const y2 = qy + qy;
    const z2 = qz + qz;
    const xx = qx * x2;
    const xy = qx * y2;
    const xz = qx * z2;
    const yy = qy * y2;
    const yz = qy * z2;
    const zz = qz * z2;
    const wx = qw * x2;
    const wy = qw * y2;
    const wz = qw * z2;

    dst[dstOff + 0] = (1 - (yy + zz)) * sx;
    dst[dstOff + 1] = (xy + wz) * sx;
    dst[dstOff + 2] = (xz - wy) * sx;
    dst[dstOff + 3] = 0;

    dst[dstOff + 4] = (xy - wz) * sy;
    dst[dstOff + 5] = (1 - (xx + zz)) * sy;
    dst[dstOff + 6] = (yz + wx) * sy;
    dst[dstOff + 7] = 0;

    dst[dstOff + 8] = (xz + wy) * sz;
    dst[dstOff + 9] = (yz - wx) * sz;
    dst[dstOff + 10] = (1 - (xx + yy)) * sz;
    dst[dstOff + 11] = 0;

    dst[dstOff + 12] = tx;
    dst[dstOff + 13] = ty;
    dst[dstOff + 14] = tz;
    dst[dstOff + 15] = 1;
}

/**
 * Compose a TRS matrix from scalar arguments.
 *
 * @param {number} tx - Position X.
 * @param {number} ty - Position Y.
 * @param {number} tz - Position Z.
 * @param {number} qx - Quaternion X.
 * @param {number} qy - Quaternion Y.
 * @param {number} qz - Quaternion Z.
 * @param {number} qw - Quaternion W.
 * @param {number} sx - Scale X.
 * @param {number} sy - Scale Y.
 * @param {number} sz - Scale Z.
 * @param {Float32Array} dst - Destination array for 4x4 matrix.
 * @param {number} dstOff - Offset into destination.
 * @ignore
 */
function setTRSScalars(tx, ty, tz, qx, qy, qz, qw, sx, sy, sz, dst, dstOff) {
	const x2 = qx + qx;
	const y2 = qy + qy;
	const z2 = qz + qz;
	const xx = qx * x2;
	const xy = qx * y2;
	const xz = qx * z2;
	const yy = qy * y2;
	const yz = qy * z2;
	const zz = qz * z2;
	const wx = qw * x2;
	const wy = qw * y2;
	const wz = qw * z2;

    dst[dstOff + 0] = (1 - (yy + zz)) * sx;
    dst[dstOff + 1] = (xy + wz) * sx;
    dst[dstOff + 2] = (xz - wy) * sx;
    dst[dstOff + 3] = 0;
    dst[dstOff + 4] = (xy - wz) * sy;
    dst[dstOff + 5] = (1 - (xx + zz)) * sy;
    dst[dstOff + 6] = (yz + wx) * sy;
    dst[dstOff + 7] = 0;
    dst[dstOff + 8] = (xz + wy) * sz;
    dst[dstOff + 9] = (yz - wx) * sz;
    dst[dstOff + 10] = (1 - (xx + yy)) * sz;
    dst[dstOff + 11] = 0;
    dst[dstOff + 12] = tx;
    dst[dstOff + 13] = ty;
    dst[dstOff + 14] = tz;
    dst[dstOff + 15] = 1;
}

/**
 * Multiply two 4x4 affine matrices in flat arrays.
 * result[rOff] = a[aOff] * b[bOff]. Assumes row 3 = [0,0,0,1].
 *
 * @param {Float32Array} a - Left matrix array.
 * @param {number} aOff - Offset into a.
 * @param {Float32Array} b - Right matrix array.
 * @param {number} bOff - Offset into b.
 * @param {Float32Array} r - Result matrix array.
 * @param {number} rOff - Offset into r.
 * @ignore
 */
function mulAffine2Arrays(a, aOff, b, bOff, r, rOff) {
  const a00 = a[aOff + 0];
  const a01 = a[aOff + 1];
  const a02 = a[aOff + 2];
  const a10 = a[aOff + 4];
  const a11 = a[aOff + 5];
  const a12 = a[aOff + 6];
  const a20 = a[aOff + 8];
  const a21 = a[aOff + 9];
  const a22 = a[aOff + 10];
  const a30 = a[aOff + 12];
  const a31 = a[aOff + 13];
  const a32 = a[aOff + 14];

  let b0;
  let b1;
  let b2;

  b0 = b[bOff + 0];
  b1 = b[bOff + 1];
  b2 = b[bOff + 2];
  r[rOff + 0] = a00 * b0 + a10 * b1 + a20 * b2;
  r[rOff + 1] = a01 * b0 + a11 * b1 + a21 * b2;
  r[rOff + 2] = a02 * b0 + a12 * b1 + a22 * b2;
  r[rOff + 3] = 0;

  b0 = b[bOff + 4];
  b1 = b[bOff + 5];
  b2 = b[bOff + 6];
  r[rOff + 4] = a00 * b0 + a10 * b1 + a20 * b2;
  r[rOff + 5] = a01 * b0 + a11 * b1 + a21 * b2;
  r[rOff + 6] = a02 * b0 + a12 * b1 + a22 * b2;
  r[rOff + 7] = 0;

  b0 = b[bOff + 8];
  b1 = b[bOff + 9];
  b2 = b[bOff + 10];
  r[rOff + 8] = a00 * b0 + a10 * b1 + a20 * b2;
  r[rOff + 9] = a01 * b0 + a11 * b1 + a21 * b2;
  r[rOff + 10] = a02 * b0 + a12 * b1 + a22 * b2;
  r[rOff + 11] = 0;

  b0 = b[bOff + 12];
  b1 = b[bOff + 13];
  b2 = b[bOff + 14];
  r[rOff + 12] = a00 * b0 + a10 * b1 + a20 * b2 + a30;
  r[rOff + 13] = a01 * b0 + a11 * b1 + a21 * b2 + a31;
  r[rOff + 14] = a02 * b0 + a12 * b1 + a22 * b2 + a32;
  r[rOff + 15] = 1;
}

/**
 * Extract scale (column lengths) from a 4x4 matrix.
 *
 * @param {Float32Array} m - Matrix array.
 * @param {number} off - Offset.
 * @param {Float32Array} out - Output array (3 floats).
 * @param {number} outOff - Offset into output.
 * @ignore
 */
function extractScale(m, off, out, outOff) {
    out[outOff] = Math.sqrt(m[off] * m[off] + m[off + 1] * m[off + 1] + m[off + 2] * m[off + 2]);
    out[outOff + 1] = Math.sqrt(m[off + 4] * m[off + 4] + m[off + 5] * m[off + 5] + m[off + 6] * m[off + 6]);
    out[outOff + 2] = Math.sqrt(m[off + 8] * m[off + 8] + m[off + 9] * m[off + 9] + m[off + 10] * m[off + 10]);
}

/**
 * Extract rotation quaternion from a 4x4 matrix. Uses Shepperd's method.
 *
 * @param {Float32Array} m - Matrix array.
 * @param {number} off - Offset.
 * @param {Float32Array} out - Output quaternion (x,y,z,w).
 * @param {number} outOff - Offset into output.
 * @ignore
 */
function extractRotationQuat(m, off, out, outOff) {
    const sx = Math.sqrt(m[off] * m[off] + m[off + 1] * m[off + 1] + m[off + 2] * m[off + 2]);
    const sy = Math.sqrt(m[off + 4] * m[off + 4] + m[off + 5] * m[off + 5] + m[off + 6] * m[off + 6]);
    const sz = Math.sqrt(m[off + 8] * m[off + 8] + m[off + 9] * m[off + 9] + m[off + 10] * m[off + 10]);

    const isx = sx > 0 ? 1 / sx : 0;
    const isy = sy > 0 ? 1 / sy : 0;
    const isz = sz > 0 ? 1 / sz : 0;

    const m00 = m[off] * isx, m01 = m[off + 1] * isx, m02 = m[off + 2] * isx;
    const m10 = m[off + 4] * isy, m11 = m[off + 5] * isy, m12 = m[off + 6] * isy;
    const m20 = m[off + 8] * isz, m21 = m[off + 9] * isz, m22 = m[off + 10] * isz;

    const trace = m00 + m11 + m22;
    let s;
    if (trace > 0) {
        s = 0.5 / Math.sqrt(trace + 1);
        out[outOff + 3] = 0.25 / s;
        out[outOff] = (m12 - m21) * s;
        out[outOff + 1] = (m20 - m02) * s;
        out[outOff + 2] = (m01 - m10) * s;
    } else if (m00 > m11 && m00 > m22) {
        s = 2 * Math.sqrt(1 + m00 - m11 - m22);
        out[outOff + 3] = (m12 - m21) / s;
        out[outOff] = 0.25 * s;
        out[outOff + 1] = (m01 + m10) / s;
        out[outOff + 2] = (m20 + m02) / s;
    } else if (m11 > m22) {
        s = 2 * Math.sqrt(1 + m11 - m00 - m22);
        out[outOff + 3] = (m20 - m02) / s;
        out[outOff] = (m01 + m10) / s;
        out[outOff + 1] = 0.25 * s;
        out[outOff + 2] = (m12 + m21) / s;
    } else {
        s = 2 * Math.sqrt(1 + m22 - m00 - m11);
        out[outOff + 3] = (m01 - m10) / s;
        out[outOff] = (m20 + m02) / s;
        out[outOff + 1] = (m12 + m21) / s;
        out[outOff + 2] = 0.25 * s;
    }
}

/**
 * Transform a point by a 4x4 matrix.
 *
 * @param {Float32Array} m - Matrix array.
 * @param {number} mOff - Offset into matrix.
 * @param {Float32Array} p - Point array.
 * @param {number} pOff - Offset into point.
 * @param {Float32Array} out - Output point.
 * @param {number} oOff - Offset into output.
 * @ignore
 */
function transformPointArray(m, mOff, p, pOff, out, oOff) {
    const x = p[pOff], y = p[pOff + 1], z = p[pOff + 2];
    out[oOff] = m[mOff] * x + m[mOff + 4] * y + m[mOff + 8] * z + m[mOff + 12];
    out[oOff + 1] = m[mOff + 1] * x + m[mOff + 5] * y + m[mOff + 9] * z + m[mOff + 13];
    out[oOff + 2] = m[mOff + 2] * x + m[mOff + 6] * y + m[mOff + 10] * z + m[mOff + 14];
}

/**
 * Full 4x4 matrix inversion.
 *
 * @param {Float32Array} src - Source matrix array.
 * @param {number} sOff - Source offset.
 * @param {Float32Array} dst - Destination matrix array.
 * @param {number} dOff - Destination offset.
 * @ignore
 */
function invertAffine(src, sOff, dst, dOff) {
	const a00 = src[sOff + 0];
	const a01 = src[sOff + 1];
	const a02 = src[sOff + 2];
	const a03 = src[sOff + 3];
	const a10 = src[sOff + 4];
	const a11 = src[sOff + 5];
	const a12 = src[sOff + 6];
	const a13 = src[sOff + 7];
	const a20 = src[sOff + 8];
	const a21 = src[sOff + 9];
	const a22 = src[sOff + 10];
	const a23 = src[sOff + 11];
	const a30 = src[sOff + 12];
	const a31 = src[sOff + 13];
	const a32 = src[sOff + 14];
	const a33 = src[sOff + 15];
  
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
	  dst.fill(0, dOff, dOff + 16);
	  dst[dOff] = dst[dOff + 5] = dst[dOff + 10] = dst[dOff + 15] = 1;
	  return;
	}
	const inv = 1 / det;
  
	dst[dOff + 0] = (a11 * b11 - a12 * b10 + a13 * b09) * inv;
	dst[dOff + 1] = (-a01 * b11 + a02 * b10 - a03 * b09) * inv;
	dst[dOff + 2] = (a31 * b05 - a32 * b04 + a33 * b03) * inv;
	dst[dOff + 3] = (-a21 * b05 + a22 * b04 - a23 * b03) * inv;
	dst[dOff + 4] = (-a10 * b11 + a12 * b08 - a13 * b07) * inv;
	dst[dOff + 5] = (a00 * b11 - a02 * b08 + a03 * b07) * inv;
	dst[dOff + 6] = (-a30 * b05 + a32 * b02 - a33 * b01) * inv;
	dst[dOff + 7] = (a20 * b05 - a22 * b02 + a23 * b01) * inv;
	dst[dOff + 8] = (a10 * b10 - a11 * b08 + a13 * b06) * inv;
	dst[dOff + 9] = (-a00 * b10 + a01 * b08 - a03 * b06) * inv;
	dst[dOff + 10] = (a30 * b04 - a31 * b02 + a33 * b00) * inv;
	dst[dOff + 11] = (-a20 * b04 + a21 * b02 - a23 * b00) * inv;
	dst[dOff + 12] = (-a10 * b09 + a11 * b07 - a12 * b06) * inv;
	dst[dOff + 13] = (a00 * b09 - a01 * b07 + a02 * b06) * inv;
	dst[dOff + 14] = (-a30 * b03 + a31 * b01 - a32 * b00) * inv;
	dst[dOff + 15] = (a20 * b03 - a21 * b01 + a22 * b00) * inv;
}

export {
    setTRSFromArray,
    setTRSScalars,
    mulAffine2Arrays,
    extractScale,
    extractRotationQuat,
    transformPointArray,
    invertAffine
};
