import { Debug } from '../../core/debug.js';

import {
    BLENDMODE_ZERO, BLENDMODE_ONE, BLENDMODE_SRC_COLOR,
    BLENDMODE_DST_COLOR, BLENDMODE_ONE_MINUS_DST_COLOR, BLENDMODE_SRC_ALPHA,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDEQUATION_ADD,
    BLENDEQUATION_MIN, BLENDEQUATION_MAX,
    CULLFACE_BACK,
    FUNC_LESSEQUAL
} from '../../platform/graphics/constants.js';
import { ShaderProcessorOptions } from '../../platform/graphics/shader-processor-options.js';

import {
    BLEND_ADDITIVE, BLEND_NORMAL, BLEND_NONE, BLEND_PREMULTIPLIED,
    BLEND_MULTIPLICATIVE, BLEND_ADDITIVEALPHA, BLEND_MULTIPLICATIVE2X, BLEND_SCREEN,
    BLEND_MIN, BLEND_MAX
} from '../constants.js';
import { processShader } from '../shader-lib/utils.js';
import { getDefaultMaterial } from './default-material.js';

let id = 0;

/**
 * A material determines how a particular mesh instance is rendered. It specifies the shader and
 * render state that is set before the mesh instance is submitted to the graphics device.
 */
class Material {
    /**
     * A shader used to render the material. Note that this is used only by materials where the
     * user specifies the shader. Most material types generate multiple shader variants, and do not
     * set this.
     *
     * @type {import('../../platform/graphics/shader.js').Shader}
     * @private
     */
    _shader = null;

    /**
     * The mesh instances referencing this material
     *
     * @type {import('../mesh-instance.js').MeshInstance[]}
     * @private
     */
    meshInstances = [];

    /**
     * The name of the material.
     *
     * @type {string}
     */
    name = 'Untitled';

    id = id++;

    variants = {};

    parameters = {};

    /**
     * The alpha test reference value to control which fragments are written to the currently
     * active render target based on alpha value. All fragments with an alpha value of less than
     * the alphaTest reference value will be discarded. alphaTest defaults to 0 (all fragments
     * pass).
     *
     * @type {number}
     */
    alphaTest = 0;

    /**
     * Enables or disables alpha to coverage (WebGL2 only). When enabled, and if hardware
     * anti-aliasing is on, limited order-independent transparency can be achieved. Quality depends
     * on the number of MSAA samples of the current render target. It can nicely soften edges of
     * otherwise sharp alpha cutouts, but isn't recommended for large area semi-transparent
     * surfaces. Note, that you don't need to enable blending to make alpha to coverage work. It
     * will work without it, just like alphaTest.
     *
     * @type {boolean}
     */
    alphaToCoverage = false;

    blend = false;

    blendSrc = BLENDMODE_ONE;

    blendDst = BLENDMODE_ZERO;

    blendEquation = BLENDEQUATION_ADD;

    separateAlphaBlend = false;

    blendSrcAlpha = BLENDMODE_ONE;

    blendDstAlpha = BLENDMODE_ZERO;

    blendAlphaEquation = BLENDEQUATION_ADD;

    /**
     * Controls how triangles are culled based on their face direction with respect to the
     * viewpoint. Can be:
     *
     * - {@link CULLFACE_NONE}: Do not cull triangles based on face direction.
     * - {@link CULLFACE_BACK}: Cull the back faces of triangles (do not render triangles facing
     * away from the view point).
     * - {@link CULLFACE_FRONT}: Cull the front faces of triangles (do not render triangles facing
     * towards the view point).
     * - {@link CULLFACE_FRONTANDBACK}: Cull both front and back faces (triangles will not be
     * rendered).
     *
     * Defaults to {@link CULLFACE_BACK}.
     *
     * @type {number}
     */
    cull = CULLFACE_BACK;

    /**
     * If true, fragments generated by the shader of this material are only written to the current
     * render target if they pass the depth test. If false, fragments generated by the shader of
     * this material are written to the current render target regardless of what is in the depth
     * buffer. Defaults to true.
     *
     * @type {boolean}
     */
    depthTest = true;

    /**
     * Controls how the depth of new fragments is compared against the current depth contained in
     * the depth buffer. Can be:
     *
     * - {@link FUNC_NEVER}: don't draw
     * - {@link FUNC_LESS}: draw if new depth < depth buffer
     * - {@link FUNC_EQUAL}: draw if new depth == depth buffer
     * - {@link FUNC_LESSEQUAL}: draw if new depth <= depth buffer
     * - {@link FUNC_GREATER}: draw if new depth > depth buffer
     * - {@link FUNC_NOTEQUAL}: draw if new depth != depth buffer
     * - {@link FUNC_GREATEREQUAL}: draw if new depth >= depth buffer
     * - {@link FUNC_ALWAYS}: always draw
     *
     * Defaults to {@link FUNC_LESSEQUAL}.
     *
     * @type {number}
     */
    depthFunc = FUNC_LESSEQUAL;

