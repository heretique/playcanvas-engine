import { Debug } from '../../../core/debug.js';

import {
    PIXELFORMAT_A8, PIXELFORMAT_L8, PIXELFORMAT_LA8, PIXELFORMAT_RGB565, PIXELFORMAT_RGBA5551, PIXELFORMAT_RGBA4,
    PIXELFORMAT_RGB8, PIXELFORMAT_RGBA8, PIXELFORMAT_DXT1, PIXELFORMAT_DXT3, PIXELFORMAT_DXT5,
    PIXELFORMAT_RGB16F, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGB32F, PIXELFORMAT_RGBA32F, PIXELFORMAT_R32F, PIXELFORMAT_DEPTH,
    PIXELFORMAT_DEPTHSTENCIL, PIXELFORMAT_111110F, PIXELFORMAT_SRGB, PIXELFORMAT_SRGBA, PIXELFORMAT_ETC1,
    PIXELFORMAT_ETC2_RGB, PIXELFORMAT_ETC2_RGBA, PIXELFORMAT_PVRTC_2BPP_RGB_1, PIXELFORMAT_PVRTC_2BPP_RGBA_1,
    PIXELFORMAT_PVRTC_4BPP_RGB_1, PIXELFORMAT_PVRTC_4BPP_RGBA_1, PIXELFORMAT_ASTC_4x4, PIXELFORMAT_ATC_RGB,
    PIXELFORMAT_ATC_RGBA, PIXELFORMAT_BGRA8, PIXELFORMAT_R8I, PIXELFORMAT_R8U, PIXELFORMAT_R16I, PIXELFORMAT_R16U,
    PIXELFORMAT_R32I, PIXELFORMAT_R32U, PIXELFORMAT_RG16I, PIXELFORMAT_RG16U, PIXELFORMAT_RG32I, PIXELFORMAT_RG32U,
    PIXELFORMAT_RG8I, PIXELFORMAT_RG8U, PIXELFORMAT_RGBA16I, PIXELFORMAT_RGBA16U, PIXELFORMAT_RGBA32I, PIXELFORMAT_RGBA32U,
    PIXELFORMAT_RGBA8I, PIXELFORMAT_RGBA8U, PIXELFORMAT_R16F, PIXELFORMAT_RG16F, PIXELFORMAT_R8, PIXELFORMAT_RG8,
    TEXTUREDIMENSION_2D,
    TEXTUREDIMENSION_3D,
    TEXTUREDIMENSION_CUBE,
    TEXTUREDIMENSION_2D_ARRAY
} from '../constants.js';
import { TEXTURE_OPERATION_NONE, TEXTURE_OPERATION_UPLOAD, TEXTURE_OPERATION_UPLOAD_PARTIAL } from '../texture.js';

/**
 * Checks that an image's width and height do not exceed the max texture size. If they do, it will
 * be scaled down to that maximum size and returned as a canvas element.
 *
 * @param {HTMLImageElement} image - The image to downsample.
 * @param {number} size - The maximum allowed size of the image.
 * @returns {HTMLImageElement|HTMLCanvasElement} The downsampled image.
 * @ignore
 */
function downsampleImage(image, size) {
    const srcW = image.width;
    const srcH = image.height;

    if ((srcW > size) || (srcH > size)) {
        const scale = size / Math.max(srcW, srcH);
        const dstW = Math.floor(srcW * scale);
        const dstH = Math.floor(srcH * scale);

        Debug.warn(`Image dimensions larger than max supported texture size of ${size}. Resizing from ${srcW}, ${srcH} to ${dstW}, ${dstH}.`);

        const canvas = document.createElement('canvas');
        canvas.width = dstW;
        canvas.height = dstH;

        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, srcW, srcH, 0, 0, dstW, dstH);

        return canvas;
    }

    return image;
}

/**
 * A WebGL implementation of the Texture.
 *
 * @ignore
 */
class WebglTexture {
    _glTexture = null;

    _glTarget;

    _glFormat;

    _glInternalFormat;

    _glPixelType;

