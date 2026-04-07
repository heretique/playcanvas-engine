# Rendering Pipeline Optimization Design

**Date:** 2026-04-07
**Target:** 2x reduction in `renderComposition` frametime
**Scope:** Forward rendering hot path, material parameter system, MeshInstance data layout
**Approach:** Phase A (incremental hot-path fixes) then Phase B (data-oriented render data pipeline)

---

## Problem Statement

Profiling the Hierarchy example in Chrome DevTools shows `AppBase.renderComposition` as the single largest top-level function call. The bottom-up tab identifies three dominant contributors:

1. **`Material.setParameters`** — `for...in` iteration over 27-31 parameter objects per material, called per draw call. Each iteration does lazy `scope.resolve()` + `scope.setValue()` with version bumping.
2. **`WebglGraphicsDevice.commitFunction`** — per-uniform version check + type-dispatched GL call. Called for every dirty uniform across every draw call.
3. **`StandardMaterial` getters via `definePropInternal`** — 259 properties defined via `Object.defineProperty`. Color getters unconditionally set `_dirtyShader = true` on every access (documented hack in the source).

### Per-draw-call cost today (simple opaque mesh, same material)

- 3 `scope.setValue` calls (meshInstanceId, model matrix, normal matrix)
- ~12 device API calls (stencil, cull, vertex buffer, 6 bind group ops, draw)
- `for...in` on `drawCall.parameters` (usually empty but still has iteration overhead)
- `setMorphing(device, null)` and `setSkinning(device, null)` called unconditionally

### Per-material-change cost

- `material.setParameters(device)`: `for...in` over ~27-31 parameters, each doing `scope.resolve` + `scope.setValue`
- `device.setShader`, `setBlendState`, `setDepthState`, `setAlphaToCoverage`
- Light dispatch if light mask changed

### Per-frame cost in `updateUniforms`

- ~50 conditional blocks in `StandardMaterial.updateUniforms`
- Color getters trigger `_dirtyShader = true` unconditionally
- `_processParameters` does Set difference + `delete` on parameter dictionary

---

## Design Principles

1. **Performance first, memory second.** Data layout optimizes for cache efficiency and minimal per-draw-call work. Memory waste is avoided but not at the cost of performance.
2. **`std140` alignment from day one.** MaterialParameterBlock data is laid out with `std140` padding even before UBO support lands, so the future UBO plan is a drop-in.
3. **Conservative API, aggressive internals.** MeshInstance and StandardMaterial public APIs remain intact. The rendering pipeline internally switches to SoA data stores.
4. **Measure each change independently.** Phase A items ship individually with before/after profiling.

---

## Phase A: Hot-Path Fixes

Targeted fixes to existing code. No structural changes. Each is independently shippable and measurable.

### A1. Replace `for...in` with array-based iteration in `setParameters`

**Files:** `src/scene/materials/material.js`, `src/scene/mesh-instance.js`

Both `Material.setParameters` and `MeshInstance.setParameters` use `for (const paramName in obj)`. This is one of the slowest iteration patterns in JS — V8 cannot optimize it, it walks the prototype chain, and produces string keys.

**Change:** Each material/mesh instance maintains a parallel `_parameterNames: string[]` array alongside the `parameters` dictionary. `setParameters` iterates the array by index:

```js
setParameters(device, names) {
    const parameters = this.parameters;
    const keys = names ? names._parameterNames : this._parameterNames;
    for (let i = 0; i < keys.length; i++) {
        const parameter = parameters[keys[i]];
        parameter.scopeId.setValue(parameter.data);
    }
}
```

The `_parameterNames` array is kept in sync by `setParameter` and `deleteParameter`.

### A2. Pre-resolve ScopeIds at parameter set time

**Files:** `src/scene/materials/material.js`, `src/scene/mesh-instance.js`

Currently `scope.resolve(paramName)` happens lazily inside `setParameters` on first use, adding a branch per parameter per draw call.

**Change:** Move resolution to `setParameter` time. Requires passing the device (or scope space) at parameter set time. Since materials already have access to the device during `updateUniforms`, this is straightforward:

```js
setParameter(name, data) {
    let param = this.parameters[name];
    if (!param) {
        param = { scopeId: this._device.scope.resolve(name), data: data };
        this.parameters[name] = param;
        this._parameterNames.push(name);
    } else {
        param.data = data;
    }
}
```

### A3. Fix StandardMaterial color getter `_dirtyShader` hack