    /**
     * If true, fragments generated by the shader of this material write a depth value to the depth
     * buffer of the currently active render target. If false, no depth value is written. Defaults
     * to true.
     *
     * @type {boolean}
     */
    depthWrite = true;

    /**
     * Stencil parameters for front faces (default is null).
     *
     * @type {import('../stencil-parameters.js').StencilParameters|null}
     */
    stencilFront = null;

    /**
     * Stencil parameters for back faces (default is null).
     *
     * @type {import('../stencil-parameters.js').StencilParameters|null}
     */
    stencilBack = null;

    /**
     * Offsets the output depth buffer value. Useful for decals to prevent z-fighting.
     *
     * @type {number}
     */
    depthBias = 0;

    /**
     * Same as {@link Material#depthBias}, but also depends on the slope of the triangle relative
     * to the camera.
     *
     * @type {number}
     */
    slopeDepthBias = 0;

    /**
     * If true, the red component of fragments generated by the shader of this material is written
     * to the color buffer of the currently active render target. If false, the red component will
     * not be written. Defaults to true.
     *
     * @type {boolean}
     */
    redWrite = true;

    /**
     * If true, the green component of fragments generated by the shader of this material is
     * written to the color buffer of the currently active render target. If false, the green
     * component will not be written. Defaults to true.
     *
     * @type {boolean}
     */
    greenWrite = true;

    /**
     * If true, the blue component of fragments generated by the shader of this material is
     * written to the color buffer of the currently active render target. If false, the blue
     * component will not be written. Defaults to true.
     *
     * @type {boolean}
     */
    blueWrite = true;

    /**
     * If true, the alpha component of fragments generated by the shader of this material is
     * written to the color buffer of the currently active render target. If false, the alpha
     * component will not be written. Defaults to true.
     *
     * @type {boolean}
     */
    alphaWrite = true;

    _shaderVersion = 0;

    _scene = null;

    _dirtyBlend = false;

    dirty = true;

    /**
     * The shader used by this material to render mesh instances (default is null).
     *
     * @type {import('../../platform/graphics/shader.js').Shader|null}
     */
    set shader(shader) {
        this._shader = shader;
    }

    get shader() {
        return this._shader;
    }

    // returns boolean depending on material being transparent
    get transparent() {
        return this.blend;
    }

    /**
     * Controls how primitives are blended when being written to the currently active render
     * target. Can be:
     *
     * - {@link BLEND_SUBTRACTIVE}: Subtract the color of the source fragment from the destination
     * fragment and write the result to the frame buffer.
     * - {@link BLEND_ADDITIVE}: Add the color of the source fragment to the destination fragment
     * and write the result to the frame buffer.
     * - {@link BLEND_NORMAL}: Enable simple translucency for materials such as glass. This is
     * equivalent to enabling a source blend mode of {@link BLENDMODE_SRC_ALPHA} and a destination
     * blend mode of {@link BLENDMODE_ONE_MINUS_SRC_ALPHA}.
     * - {@link BLEND_NONE}: Disable blending.
     * - {@link BLEND_PREMULTIPLIED}: Similar to {@link BLEND_NORMAL} expect the source fragment is
     * assumed to have already been multiplied by the source alpha value.
     * - {@link BLEND_MULTIPLICATIVE}: Multiply the color of the source fragment by the color of the
     * destination fragment and write the result to the frame buffer.
     * - {@link BLEND_ADDITIVEALPHA}: Same as {@link BLEND_ADDITIVE} except the source RGB is
     * multiplied by the source alpha.
     * - {@link BLEND_MULTIPLICATIVE2X}: Multiplies colors and doubles the result.
     * - {@link BLEND_SCREEN}: Softer version of additive.
     * - {@link BLEND_MIN}: Minimum color. Check app.graphicsDevice.extBlendMinmax for support.
     * - {@link BLEND_MAX}: Maximum color. Check app.graphicsDevice.extBlendMinmax for support.
     *
     * Defaults to {@link BLEND_NONE}.
     *
     * @type {number}
     */
    set blendType(type) {
        let blend = true;
        switch (type) {
            case BLEND_NONE:
                blend = false;
                this.blendSrc = BLENDMODE_ONE;
                this.blendDst = BLENDMODE_ZERO;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_NORMAL:
                this.blendSrc = BLENDMODE_SRC_ALPHA;
                this.blendDst = BLENDMODE_ONE_MINUS_SRC_ALPHA;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_PREMULTIPLIED:
                this.blendSrc = BLENDMODE_ONE;
                this.blendDst = BLENDMODE_ONE_MINUS_SRC_ALPHA;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_ADDITIVE:
                this.blendSrc = BLENDMODE_ONE;
                this.blendDst = BLENDMODE_ONE;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_ADDITIVEALPHA:
                this.blendSrc = BLENDMODE_SRC_ALPHA;
                this.blendDst = BLENDMODE_ONE;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_MULTIPLICATIVE2X:
                this.blendSrc = BLENDMODE_DST_COLOR;
                this.blendDst = BLENDMODE_SRC_COLOR;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_SCREEN:
                this.blendSrc = BLENDMODE_ONE_MINUS_DST_COLOR;
                this.blendDst = BLENDMODE_ONE;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_MULTIPLICATIVE:
                this.blendSrc = BLENDMODE_DST_COLOR;
                this.blendDst = BLENDMODE_ZERO;
                this.blendEquation = BLENDEQUATION_ADD;
                break;
            case BLEND_MIN:
                this.blendSrc = BLENDMODE_ONE;
                this.blendDst = BLENDMODE_ONE;
                this.blendEquation = BLENDEQUATION_MIN;
                break;
            case BLEND_MAX:
                this.blendSrc = BLENDMODE_ONE;
                this.blendDst = BLENDMODE_ONE;
                this.blendEquation = BLENDEQUATION_MAX;
                break;
        }
        if (this.blend !== blend) {
            this.blend = blend;
            if (this._scene) {
                this._scene.layers._dirtyBlend = true;
            } else {
                this._dirtyBlend = true;
            }
        }
        this._updateMeshInstanceKeys();
    }

