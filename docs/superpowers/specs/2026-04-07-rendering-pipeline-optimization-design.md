# Rendering Pipeline Optimization Design (Revised)

**Date:** 2026-04-07 (revised after Phase A findings)
**Target:** 2x reduction in `renderComposition` frametime
**Scope:** Forward rendering hot path, uniform commit system, per-draw-call overhead

---

## Problem Statement

Profiling the production Hierarchy example (~5K draw calls) on Chrome DevTools bottom-up view over ~9.4s:

| # | Self time | Total time | Activity |
|---|-----------|------------|----------|
| 1 | 1,241ms (13.2%) | 6,036ms (64.4%) | renderForwardInternal (loop body overhead) |
| 2 | 1,008ms (10.8%) | 1,009ms (10.8%) | setParameters (scope.setValue + version increments) |
| 3 | 681ms (7.3%) | 781ms (8.3%) | commitFunction.\<computed\> (uniform version checks + GL commits) |
| 4 | 605ms (6.5%) | 605ms (6.5%) | _dirtifyWorldInternal (already optimized on branch) |
| 5 | 522ms (5.6%) | 789ms (8.4%) | syncHierarchy (already optimized on branch) |
| 6 | 460ms (4.9%) | 462ms (4.9%) | renderForwardPrepareMaterials (second pass over draw calls) |
| 7 | 442ms (4.7%) | 444ms (4.7%) | setFromTransformedAabb (already optimized on branch) |
| 8 | 337ms (3.6%) | 337ms (3.6%) | Object.defineProperty.get (StandardMaterial getters) |
| 9 | 276ms (2.9%) | 276ms (2.9%) | uniformMatrix3fv (GL normal matrix upload) |
| 10 | 265ms (2.8%) | 788ms (8.4%) | setupCullModeAndFrontFace (includes worldScaleSign) |
| 11 | 257ms (2.7%) | 1,785ms (19.0%) | draw (shader/buffer/sampler setup + GL draw) |
| 12 | 251ms + 232ms | — | equals × 2 (BlendState + DepthState comparison) |
| 13 | 122ms (1.3%) | 523ms (5.6%) | get worldScaleSign (matrix determinant per draw call) |

**`renderForward` total: 6,709ms (71.6% of all profiling time).**

Items 4, 5, 7 are in syncHierarchy/culling — already optimized on the branch. The remaining rendering overhead is ~5,800ms inside renderForward.

### Phase A Lessons Learned

1. **Adding parallel data structures (like `_parameterNames` arrays) caused regressions.** V8 optimizes `for...in` on stable hidden classes. Maintaining a parallel array added overhead that exceeded any iteration benefit.
2. **Adding per-draw-call bookkeeping (morph/skin flags in prepare phase) costs more than it saves.** The prepare-phase getter calls + array pushes outweighed the render-phase savings from skipping null-check returns.
3. **The core principle: don't add work to save work — directly remove work.**

### What survived Phase A (net-zero or positive)

- Color `_version` tracking + getter hack removal (eliminates unnecessary `clearVariants()`)
- Scope pre-resolution during `updateUniforms` (removes lazy-resolve branch)
- Cached `meshInstanceIdId` scope (one less Map lookup per draw call)
- Inlined `setupCullModeAndFrontFace` (one less function call per draw call)

---

## Design Principles (Revised)

1. **Remove work, don't add bookkeeping.** Every optimization must eliminate operations from the hot path, not add parallel tracking structures.
2. **Measure before and after each change.** Ship only changes that show measurable improvement on the Hierarchy example.
3. **Target the biggest items first.** The profiling data gives us a clear priority ordering.
4. **Preserve API compatibility.** MeshInstance and Material public APIs remain intact.

---

## Phase B: Rendering Pipeline Overhead Reduction

Ordered by expected impact based on profiling data.

### B1. Cache `worldScaleSign` during `_sync()` (target: ~500ms)

**Files:** `src/scene/graph-node.js`, `src/core/math/mat4.js`

**Problem:** `worldScaleSign` getter is called per draw call in `setupCullModeAndFrontFace`. For animated nodes, `_worldScaleSign` is reset to 0 every frame (by transform setters), causing a full `scaleSign` recomputation: 3 column extractions + cross product + dot product = ~523ms total for 5K draws.

**The caching mechanism already exists** — `_worldScaleSign = 0` as dirty sentinel, lazy recompute on getter access. The issue is that transform setters reset it to 0 every frame, so for animated scenes it's recomputed every frame per node.