**Files:** `src/scene/materials/standard-material.js`, `src/core/math/color.js`

The current code (standard-material.js ~line 1046-1052) unconditionally sets `_dirtyShader = true` on every color getter access. This forces shader recompilation checks every frame for any material that reads a color property.

**Change:** Add a `_version` counter to the `Color` class. Increment it on any mutation (`r`, `g`, `b`, `a` setters, `set()`, `copy()`, `lerp()`, etc.). StandardMaterial's color property setters record `_colorVersions[name]` when the property is set. During `updateUniforms`, compare `color._version !== this._colorVersions[name]` to detect actual changes. The getter no longer touches `_dirtyShader`.

### A4. Eliminate dead function calls in inner loop

**File:** `src/scene/renderer/forward-renderer.js`

`setMorphing(device, null)` and `setSkinning(device, null)` are called for every draw call even when the mesh has no morph or skin data. The null check is inside the function body.

**Change:** Add `FLAG_SKIN` and `FLAG_MORPH` bits to the `_drawCallList` prepared data. Check the bit before calling:

```js
if (flags & FLAG_SKIN) this.setSkinning(device, drawCall);
if (flags & FLAG_MORPH) this.setMorphing(device, drawCall.morphInstance);
```

### A5. Inline `setupCullModeAndFrontFace`

**File:** `src/scene/renderer/forward-renderer.js`

Called per draw call, does simple comparisons + two device calls. Inline it into the render loop to eliminate function call overhead.

---

## Phase B: Data-Oriented Render Data Pipeline

Structural redesign of how rendering data flows from scene objects to the GPU. Extends the SoA pattern established by CullingStore and TransformStore.

### B1. RenderDataStore

**New file:** `src/scene/render-data-store.js`

A global singleton holding all per-draw-call data in flat typed arrays, indexed by slot. Each MeshInstance gets a `_renderSlot` (analogous to `_cullSlot`).

**Arrays:**

| Array | Type | Purpose |
|-------|------|---------|
| `materialSlots` | `Int16Array` (fallback `Int32Array` for >32K materials) | Index into MaterialStore |
| `meshSlots` | `Int16Array` (fallback `Int32Array`) | Index into mesh table |
| `nodeSlots` | `Int32Array` | Index into TransformStore (reuse existing) |
| `shaderSlots` | `Int32Array` | Cached shader variant index |
| `sortKeysOpaque` | `Uint32Array` | Pre-built forward sort key |
| `stateFlags` | `Uint32Array` | Packed bit fields (see below) |
| `skinSlots` | `Int32Array` | Index into skin instance pool (-1 if none) |
| `morphSlots` | `Int32Array` | Index into morph instance pool (-1 if none) |

**`stateFlags` bit layout (32 bits):**

| Bits | Width | Field |
|------|-------|-------|
| 0 | 1 | hasSkin |
| 1 | 1 | hasMorph |
| 2 | 1 | hasInstancing |
| 3 | 1 | hasStencil |
| 4-5 | 2 | renderStyle (solid/wireframe/points) |
| 6 | 1 | castShadow |
| 7 | 1 | receiveShadow |
| 8-23 | 16 | lightMask |
| 24-31 | 8 | passFlags |

**Memory management:**

- Freelist-based slot recycling (same pattern as CullingStore).
- Track high-water mark. Compact when fragmentation exceeds 25%.
- Pre-allocate to scene capacity estimate, grow by 2x when exhausted.
- Sort index arrays pre-allocated to capacity and reused frame-to-frame (zero allocation per sort).
- `Int16Array` used for material/mesh slots when population fits in 16 bits (<32K). Fallback to `Int32Array` for large scenes. Half the cache footprint in the common case.

### B2. MaterialStore and MaterialParameterBlock

**New file:** `src/scene/material-store.js`

A global store where each material gets a slot. The hot rendering data is a pre-built flat `Float32Array` per material — the MaterialParameterBlock.

**MaterialStore arrays:**

| Array | Type | Purpose |
|-------|------|---------|
| `parameterBlocks` | `Float32Array[]` | One per material — all uniform values packed |
| `textureSlots` | `Array<Texture[]>` | Textures per material, ordered by sampler index |
| `blendStates` | `Uint32Array` | Packed blend state per material |
| `depthStates` | `Uint8Array` | Packed depth state per material |
| `shaderVariantKeys` | `Uint32Array` | Hash for shader variant lookup |
| `dirtyFlags` | `Uint8Array` | Which materials need parameterBlock rebuild |