    _glCreated;

    dirtyParameterFlags = 0;

    constructor(texture) {
        /** @type {import('../texture.js').Texture} */
        this.texture = texture;
    }

    destroy(device) {
        if (this._glTexture) {

            // Update shadowed texture unit state to remove texture from any units
            for (let i = 0; i < device.textureUnits.length; i++) {
                const textureUnit = device.textureUnits[i];
                for (let j = 0; j < textureUnit.length; j++) {
                    if (textureUnit[j] === this._glTexture) {
                        textureUnit[j] = null;
                    }
                }
            }

            // release WebGL texture resource
            device.gl.deleteTexture(this._glTexture);
            this._glTexture = null;
        }
    }

    loseContext() {
        this._glTexture = null;
    }

    propertyChanged(flag) {
        this.dirtyParameterFlags |= flag;
    }

    initialize(device, texture) {

        const gl = device.gl;

        this._glTexture = gl.createTexture();

        this._glTarget = texture.cubemap ? gl.TEXTURE_CUBE_MAP :
            (texture.volume ? gl.TEXTURE_3D :
                (texture.array ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D));

        switch (texture._format) {
            case PIXELFORMAT_A8:
                this._glFormat = gl.ALPHA;
                this._glInternalFormat = gl.ALPHA;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_L8:
                this._glFormat = gl.LUMINANCE;
                this._glInternalFormat = gl.LUMINANCE;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_LA8:
                this._glFormat = gl.LUMINANCE_ALPHA;
                this._glInternalFormat = gl.LUMINANCE_ALPHA;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_R8:
                this._glFormat = gl.RED;
                this._glInternalFormat = gl.R8;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;

            case PIXELFORMAT_RG8:
                this._glFormat = gl.RG;
                this._glInternalFormat = gl.RG8;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_RGB565:
                this._glFormat = gl.RGB;
                this._glInternalFormat = gl.RGB;
                this._glPixelType = gl.UNSIGNED_SHORT_5_6_5;
                break;
            case PIXELFORMAT_RGBA5551:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = gl.RGBA;
                this._glPixelType = gl.UNSIGNED_SHORT_5_5_5_1;
                break;
            case PIXELFORMAT_RGBA4:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = gl.RGBA;
                this._glPixelType = gl.UNSIGNED_SHORT_4_4_4_4;
                break;
            case PIXELFORMAT_RGB8:
                this._glFormat = gl.RGB;
                this._glInternalFormat = gl.RGB8;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_RGBA8:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = gl.RGBA8;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_DXT1:
                this._glFormat = gl.RGB;
                this._glInternalFormat = device.extCompressedTextureS3TC.COMPRESSED_RGB_S3TC_DXT1_EXT;
                break;
            case PIXELFORMAT_DXT3:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT3_EXT;
                break;
            case PIXELFORMAT_DXT5:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT5_EXT;
                break;
            case PIXELFORMAT_ETC1:
                this._glFormat = gl.RGB;
                this._glInternalFormat = device.extCompressedTextureETC1.COMPRESSED_RGB_ETC1_WEBGL;
                break;
            case PIXELFORMAT_PVRTC_2BPP_RGB_1:
                this._glFormat = gl.RGB;
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;
                break;
            case PIXELFORMAT_PVRTC_2BPP_RGBA_1:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG;
                break;
            case PIXELFORMAT_PVRTC_4BPP_RGB_1:
                this._glFormat = gl.RGB;
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;
                break;
            case PIXELFORMAT_PVRTC_4BPP_RGBA_1:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;
                break;
            case PIXELFORMAT_ETC2_RGB:
                this._glFormat = gl.RGB;
                this._glInternalFormat = device.extCompressedTextureETC.COMPRESSED_RGB8_ETC2;
                break;
            case PIXELFORMAT_ETC2_RGBA:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTextureETC.COMPRESSED_RGBA8_ETC2_EAC;
                break;
            case PIXELFORMAT_ASTC_4x4:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTextureASTC.COMPRESSED_RGBA_ASTC_4x4_KHR;
                break;
            case PIXELFORMAT_ATC_RGB:
                this._glFormat = gl.RGB;
                this._glInternalFormat = device.extCompressedTextureATC.COMPRESSED_RGB_ATC_WEBGL;
                break;
            case PIXELFORMAT_ATC_RGBA:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = device.extCompressedTextureATC.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL;
                break;
            case PIXELFORMAT_R16F:
                this._glFormat = gl.RED;
                this._glInternalFormat = gl.R16F;
                this._glPixelType = gl.HALF_FLOAT;
                break;
            case PIXELFORMAT_RG16F:
                this._glFormat = gl.RG;
                this._glInternalFormat = gl.RG16F;
                this._glPixelType = gl.HALF_FLOAT;
                break;
            case PIXELFORMAT_RGB16F:
                this._glFormat = gl.RGB;
                this._glInternalFormat = gl.RGB16F;
                this._glPixelType = gl.HALF_FLOAT;
                break;
            case PIXELFORMAT_RGBA16F:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = gl.RGBA16F;
                this._glPixelType = gl.HALF_FLOAT;
                break;
            case PIXELFORMAT_RGB32F:
                this._glFormat = gl.RGB;
                this._glInternalFormat = gl.RGB32F;
                this._glPixelType = gl.FLOAT;
                break;
            case PIXELFORMAT_RGBA32F:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = gl.RGBA32F;
                this._glPixelType = gl.FLOAT;
                break;
            case PIXELFORMAT_R32F:
                this._glFormat = gl.RED;
                this._glInternalFormat = gl.R32F;
                this._glPixelType = gl.FLOAT;
                break;
            case PIXELFORMAT_DEPTH:
                this._glFormat = gl.DEPTH_COMPONENT;
                this._glInternalFormat = gl.DEPTH_COMPONENT32F; // should allow 16/24 bits?
                this._glPixelType = gl.FLOAT;
                break;
            case PIXELFORMAT_DEPTHSTENCIL:
                this._glFormat = gl.DEPTH_STENCIL;
                this._glInternalFormat = gl.DEPTH24_STENCIL8;
                this._glPixelType = gl.UNSIGNED_INT_24_8;
                break;
            case PIXELFORMAT_111110F:
                this._glFormat = gl.RGB;
                this._glInternalFormat = gl.R11F_G11F_B10F;
                this._glPixelType = gl.UNSIGNED_INT_10F_11F_11F_REV;
                break;
            case PIXELFORMAT_SRGB:
                this._glFormat = gl.RGB;
                this._glInternalFormat = gl.SRGB8;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_SRGBA:
                this._glFormat = gl.RGBA;
                this._glInternalFormat = gl.SRGB8_ALPHA8;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;

            // Integer texture formats (R)
            case PIXELFORMAT_R8I:
                this._glFormat = gl.RED_INTEGER;
                this._glInternalFormat = gl.R8I;
                this._glPixelType = gl.BYTE;
                break;
            case PIXELFORMAT_R8U:
                this._glFormat = gl.RED_INTEGER;
                this._glInternalFormat = gl.R8UI;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_R16I:
                this._glFormat = gl.RED_INTEGER;
                this._glInternalFormat = gl.R16I;
                this._glPixelType = gl.SHORT;
                break;
            case PIXELFORMAT_R16U:
                this._glFormat = gl.RED_INTEGER;
                this._glInternalFormat = gl.R16UI;
                this._glPixelType = gl.UNSIGNED_SHORT;
                break;
            case PIXELFORMAT_R32I:
                this._glFormat = gl.RED_INTEGER;
                this._glInternalFormat = gl.R32I;
                this._glPixelType = gl.INT;
                break;
            case PIXELFORMAT_R32U:
                this._glFormat = gl.RED_INTEGER;
                this._glInternalFormat = gl.R32UI;
                this._glPixelType = gl.UNSIGNED_INT;
                break;

            // Integer texture formats (RG)
            case PIXELFORMAT_RG8I:
                this._glFormat = gl.RG_INTEGER;
                this._glInternalFormat = gl.RG8I;
                this._glPixelType = gl.BYTE;
                break;
            case PIXELFORMAT_RG8U:
                this._glFormat = gl.RG_INTEGER;
                this._glInternalFormat = gl.RG8UI;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_RG16I:
                this._glFormat = gl.RG_INTEGER;
                this._glInternalFormat = gl.RG16I;
                this._glPixelType = gl.SHORT;
                break;
            case PIXELFORMAT_RG16U:
                this._glFormat = gl.RG_INTEGER;
                this._glInternalFormat = gl.RG16UI;
                this._glPixelType = gl.UNSIGNED_SHORT;
                break;
            case PIXELFORMAT_RG32I:
                this._glFormat = gl.RG_INTEGER;
                this._glInternalFormat = gl.RG32I;
                this._glPixelType = gl.INT;
                break;
            case PIXELFORMAT_RG32U:
                this._glFormat = gl.RG_INTEGER;
                this._glInternalFormat = gl.RG32UI;
                this._glPixelType = gl.UNSIGNED_INT;
                break;

            // Integer texture formats (RGBA)
            case PIXELFORMAT_RGBA8I:
                this._glFormat = gl.RGBA_INTEGER;
                this._glInternalFormat = gl.RGBA8I;
                this._glPixelType = gl.BYTE;
                break;
            case PIXELFORMAT_RGBA8U:
                this._glFormat = gl.RGBA_INTEGER;
                this._glInternalFormat = gl.RGBA8UI;
                this._glPixelType = gl.UNSIGNED_BYTE;
                break;
            case PIXELFORMAT_RGBA16I:
                this._glFormat = gl.RGBA_INTEGER;
                this._glInternalFormat = gl.RGBA16I;
                this._glPixelType = gl.SHORT;
                break;
            case PIXELFORMAT_RGBA16U:
                this._glFormat = gl.RGBA_INTEGER;
                this._glInternalFormat = gl.RGBA16UI;
                this._glPixelType = gl.UNSIGNED_SHORT;
                break;
            case PIXELFORMAT_RGBA32I:
                this._glFormat = gl.RGBA_INTEGER;
                this._glInternalFormat = gl.RGBA32I;
                this._glPixelType = gl.INT;
                break;
            case PIXELFORMAT_RGBA32U:
                this._glFormat = gl.RGBA_INTEGER;
                this._glInternalFormat = gl.RGBA32UI;
                this._glPixelType = gl.UNSIGNED_INT;
                break;
            case PIXELFORMAT_BGRA8:
                Debug.error("BGRA8 texture format is not supported by WebGL.");
                break;
        }

        this._glCreated = false;
    }