    get blendType() {
        if (!this.blend) {
            return BLEND_NONE;
        }

        if ((this.blendSrc === BLENDMODE_SRC_ALPHA) && (this.blendDst === BLENDMODE_ONE_MINUS_SRC_ALPHA) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_NORMAL;
        }

        if ((this.blendSrc === BLENDMODE_ONE) && (this.blendDst === BLENDMODE_ONE) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_ADDITIVE;
        }

        if ((this.blendSrc === BLENDMODE_SRC_ALPHA) && (this.blendDst === BLENDMODE_ONE) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_ADDITIVEALPHA;
        }

        if ((this.blendSrc === BLENDMODE_DST_COLOR) && (this.blendDst === BLENDMODE_SRC_COLOR) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_MULTIPLICATIVE2X;
        }

        if ((this.blendSrc === BLENDMODE_ONE_MINUS_DST_COLOR) && (this.blendDst === BLENDMODE_ONE) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_SCREEN;
        }

        if ((this.blendSrc === BLENDMODE_ONE) && (this.blendDst === BLENDMODE_ONE) &&
            (this.blendEquation === BLENDEQUATION_MIN)) {
            return BLEND_MIN;
        }

        if ((this.blendSrc === BLENDMODE_ONE) && (this.blendDst === BLENDMODE_ONE) &&
            (this.blendEquation === BLENDEQUATION_MAX)) {
            return BLEND_MAX;
        }

        if ((this.blendSrc === BLENDMODE_DST_COLOR) && (this.blendDst === BLENDMODE_ZERO) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_MULTIPLICATIVE;
        }

        if ((this.blendSrc === BLENDMODE_ONE) && (this.blendDst === BLENDMODE_ONE_MINUS_SRC_ALPHA) &&
            (this.blendEquation === BLENDEQUATION_ADD)) {
            return BLEND_PREMULTIPLIED;
        }

        return BLEND_NORMAL;
    }

    /**
     * Copy a material.
     *
     * @param {Material} source - The material to copy.
     * @returns {Material} The destination material.
     */
    copy(source) {
        this.name = source.name;
        this._shader = source._shader;

        // Render states
        this.alphaTest = source.alphaTest;
        this.alphaToCoverage = source.alphaToCoverage;

        this.blend = source.blend;
        this.blendSrc = source.blendSrc;
        this.blendDst = source.blendDst;
        this.blendEquation = source.blendEquation;

        this.separateAlphaBlend = source.separateAlphaBlend;
        this.blendSrcAlpha = source.blendSrcAlpha;
        this.blendDstAlpha = source.blendDstAlpha;
        this.blendAlphaEquation = source.blendAlphaEquation;

        this.cull = source.cull;

        this.depthTest = source.depthTest;
        this.depthFunc = source.depthFunc;
        this.depthWrite = source.depthWrite;
        this.depthBias = source.depthBias;
        this.slopeDepthBias = source.slopeDepthBias;
        if (source.stencilFront) this.stencilFront = source.stencilFront.clone();
        if (source.stencilBack) {
            if (source.stencilFront === source.stencilBack) {
                this.stencilBack = this.stencilFront;
            } else {
                this.stencilBack = source.stencilBack.clone();
            }
        }

        this.redWrite = source.redWrite;
        this.greenWrite = source.greenWrite;
        this.blueWrite = source.blueWrite;
        this.alphaWrite = source.alphaWrite;

        return this;
    }