**MaterialParameterBlock layout (standard PBR, `std140` aligned):**

```
offset 0:   ambient           (vec3, padded to vec4)
offset 16:  diffuse           (vec3, padded to vec4)
offset 32:  specular          (vec3, padded to vec4)
offset 48:  emissive          (vec3 + emissiveIntensity as .w)
offset 64:  metalness         (float)
offset 68:  gloss             (float)
offset 72:  opacity           (float)
offset 76:  bumpiness         (float)
offset 80:  reflectivity      (float)
offset 84:  refractionIndex   (float)
offset 88:  aoIntensity       (float)
offset 92:  alphaTest         (float)
offset 96:  sheenGloss        (float)
offset 100: specularityFactor (float)
offset 104: padding           (2 floats to reach vec4 boundary)
offset 112: ...texture transforms (vec4-aligned pairs)...
```

**Key properties:**

- **Sized per material type.** A simple unlit material gets a smaller block than full PBR with clearcoat. No universal worst-case allocation.
- **`std140` padding from day one.** Even though the initial WebGL2 implementation unpacks into individual `gl.uniform*` calls, the data is already aligned for a future single `bufferSubData` upload.
- **Rebuilt only when dirty.** The `dirtyFlags` array tracks which materials need their block rebuilt. `updateUniforms` sets the flag; the block is rebuilt once before rendering, not per draw call.
- **Texture slots ordered by sampler index.** Matches the shader's expected binding order, enabling sequential texture binding without name lookups.

### B3. Revised Forward Renderer Inner Loop

**File:** `src/scene/renderer/forward-renderer.js`

The current `renderForwardInternal` iterates MeshInstance objects with ~12 function calls per draw call. The new loop iterates RenderDataStore slot indices:

```js
renderForwardInternal(camera, preparedCalls) {
    const rds = this.renderDataStore;
    const matStore = this.materialStore;
    const meshTable = this.meshTable;
    const indices = preparedCalls.indices;   // sorted slot indices
    const count = preparedCalls.count;

    let prevMatSlot = -1;
    let prevMeshSlot = -1;

    for (let i = 0; i < count; i++) {
        const slot = indices[i];
        const matSlot = rds.materialSlots[slot];
        const meshSlot = rds.meshSlots[slot];
        const flags = rds.stateFlags[slot];

        // Material change — integer comparison, not object reference
        if (matSlot !== prevMatSlot) {
            matStore.bind(device, matSlot);  // shader + parameter block + blend/depth
            prevMatSlot = matSlot;
        }

        // Mesh change — vertex buffer bind
        if (meshSlot !== prevMeshSlot) {
            device.setVertexBuffer(meshTable[meshSlot].vertexBuffer);
            prevMeshSlot = meshSlot;
        }

        // Per-instance transform (always needed)
        this.setTransformUniforms(rds.nodeSlots[slot]);

        // Conditional on flags — no function call if bit not set
        if (flags & FLAG_SKIN) this.setSkinning(rds.skinSlots[slot]);
        if (flags & FLAG_MORPH) this.setMorphing(rds.morphSlots[slot]);
        if (flags & FLAG_STENCIL) device.setStencilState(stencilTable[slot]);

        device.draw(meshTable[meshSlot].primitive);
    }
}
```

**Key differences from current code:**

- Integer comparisons instead of object identity checks for state change detection.
- Flat array access instead of `drawCall.material`, `drawCall.mesh` pointer chasing.
- Bitflag checks instead of function calls with null guards.
- Material binding is one call that sets the entire parameter block.
- Sorting happened on the `indices` array (cheap to permute integers).
- No `for...in` anywhere in the hot path.

### B4. MeshInstance as Facade

MeshInstance retains its public API. Property setters write through to RenderDataStore:

```js
set material(mat) {
    this._material = mat;
    renderDataStore.materialSlots[this._renderSlot] = mat._storeSlot;
    renderDataStore.sortKeysOpaque[this._renderSlot] = this._computeSortKey();
}

set castShadow(val) {
    this._castShadow = val;
    const slot = this._renderSlot;
    if (val) {
        renderDataStore.stateFlags[slot] |= FLAG_CAST_SHADOW;
    } else {
        renderDataStore.stateFlags[slot] &= ~FLAG_CAST_SHADOW;
    }
}
```

Users interact with MeshInstance as before. The SoA backing is an internal implementation detail.