    uploadImmediate(device, texture, immediate) {
        if (immediate) {
            if (!this._glTexture) {
                this.initialize(device, texture);
            }

            device.bindTexture(texture);
            this.upload(device, texture);
        }
    }

    uploadTexture2D(device, texture, mipLevel, mipObject) {
        const gl = device.gl;
                        // ----- 2D -----
        if (device._isBrowserInterface(mipObject)) {
                            // Downsize images that are too large to be used as textures
            if (device._isImageBrowserInterface(mipObject)) {
                if (mipObject.width > device.maxTextureSize || mipObject.height > device.maxTextureSize) {
                    mipObject = downsampleImage(mipObject, device.maxTextureSize);
                    if (mipLevel === 0) {
                        texture._width = mipObject.width;
                        texture._height = mipObject.height;
                    }
                }
            }

            const w = mipObject.width || mipObject.videoWidth;
            const h = mipObject.height || mipObject.videoHeight;

                            // Upload the image, canvas or video
            device.setUnpackFlipY(texture._flipY);
            device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha);

                            // TEMP: disable fast path for video updates until
                            // https://bugs.chromium.org/p/chromium/issues/detail?id=1511207 is resolved
            if (this._glCreated && texture._width === w && texture._height === h && !device._isImageVideoInterface(mipObject)) {
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    mipLevel,
                    0, 0,
                    this._glFormat,
                    this._glPixelType,
                    mipObject
                );
            } else {
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    mipLevel,
                    this._glInternalFormat,
                    this._glFormat,
                    this._glPixelType,
                    mipObject
                );
                this._glCreated = true;