    /**
     * Clone a material.
     *
     * @returns {this} A newly cloned material.
     */
    clone() {
        const clone = new this.constructor();
        return clone.copy(this);
    }

    _updateMeshInstanceKeys() {
        const meshInstances = this.meshInstances;
        for (let i = 0; i < meshInstances.length; i++) {
            meshInstances[i].updateKey();
        }
    }

    updateUniforms(device, scene) {
    }

    getShaderVariant(device, scene, objDefs, staticLightList, pass, sortedLights, viewUniformFormat, viewBindGroupFormat, vertexFormat) {

        // generate shader variant - its the same shader, but with different processing options
        const processingOptions = new ShaderProcessorOptions(viewUniformFormat, viewBindGroupFormat, vertexFormat);
        return processShader(this._shader, processingOptions);
    }

    /**
     * Applies any changes made to the material's properties.
     */
    update() {
        this.dirty = true;
        if (this._shader) this._shader.failed = false;
    }

    // Parameter management
    clearParameters() {
        this.parameters = {};
    }

    getParameters() {
        return this.parameters;
    }

    clearVariants() {

        // clear variants on the material
        this.variants = {};

        // but also clear them from all materials that reference them
        const meshInstances = this.meshInstances;
        const count = meshInstances.length;
        for (let i = 0; i < count; i++) {
            meshInstances[i].clearShaders();
        }
    }

    /**
     * Retrieves the specified shader parameter from a material.
     *
     * @param {string} name - The name of the parameter to query.
     * @returns {object} The named parameter.
     */
    getParameter(name) {
        return this.parameters[name];
    }

    /**
     * Sets a shader parameter on a material.
     *
     * @param {string} name - The name of the parameter to set.
     * @param {number|number[]|Float32Array|import('../../platform/graphics/texture.js').Texture} data -
     * The value for the specified parameter.
     */
    setParameter(name, data) {

        if (data === undefined && typeof name === 'object') {
            const uniformObject = name;
            if (uniformObject.length) {
                for (let i = 0; i < uniformObject.length; i++) {
                    this.setParameter(uniformObject[i]);
                }
                return;
            }
            name = uniformObject.name;
            data = uniformObject.value;
        }

        const param = this.parameters[name];
        if (param) {
            param.data = data;
        } else {
            this.parameters[name] = {
                scopeId: null,
                data: data
            };
        }
    }

    /**
     * Deletes a shader parameter on a material.
     *
     * @param {string} name - The name of the parameter to delete.
     */
    deleteParameter(name) {
        if (this.parameters[name]) {
            delete this.parameters[name];
        }
    }

    // used to apply parameters from this material into scope of uniforms, called internally by forward-renderer
    // optional list of parameter names to be set can be specified, otherwise all parameters are set
    setParameters(device, names) {
        const parameters = this.parameters;
        if (names === undefined) names = parameters;
        for (const paramName in names) {
            const parameter = parameters[paramName];
            if (parameter) {
                if (!parameter.scopeId) {
                    parameter.scopeId = device.scope.resolve(paramName);
                }
                parameter.scopeId.setValue(parameter.data);
            }
        }
    }

    /**
     * Removes this material from the scene and possibly frees up memory from its shaders (if there
     * are no other materials using it).
     */
    destroy() {
        this.variants = {};
        this._shader = null;

        for (let i = 0; i < this.meshInstances.length; i++) {
            const meshInstance = this.meshInstances[i];
            meshInstance.clearShaders();
            meshInstance._material = null;

            if (meshInstance.mesh) {
                const defaultMaterial = getDefaultMaterial(meshInstance.mesh.device);
                if (this !== defaultMaterial) {
                    meshInstance.material = defaultMaterial;
                }
            } else {
                Debug.warn('pc.Material: MeshInstance.mesh is null, default material cannot be assigned to the MeshInstance');
            }
        }

        this.meshInstances.length = 0;
    }

    /**
     * Registers mesh instance as referencing the material.
     *
     * @param {import('../mesh-instance.js').MeshInstance} meshInstance - The mesh instance to
     * de-register.
     * @ignore
     */
    addMeshInstanceRef(meshInstance) {
        this.meshInstances.push(meshInstance);
    }

    /**
     * De-registers mesh instance as referencing the material.
     *
     * @param {import('../mesh-instance.js').MeshInstance} meshInstance - The mesh instance to
     * de-register.
     * @ignore
     */
    removeMeshInstanceRef(meshInstance) {
        const meshInstances = this.meshInstances;
        const i = meshInstances.indexOf(meshInstance);
        if (i !== -1) {
            meshInstances.splice(i, 1);
        }
    }
}

export { Material };