### B5. Sorting on flat arrays

**Current:** `Array.sort` with comparator callbacks on MeshInstance arrays. O(n log n) with function call overhead per comparison.

**New:** Radix sort on `Uint32Array` sort keys. O(n), cache-friendly, no comparator callbacks. The sorted output is an index permutation array that the inner loop iterates.

For transparent sorting (distance-based), compute `sortKeysDynamic` as quantized depth packed into `Uint32Array`, then radix sort.

Sort index arrays are pre-allocated and reused frame-to-frame — zero allocation per sort.

### B6. `renderForwardPrepareMaterials` simplification

The current two-pass approach (prepare materials, then render) iterates draw calls twice. With the MaterialStore:

- Material dirty check and `updateUniforms` happen once per dirty material during a pre-render step (not per draw call).
- Shader variant lookup uses `shaderVariantKeys` from MaterialStore + `shaderDefs` from RenderDataStore.
- The prepare pass becomes a simple scan of dirty materials, not a per-draw-call loop.

This may allow merging the two passes into one, eliminating the second iteration entirely.

---

## Future: UBO Support on WebGL2 (`std140`)

Not part of this plan, but the design anticipates it:

- MaterialParameterBlock is already `std140`-aligned.
- The `matStore.bind()` call initially iterates a pre-built array of `{ scopeId, offset, type }` descriptors and reads values from the parameter block by offset to call `scopeId.setValue()`. This is faster than `for...in` because the descriptor array is fixed-length, pre-resolved, and the data source is a contiguous `Float32Array`.
- Future change: `matStore.bind()` does a single `gl.bufferSubData` to upload the block, then `gl.bindBufferRange` to bind it. The descriptor array is no longer needed.
- Per-instance uniforms (model matrix, normal matrix) similarly move to a per-draw UBO.
- Expected additional 20-40% frametime reduction on top of Phase B.

---

## Testing & Measurement Strategy

### Benchmarking

- **Primary benchmark:** Hierarchy example (stress tests scene hierarchy and draw call count).
- **Secondary benchmarks:** Typical game scenes with mixed material complexity (unlit, full PBR, transparent).
- **Metric:** `renderComposition` frametime in ms via `stats.frame.renderTime`.
- **Target:** 2x reduction on the Hierarchy example.

### Phase A measurement

Each A-item is measured independently with before/after profiling. This validates the analysis and quantifies each fix's contribution.

### Phase B measurement

After structural changes, re-profile with Chrome DevTools bottom-up view to verify that `Material.setParameters`, `commitFunction`, and `definePropInternal` getters are no longer in the top 3. The new hotspots should be `device.draw` and actual GL calls — the bottleneck should shift from JS overhead to GPU work.

### Regression testing

- Run existing engine test suite after each change.
- Visual regression: render standard test scenes and compare framebuffer output pixel-by-pixel. The SoA refactor must produce identical rendering. Any pixel diff is a bug.

---

## Migration Path

### Phase A: Drop-in

No API changes. Ship as patch releases. Users see faster frames, nothing breaks.

### Phase B: Internal first

1. RenderDataStore and MaterialStore are internal — not exported in the public API.
2. MeshInstance facade writes through to the stores. Public API unchanged.
3. ForwardRenderer switches to the new inner loop. Old `renderForwardInternal` removed.
4. `Material.setParameters(device)` still exists but the forward renderer no longer calls it — it calls `matStore.bind()` instead. The method remains for user code that calls it directly (custom render passes, plugins).

### Future: Expose stores for advanced users

Once the internal API stabilizes, expose `RenderDataStore` and `MaterialStore` as opt-in APIs for users who want to bypass MeshInstance for maximum throughput (particle systems, vegetation, crowd rendering). Not part of this plan.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase A insufficient for 2x | High | Phase A is a stepping stone, not the target. Phase B is the structural change. |
| MeshInstance facade introduces overhead | Medium | Profile the write-through path. Property sets happen at authoring time, not per frame. |
| Radix sort slower for small N | Low | Fallback to insertion sort below threshold (~64 elements). |
| MaterialParameterBlock layout diverges from shader | Medium | Generate block layout from shader reflection. Single source of truth. |
| Memory waste from typed array over-allocation | Low | Freelist recycling + compaction. Monitor fragmentation. |
| `std140` padding wastes memory for small materials | Low | Block sized per material type. Unlit gets minimal block. Padding is 30-40% overhead but enables future UBO path. |