                if (mipLevel === 0) {
                    texture._width = w;
                    texture._height = h;
                }
            }
        } else {
                            // Upload the byte array
            const resMult = 1 / Math.pow(2, mipLevel);
            if (texture._compressed) {
                if (this._glCreated && mipObject) {
                    gl.compressedTexSubImage2D(
                        gl.TEXTURE_2D,
                        mipLevel,
                        0, 0,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        this._glInternalFormat,
                        mipObject
                    );
                } else {
                    gl.compressedTexImage2D(
                        gl.TEXTURE_2D,
                        mipLevel,
                        this._glInternalFormat,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        0,
                        mipObject
                    );
                    this._glCreated = true;
                }
            } else {
                device.setUnpackFlipY(false);
                device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha);
                if (this._glCreated && mipObject) {
                    gl.texSubImage2D(
                        gl.TEXTURE_2D,
                        mipLevel,
                        0, 0,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        this._glFormat,
                        this._glPixelType,
                        mipObject
                    );
                } else {
                    gl.texImage2D(
                        gl.TEXTURE_2D,
                        mipLevel,
                        this._glInternalFormat,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        0,
                        this._glFormat,
                        this._glPixelType,
                        mipObject
                    );
                    this._glCreated = true;
                }
            }
        }
    }

    uploadTexture3D(device, texture, mipLevel, mipObject) {
        const gl = device.gl;
        const resMult = 1 / Math.pow(2, mipLevel);
        // Image/canvas/video not supported (yet?)
        // Upload the byte array
        if (texture._compressed) {
            gl.compressedTexImage3D(gl.TEXTURE_3D,
                                    mipLevel,
                                    this._glInternalFormat,
                                    Math.max(Math.floor(texture._width * resMult), 1),
                                    Math.max(Math.floor(texture._height * resMult), 1),
                                    Math.max(Math.floor(texture._slices * resMult), 1),
                                    0,
                                    mipObject);
        } else {
            device.setUnpackFlipY(false);
            device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha);
            gl.texImage3D(gl.TEXTURE_3D,
                          mipLevel,
                          this._glInternalFormat,
                          Math.max(Math.floor(texture._width * resMult), 1),
                          Math.max(Math.floor(texture._height * resMult), 1),
                          Math.max(Math.floor(texture._slices * resMult), 1),
                          0,
                          this._glFormat,
                          this._glPixelType,
                          mipObject);
            this._glCreated = true;
        }

    }

    uploadTextureCube(device, texture, mipLevel, face, faceObject) {
        const gl = device.gl;
        // Upload the image, canvas or video
        if (device._isBrowserInterface(faceObject)) {
            // Downsize images that are too large to be used as cube maps
            if (device._isImageBrowserInterface(faceObject)) {
                if (faceObject.width > device.maxCubeMapSize || faceObject.height > device.maxCubeMapSize) {
                    faceObject = downsampleImage(faceObject, device.maxCubeMapSize);
                    if (mipLevel === 0) {
                        texture._width = faceObject.width;
                        texture._height = faceObject.height;
                    }
                }
            }

            device.setUnpackFlipY(false);
            device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha);

            if (this._glCreated) {
                gl.texSubImage2D(
                    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                    mipLevel,
                    0, 0,
                    this._glFormat,
                    this._glPixelType,
                    faceObject
                );
            } else {
                gl.texImage2D(
                    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                    mipLevel,
                    this._glInternalFormat,
                    this._glFormat,
                    this._glPixelType,
                    faceObject
                );
            }
        } else {
                            // Upload the byte array
            const resMult = 1 / Math.pow(2, mipLevel);
            if (texture._compressed) {
                if (this._glCreated && faceObject) {
                    gl.compressedTexSubImage2D(
                        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                        mipLevel,
                        0, 0,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        this._glInternalFormat,
                        faceObject);
                } else {
                    gl.compressedTexImage2D(
                        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                        mipLevel,
                        this._glInternalFormat,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        0,
                        faceObject
                    );
                }
            } else {
                device.setUnpackFlipY(false);
                device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha);
                if (this._glCreated && faceObject) {
                    gl.texSubImage2D(
                        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                        mipLevel,
                        0, 0,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        this._glFormat,
                        this._glPixelType,
                        faceObject
                    );
                } else {
                    gl.texImage2D(
                        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                        mipLevel,
                        this._glInternalFormat,
                        Math.max(Math.floor(texture._width * resMult), 1),
                        Math.max(Math.floor(texture._height * resMult), 1),
                        0,
                        this._glFormat,
                        this._glPixelType,
                        faceObject
                    );
                }
            }
        }
    }

    uploadTextureArray(device, texture, requiredMipLevels, mipLevel, slice, sliceObject) {
        const gl = device.gl;

        if (!this._glCreated) {
            // for texture arrays we reserve the space first time we upload
            gl.texStorage3D(gl.TEXTURE_2D_ARRAY,
                            requiredMipLevels,
                            this._glInternalFormat,
                            texture._width,
                            texture._height,
                            texture._slices);
            this._glCreated = true;
        }

        const resMult = 1 / Math.pow(2, mipLevel);
        if (texture._compressed) {
            gl.compressedTexSubImage3D(
                gl.TEXTURE_2D_ARRAY,
                mipLevel,
                0,
                0,
                slice,
                Math.max(Math.floor(texture._width * resMult), 1),
                Math.max(Math.floor(texture._height * resMult), 1),
                1,
                this._glFormat,
                sliceObject
            );
        } else {
            gl.texSubImage3D(
                gl.TEXTURE_2D_ARRAY,
                mipLevel,
                0,
                0,
                slice,
                Math.max(Math.floor(texture._width * resMult), 1),
                Math.max(Math.floor(texture._height * resMult), 1),
                1,
                this._glFormat,
                this._glPixelType,
                sliceObject
            );
        }
    }

    /**
     * @param {import('./webgl-graphics-device.js').WebglGraphicsDevice} device - The device.
     * @param {import('../texture.js').Texture} texture - The texture to update.
     */
    upload(device, texture) {

        Debug.assert(texture.device, "Attempting to use a texture that has been destroyed.", texture);


        if (texture._operation === TEXTURE_OPERATION_NONE)
            return;

        const gl = device.gl;
        const requiredMipLevels = texture.requiredMipLevels;

        let anyUploads = false;
        let anyLevelMissing = false;

        // partial uploads are most common for texture arrays (maybe cubemaps too?)
        if (texture._operation & TEXTURE_OPERATION_UPLOAD_PARTIAL || texture._dirtyLevels.size > 0) {
            // we track slices from level 0 that are dirty
            // if we don't have a full set of mips uploaded by the end, we need to to generate all mips for those slices
            // otherwise we assume that developer knows what he is doing and only wants to upload the dirty slices
            const mipmapTracking = {};
            for (const [dirtyLevel, dirtySlices] of texture._dirtyLevels) {
                if (texture.array || texture.cubemap) {
                    Debug.assert(typeof dirtySlices !== 'boolean', "Invalid dirty slices for texture array or cubemap.");
                    for (const dirtySlice of dirtySlices) {
                        if (dirtyLevel === 0) {
                            mipmapTracking[dirtySlice] = 0;
                        }
                        const sliceObject = texture._levels.get(dirtyLevel).get(dirtySlice);
                        if (sliceObject) {
                            if (mipmapTracking[dirtySlice] !== undefined) {
                                mipmapTracking[dirtySlice]++;
                            }
                            switch (texture._dimension) {
                                case TEXTUREDIMENSION_CUBE:
                                    this.uploadTextureCube(device, texture, dirtyLevel, dirtySlice, sliceObject);
                                    break;
                                case TEXTUREDIMENSION_2D_ARRAY:
                                    this.uploadTextureArray(device, texture, requiredMipLevels, dirtyLevel, dirtySlice, sliceObject);
                                    break;
                            }
                        }
                    }
                } else {
                    const mipObject = texture._levels.get(dirtyLevel);
                    if (mipObject) {
                        if (dirtyLevel === 0) {
                            // we only have one slice for 2D textures or 3D textures
                            mipmapTracking[0] = 0;
                        }
                        switch (texture._dimension) {
                            case TEXTUREDIMENSION_2D:
                                this.uploadTexture2D(device, texture, dirtyLevel, mipObject);
                                break;
                            case TEXTUREDIMENSION_3D:
                                this.uploadTexture3D(device, texture, dirtyLevel, mipObject);
                                break;
                        }
                        if (mipmapTracking[0] !== undefined) {
                            mipmapTracking[0]++;
                        }
                    }
                }
            }

            this.generateMipmapsIfNeeded(device, texture, mipmapTracking);

        } else if (texture._operation & TEXTURE_OPERATION_UPLOAD) {

            for (let mipLevel = 0; mipLevel < requiredMipLevels; mipLevel++) {
                const mipObject = texture._levels.get(mipLevel);

                switch (texture._dimension) {
                    case TEXTUREDIMENSION_2D:
                        this.uploadTexture2D(device, texture, mipLevel, mipObject);
                        anyUploads = true;
                        break;
                    case TEXTUREDIMENSION_3D:
                        this.uploadTexture3D(device, texture, mipLevel, mipObject);
                        anyUploads = true;
                        break;
                    case TEXTUREDIMENSION_CUBE:
                        if (mipObject) {
                            for (let slice = 0; slice < texture.slices; slice++) {
                                const sliceObject = mipObject.get(slice);
                                if (sliceObject) {
                                    this.uploadTextureCube(device, texture, mipLevel, slice, sliceObject);
                                    anyUploads = true;
                                } else {
                                    anyLevelMissing = true;
                                }
                            }
                        } else {
                            anyLevelMissing = true;
                        }
                        break;
                    case TEXTUREDIMENSION_2D_ARRAY:
                        if (mipObject) {
                            for (let slice = 0; slice < texture.slices; slice++) {
                                const sliceObject = mipObject.get(slice);
                                if (sliceObject) {
                                    this.uploadTextureArray(device, texture, requiredMipLevels, mipLevel, slice, sliceObject);
                                    anyUploads = true;
                                } else {
                                    anyLevelMissing = true;
                                }
                            }
                        } else {
                            anyLevelMissing = true;
                        }
                        break;
                }

                if (anyUploads && anyLevelMissing && texture.mipmaps && !texture._compressed) {
                    gl.generateMipmap(this._glTarget);
                }
            }
        }

        // update vram stats
        if (texture._gpuSize) {
            texture.adjustVramSizeTracking(device._vram, -texture._gpuSize);
        }

        texture._gpuSize = texture.gpuSize;
        texture.adjustVramSizeTracking(device._vram, texture._gpuSize);

        texture._operation = TEXTURE_OPERATION_NONE;
        texture._dirtyLevels.clear();
        this._glCreated = true;
    }

    generateMipmapsIfNeeded(device, texture, mipmapTracking) {
        const gl = device.gl;
        const requiredMipLevels = texture.requiredMipLevels;
        let anyLevelMissing = false;
        for (const slice in mipmapTracking) {
            if (mipmapTracking[slice] !== requiredMipLevels) {
                anyLevelMissing = true;
                break;
            }
        }

        // TODO generate per slice mips using a mipmap renderer like we do for WebGPU
        if (anyLevelMissing && texture.mipmaps && !texture._compressed) {
            gl.generateMipmap(this._glTarget);
        }
    }

    read(x, y, width, height, options) {

        const texture = this.texture;

        /** @type {import('./webgl-graphics-device.js').WebglGraphicsDevice} */
        const device = texture.device;
        return device.readTextureAsync(texture, x, y, width, height, options);
    }
}

export { WebglTexture };