**Fix:** Compute `scaleSign` inside `_sync()` when the world transform is already being computed. The world matrix is freshly built — compute the sign immediately using a cheaper inline determinant sign (9 multiplies + 5 adds, no function calls, no temp vectors):

```js
// In _sync(), after worldTransform is computed:
const m = this.worldTransform.data;
const det = m[0] * (m[5] * m[10] - m[6] * m[9]) -
            m[1] * (m[4] * m[10] - m[6] * m[8]) +
            m[2] * (m[4] * m[9] - m[5] * m[8]);
this._worldScaleSign = det < 0 ? -1 : 1;
```

This eliminates the per-draw-call recomputation entirely — the getter just returns the cached value (already non-zero after sync).

### B2. Eliminate parameter restore overhead (target: ~200ms of the 1,008ms setParameters)

**File:** `src/scene/renderer/forward-renderer.js`

**Problem:** Line 707-708 in `renderForwardInternal`:
```js
if (i < preparedCallsCount - 1 && !preparedCalls.isNewMaterial[i + 1]) {
    material.setParameters(device, drawCall.parameters);
}
```

This runs for the majority of draw calls (whenever the next draw call uses the same material). It calls `material.setParameters(device, drawCall.parameters)` which does `for...in` on `drawCall.parameters`. Even for empty parameter objects, `for...in {}` has overhead — V8 still checks the prototype chain.

**Fix:** Skip the call entirely when `drawCall.parameters` has no overrides. Most mesh instances in the Hierarchy example have no per-instance parameter overrides.

```js
if (i < preparedCallsCount - 1 && !preparedCalls.isNewMaterial[i + 1]) {
    if (drawCall._hasParameters) {
        material.setParameters(device, drawCall.parameters);
    }
}
```

Add a `_hasParameters` boolean to MeshInstance, set to `true` in `setParameter()`, `false` when parameters become empty. This is a single boolean check vs a `for...in` on an empty object.

### B3. Reduce uniform version checks in `device.draw()` (target: ~400ms of 781ms commitFunction)

**File:** `src/platform/graphics/webgl/webgl-graphics-device.js`

**Problem:** Inside `device.draw()`, the uniform commit loop iterates ALL ~50 uniforms for the current shader and version-checks each one (4 property reads + 2 comparisons per uniform). For same-material draws, only 3 per-instance uniforms changed (model matrix, normal matrix, meshInstanceId), but all 50 are checked.

**Fix:** Split shader uniforms into two lists: **material-level** and **instance-level**. Track whether material uniforms are dirty. For same-material draws, only iterate instance-level uniforms.

In `WebglShader` (or wherever uniforms are stored after shader finalization):
```js
this.materialUniforms = [];  // uniforms from material setParameters
this.instanceUniforms = [];  // uniforms from per-instance (matrix_model, matrix_normal, meshInstanceId, bone textures)
```

In `device.draw()`:
```js
// Always commit instance uniforms
for (let i = 0; i < instanceUniforms.length; i++) { ... }

// Only commit material uniforms when material changed
if (this._materialUniformsDirty) {
    for (let i = 0; i < materialUniforms.length; i++) { ... }
    this._materialUniformsDirty = false;
}
```

Set `_materialUniformsDirty = true` in `device.setShader()` (which is called on material change).

The classification can be done at shader link time based on uniform names (prefixed `matrix_`, `meshInstanceId`, `bone` → instance; everything else → material).

### B4. Merge prepare and render passes (target: ~300ms of 462ms renderForwardPrepareMaterials)

**File:** `src/scene/renderer/forward-renderer.js`

**Problem:** `renderForwardPrepareMaterials` iterates all draw calls to build 4 parallel arrays (`drawCalls`, `shaderInstances`, `isNewMaterial`, `lightMaskChanged`), then `renderForwardInternal` iterates them again. This is two full iterations over potentially thousands of draw calls, with array pushes in the first pass.

**Fix:** Merge into a single pass. Handle material/shader setup inline in the render loop:

```js
renderForwardSinglePass(camera, drawCalls, sortedLights, pass, ...) {
    let prevMaterial = null, prevObjDefs, prevLightMask;
    
    for (let i = 0; i < drawCalls.length; i++) {
        const drawCall = drawCalls[i];
        const material = drawCall.material;
        const isNewMaterial = material !== prevMaterial || drawCall._shaderDefs !== prevObjDefs;
        
        if (isNewMaterial) {
            if (material.dirty) {
                material.updateUniforms(device, scene);
                material.dirty = false;
            }
            const shaderInstance = drawCall.getShaderInstance(...);
            device.setShader(shaderInstance.shader);
            material.setParameters(device);
            // blend/depth/alpha state...
        }
        
        // Per-instance work...
        device.draw(...);
        
        prevMaterial = material;
        prevObjDefs = drawCall._shaderDefs;
        prevLightMask = drawCall.mask;
    }
}
```

This eliminates: 4 array pushes per draw call in prepare, 4 array reads per draw call in render, the `_drawCallList` clear/allocation, and one full iteration.

### B5. Reduce inner loop property access overhead (target: ~300ms of 1,241ms loop self time)

**File:** `src/scene/renderer/forward-renderer.js`

**Problem:** The loop body does excessive property chaining per draw call. Each `drawCall.material`, `drawCall.node.worldScaleSign`, `material.frontFace`, etc. is a property read through the object system.

**Fix (incremental):**
- `drawCall.stencilFront ?? material.stencilFront` / `drawCall.stencilBack ?? material.stencilBack` — for the common case (no stencil), both are null. The nullish coalescing still evaluates both sides. Check `drawCall.stencilFront !== null` first before touching material.
- Cache `drawCall.node` locally: `const node = drawCall.node;` — avoids repeated property read.
- The `drawCallback?.(drawCall, i)` optional chain check runs per draw call even when null.
- `drawCall.getDrawCommands(camera)` does a Map.get per draw call — almost always returns undefined. Add a fast check: `drawCall.drawCommands !== null &&` before the Map.get.

### B6. Faster `scaleSign` on `Mat4` (target: portion of B1)

**File:** `src/core/math/mat4.js`

**Problem:** `Mat4.scaleSign` getter extracts 3 column vectors into temp Vec3s, does cross product + dot. This creates function call overhead and temp object usage.

**Fix:** Inline the determinant sign computation directly from matrix data array:

```js
get scaleSign() {
    const m = this.data;
    const cofactor = m[0] * (m[5] * m[10] - m[6] * m[9]) -
                     m[1] * (m[4] * m[10] - m[6] * m[8]) +
                     m[2] * (m[4] * m[9] - m[5] * m[8]);
    return cofactor < 0 ? -1 : 1;
}
```

No function calls, no temp vectors, pure arithmetic. This benefits even if B1 moves the computation to `_sync()`.

---

## Phase B Summary — Expected Savings

| Item | Profiled cost | Target savings | Approach |
|------|--------------|----------------|----------|
| B1. worldScaleSign caching | 523ms | ~450ms | Compute in _sync(), not per draw call |
| B2. Parameter restore skip | ~200ms of 1,008ms | ~180ms | Boolean check instead of for...in on empty obj |
| B3. Split uniform commit | 781ms | ~400ms | Skip material uniforms for same-material draws |
| B4. Merge passes | 462ms | ~300ms | Single iteration instead of two |
| B5. Property access reduction | ~300ms of 1,241ms | ~200ms | Local caching, fast paths for common cases |
| B6. Faster scaleSign | part of B1 | ~50ms | Inline determinant, no temp vectors |
| **Total** | | **~1,580ms** | **~23% reduction** |

Combined with Phase A improvements (color getter, scope pre-resolution, cached meshInstanceId) and future UBO support, this gets us closer to 2x. The remaining gap would be closed by:
- Future: UBO support on WebGL2 (`std140`) — eliminates per-uniform `scope.setValue` + version system entirely
- Future: GPU-driven rendering on WebGPU — eliminates most CPU per-draw work

---

## Risk Assessment (Revised)

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| B3 uniform split misclassifies uniforms | Medium | Use naming convention (matrix_*, meshInstanceId, bone* → instance). Validate at shader link time. |
| B4 merged pass changes render order/behavior | Medium | Regression test with pixel comparison. The merged pass must produce identical results. |
| B1 scaleSign in _sync() adds overhead to transform sync | Low | Inline determinant is 9 muls + 5 adds — negligible compared to matrix multiply. |
| Phase A + B combined still short of 2x | Medium | The ~23% from Phase B + future UBO work targets another 20-40%. Combined with reduced sync/culling from existing branch work, 2x is achievable across the full frame. |
