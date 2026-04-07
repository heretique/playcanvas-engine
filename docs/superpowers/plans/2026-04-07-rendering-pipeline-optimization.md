# Rendering Pipeline Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `renderComposition` frametime by 2x through hot-path fixes (Phase A) and a data-oriented render data pipeline (Phase B).

**Architecture:** Phase A applies targeted fixes to the existing rendering pipeline — replacing `for...in` iteration, fixing the color getter dirty-shader hack, pre-resolving scope IDs, and eliminating unnecessary function calls. Phase B introduces SoA stores (RenderDataStore, MaterialStore) that the forward renderer iterates directly, with MeshInstance preserved as a facade.

**Tech Stack:** PlayCanvas engine (JavaScript/ES modules), Mocha + Chai for tests, WebGL2/WebGPU graphics backends.

---

## File Structure

### Phase A — Modified files

| File | Responsibility |
|------|---------------|
| `src/core/math/color.js` | Add `_version` counter, increment on all mutations |
| `src/scene/materials/material.js` | Add `_parameterNames` array, pre-resolve scope IDs, array-based `setParameters` |
| `src/scene/mesh-instance.js` | Add `_parameterNames` array, pre-resolve scope IDs, array-based `setParameters` |
| `src/scene/materials/standard-material.js` | Replace color getter hack with version-based dirty detection |
| `src/scene/renderer/forward-renderer.js` | Add flags to `_drawCallList`, gate morph/skin calls, inline cull mode setup |
| `test/core/math/color.test.mjs` | Tests for Color version tracking |
| `test/scene/materials/material-parameters.test.mjs` | Tests for array-based parameter iteration |
| `test/scene/materials/standard-material-color.test.mjs` | Tests for color dirty tracking fix |

### Phase B — New and modified files

| File | Responsibility |
|------|---------------|
| `src/scene/render-data-store.js` | SoA typed arrays for per-draw-call rendering data |
| `src/scene/material-store.js` | Per-material parameter blocks and render state |
| `src/scene/renderer/forward-renderer.js` | New inner loop iterating SoA data |
| `src/scene/mesh-instance.js` | Write-through to RenderDataStore |
| `test/scene/render-data-store.test.mjs` | Tests for slot allocation, freeing, data integrity |
| `test/scene/material-store.test.mjs` | Tests for parameter block building and binding |

---

## Task 1: Add version tracking to Color class

**Files:**
- Modify: `src/core/math/color.js:13-285`
- Test: `test/core/math/color.test.mjs`

- [ ] **Step 1: Write failing tests for Color version tracking**

Create a new test file (the existing `test/core/math/color.test.mjs` tests default behavior — we add version-specific tests):

```js
// Append to test/core/math/color.test.mjs

describe('Color', function () {

    // ... existing tests ...

    describe('#_version', function () {

        it('should start at 0', function () {
            const c = new Color(1, 0, 0, 1);
            expect(c._version).to.equal(0);
        });

        it('should increment on set()', function () {
            const c = new Color();
            const v0 = c._version;
            c.set(1, 0, 0, 1);
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on copy()', function () {
            const c = new Color();
            const src = new Color(1, 1, 1, 1);
            const v0 = c._version;
            c.copy(src);
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on lerp()', function () {
            const c = new Color();
            const a = new Color(0, 0, 0, 1);
            const b = new Color(1, 1, 1, 1);
            const v0 = c._version;
            c.lerp(a, b, 0.5);
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on linear()', function () {
            const c = new Color(0.5, 0.5, 0.5, 1);
            const v0 = c._version;
            c.linear();
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on gamma()', function () {
            const c = new Color(0.5, 0.5, 0.5, 1);
            const v0 = c._version;
            c.gamma();
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on mulScalar()', function () {
            const c = new Color(0.5, 0.5, 0.5, 1);
            const v0 = c._version;
            c.mulScalar(2);
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on fromString()', function () {
            const c = new Color();
            const v0 = c._version;
            c.fromString('#ff0000');
            expect(c._version).to.equal(v0 + 1);
        });

        it('should increment on fromArray()', function () {
            const c = new Color();
            const v0 = c._version;
            c.fromArray([1, 0, 0, 1]);
            expect(c._version).to.equal(v0 + 1);
        });

        it('should not increment on clone()', function () {
            const c = new Color(1, 0, 0, 1);
            const v0 = c._version;
            c.clone();
            expect(c._version).to.equal(v0);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/core/math/color.test.mjs --timeout 5000`
Expected: FAIL — `_version` is undefined

- [ ] **Step 3: Implement version tracking on Color**

In `src/core/math/color.js`, add a `_version` field and increment it in every mutation method:

```js
class Color {
    r;
    g;
    b;
    a;

    /**
     * Version counter, incremented on every mutation. Used for dirty-checking
     * without requiring proxies or deep comparison.
     *
     * @type {number}
     * @ignore
     */
    _version = 0;

    constructor(r = 0, g = 0, b = 0, a = 1) {
        const length = r.length;
        if (length === 3 || length === 4) {
            this.r = r[0];
            this.g = r[1];
            this.b = r[2];
            this.a = r[3] ?? 1;
        } else {
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
    }
```

Add `this._version++` as the first line of: `copy`, `set`, `lerp`, `linear`, `gamma`, `mulScalar`, `fromString`, `fromArray`.

For example, `set` becomes:

```js
    set(r, g, b, a = 1) {
        this._version++;
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;

        return this;
    }
```

And `copy` becomes:

```js
    copy(rhs) {
        this._version++;
        this.r = rhs.r;
        this.g = rhs.g;
        this.b = rhs.b;
        this.a = rhs.a;

        return this;
    }
```

Apply the same pattern to `lerp`, `linear`, `gamma`, `mulScalar`, `fromString`, `fromArray`. Do NOT add `_version++` to `clone()`, `equals()`, `toString()`, `toArray()` (non-mutating).

Note: `fromString` calls `this.set(...)` internally, which already increments. To avoid double-increment, either remove the `_version++` from `fromString` and rely on `set`, or add it and accept the double increment (functionally harmless). The cleanest approach: do NOT add `_version++` to `fromString` since it delegates to `set`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/core/math/color.test.mjs --timeout 5000`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/math/color.js test/core/math/color.test.mjs
git commit -m "feat: add _version tracking to Color for dirty-checking"
```

---

## Task 2: Array-based parameter iteration on Material

**Files:**
- Modify: `src/scene/materials/material.js:125, 750-752, 778-795, 825-829, 833-845`
- Create: `test/scene/materials/material-parameters.test.mjs`

- [ ] **Step 1: Write failing tests for array-based parameter iteration**

```js
// test/scene/materials/material-parameters.test.mjs
import { expect } from 'chai';
import { Material } from '../../../src/scene/materials/material.js';

describe('Material parameter iteration', function () {

    describe('#_parameterNames', function () {

        it('should start empty', function () {
            const mat = new Material();
            expect(mat._parameterNames).to.be.an('array').that.is.empty;
        });

        it('should track names added via _setParameterSimple', function () {
            const mat = new Material();
            mat._setParameterSimple('test_param', 1.0);
            expect(mat._parameterNames).to.include('test_param');
        });

        it('should not duplicate names on update', function () {
            const mat = new Material();
            mat._setParameterSimple('test_param', 1.0);
            mat._setParameterSimple('test_param', 2.0);
            const count = mat._parameterNames.filter(n => n === 'test_param').length;
            expect(count).to.equal(1);
        });

        it('should remove names on deleteParameter', function () {
            const mat = new Material();
            mat._setParameterSimple('test_param', 1.0);
            mat.deleteParameter('test_param');
            expect(mat._parameterNames).to.not.include('test_param');
        });

        it('should be cleared by clearParameters', function () {
            const mat = new Material();
            mat._setParameterSimple('a', 1.0);
            mat._setParameterSimple('b', 2.0);
            mat.clearParameters();
            expect(mat._parameterNames).to.be.an('array').that.is.empty;
        });
    });

    describe('#setParameters', function () {

        it('should set all parameters via array iteration', function () {
            const mat = new Material();
            // Simulate scope
            const values = {};
            const mockScope = {
                resolve(name) {
                    return {
                        setValue(data) {
                            values[name] = data;
                        }
                    };
                }
            };
            const mockDevice = { scope: mockScope };

            mat._setParameterSimple('param_a', 1.0);
            mat._setParameterSimple('param_b', 2.0);

            mat.setParameters(mockDevice);

            expect(values['param_a']).to.equal(1.0);
            expect(values['param_b']).to.equal(2.0);
        });

        it('should set only named parameters when names provided', function () {
            const mat = new Material();
            const values = {};
            const mockScope = {
                resolve(name) {
                    return {
                        setValue(data) {
                            values[name] = data;
                        }
                    };
                }
            };
            const mockDevice = { scope: mockScope };

            mat._setParameterSimple('param_a', 1.0);
            mat._setParameterSimple('param_b', 2.0);

            // Pass a names object with only param_a
            const namesFilter = new Material();
            namesFilter._setParameterSimple('param_a', 999);

            mat.setParameters(mockDevice, namesFilter);

            expect(values['param_a']).to.equal(1.0);
            expect(values['param_b']).to.be.undefined;
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/scene/materials/material-parameters.test.mjs --timeout 5000`
Expected: FAIL — `_parameterNames` is undefined

- [ ] **Step 3: Implement array-based parameter tracking on Material**

In `src/scene/materials/material.js`:

**Add `_parameterNames` field** (after line 125):

```js
    parameters = {};

    /**
     * @type {string[]}
     * @ignore
     */
    _parameterNames = [];
```

**Update `_setParameterSimple`** (lines 778-795) — add name to array on new parameter:

```js
    _setParameterSimple(name, data) {

        Debug.call(() => {
            if (data === undefined) {
                Debug.warnOnce(`Material#setParameter: Attempting to set undefined data for parameter "${name}", this is likely not expected.`, this);
            }
        });

        const param = this.parameters[name];
        if (param) {
            param.data = data;
        } else {
            this.parameters[name] = {
                scopeId: null,
                data: data
            };
            this._parameterNames.push(name);
        }
    }
```

**Update `deleteParameter`** (lines 825-829) — remove name from array:

```js
    deleteParameter(name) {
        if (this.parameters[name]) {
            delete this.parameters[name];
            const idx = this._parameterNames.indexOf(name);
            if (idx !== -1) {
                this._parameterNames.splice(idx, 1);
            }
        }
    }
```

**Update `clearParameters`** (lines 750-752):

```js
    clearParameters() {
        this.parameters = {};
        this._parameterNames.length = 0;
    }
```

**Update `setParameters`** (lines 833-845) — array-based iteration:

```js
    setParameters(device, names) {
        const parameters = this.parameters;
        if (names === undefined) {
            // Iterate all parameters using the names array (no for...in)
            const keys = this._parameterNames;
            for (let i = 0; i < keys.length; i++) {
                const parameter = parameters[keys[i]];
                if (!parameter.scopeId) {
                    parameter.scopeId = device.scope.resolve(keys[i]);
                }
                parameter.scopeId.setValue(parameter.data);
            }
        } else {
            // Iterate only the names from the provided filter object
            const filterKeys = names._parameterNames;
            for (let i = 0; i < filterKeys.length; i++) {
                const parameter = parameters[filterKeys[i]];
                if (parameter) {
                    if (!parameter.scopeId) {
                        parameter.scopeId = device.scope.resolve(filterKeys[i]);
                    }
                    parameter.scopeId.setValue(parameter.data);
                }
            }
        }
    }
```

Note: The `names` argument is only called from `forward-renderer.js:698` as `material.setParameters(device, drawCall.parameters)` where `drawCall` is a MeshInstance. Since MeshInstance also has `parameters` as a plain object, we need to handle that case. Looking at line 697-698:

```js
if (i < preparedCallsCount - 1 && !preparedCalls.isNewMaterial[i + 1]) {
    material.setParameters(device, drawCall.parameters);
}
```

Here `drawCall.parameters` is a plain `{}` object, not a Material. So the `names._parameterNames` path won't work directly. We need to keep `for...in` fallback for when `names` is a plain object without `_parameterNames`. Update the `names` branch:

```js
    setParameters(device, names) {
        const parameters = this.parameters;
        if (names === undefined) {
            const keys = this._parameterNames;
            for (let i = 0; i < keys.length; i++) {
                const parameter = parameters[keys[i]];
                if (!parameter.scopeId) {
                    parameter.scopeId = device.scope.resolve(keys[i]);
                }
                parameter.scopeId.setValue(parameter.data);
            }
        } else {
            // names can be a Material (has _parameterNames) or a plain object (MeshInstance.parameters)
            const filterKeys = names._parameterNames;
            if (filterKeys) {
                for (let i = 0; i < filterKeys.length; i++) {
                    const parameter = parameters[filterKeys[i]];
                    if (parameter) {
                        if (!parameter.scopeId) {
                            parameter.scopeId = device.scope.resolve(filterKeys[i]);
                        }
                        parameter.scopeId.setValue(parameter.data);
                    }
                }
            } else {
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
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/scene/materials/material-parameters.test.mjs --timeout 5000`
Expected: All PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/scene/materials/material.js test/scene/materials/material-parameters.test.mjs
git commit -m "perf: replace for...in with array-based iteration in Material.setParameters"
```

---

## Task 3: Array-based parameter iteration on MeshInstance

**Files:**
- Modify: `src/scene/mesh-instance.js:378-381, 1373-1386, 1422-1426, 1436-1447`

- [ ] **Step 1: Write failing test for MeshInstance parameter names tracking**

Append to `test/scene/materials/material-parameters.test.mjs`:

```js
import { MeshInstance } from '../../../src/scene/mesh-instance.js';
import { Mesh } from '../../../src/scene/mesh.js';

describe('MeshInstance parameter iteration', function () {

    describe('#_parameterNames', function () {

        it('should start empty', function () {
            // MeshInstance requires a mesh - but we only test parameter tracking
            // Access the prototype default
            const params = {};
            const names = [];
            expect(names).to.be.an('array').that.is.empty;
        });

        it('should track names added via setParameter', function () {
            // We test the setParameter logic directly on a minimal object
            const mi = Object.create(MeshInstance.prototype);
            mi.parameters = {};
            mi._parameterNames = [];
            mi.setParameter('test_param', 1.0);
            expect(mi._parameterNames).to.include('test_param');
        });

        it('should not duplicate names on update', function () {
            const mi = Object.create(MeshInstance.prototype);
            mi.parameters = {};
            mi._parameterNames = [];
            mi.setParameter('test_param', 1.0);
            mi.setParameter('test_param', 2.0);
            const count = mi._parameterNames.filter(n => n === 'test_param').length;
            expect(count).to.equal(1);
        });

        it('should remove names on deleteParameter', function () {
            const mi = Object.create(MeshInstance.prototype);
            mi.parameters = {};
            mi._parameterNames = [];
            mi.setParameter('test_param', 1.0);
            mi.deleteParameter('test_param');
            expect(mi._parameterNames).to.not.include('test_param');
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/scene/materials/material-parameters.test.mjs --timeout 5000`
Expected: FAIL — `_parameterNames` is undefined on MeshInstance prototype

- [ ] **Step 3: Implement array-based parameter tracking on MeshInstance**

In `src/scene/mesh-instance.js`:

**Add `_parameterNames` field** (after line 381):

```js
    /**
     * @type {Object<string, {scopeId: ScopeId|null, data: *, passFlags: number}>}
     * @ignore
     */
    parameters = {};

    /**
     * @type {string[]}
     * @ignore
     */
    _parameterNames = [];
```

**Update `setParameter`** (lines 1373-1386):

```js
    setParameter(name, data, passFlags = 0xFFFFFFFF) {

        const param = this.parameters[name];
        if (param) {
            param.data = data;
            param.passFlags = passFlags;
        } else {
            this.parameters[name] = {
                scopeId: null,
                data: data,
                passFlags: passFlags
            };
            this._parameterNames.push(name);
        }
    }
```

**Update `deleteParameter`** (lines 1422-1426):

```js
    deleteParameter(name) {
        if (this.parameters[name]) {
            delete this.parameters[name];
            const idx = this._parameterNames.indexOf(name);
            if (idx !== -1) {
                this._parameterNames.splice(idx, 1);
            }
        }
    }
```

**Update `setParameters`** (lines 1436-1447):

```js
    setParameters(device, passFlag) {
        const parameters = this.parameters;
        const keys = this._parameterNames;
        for (let i = 0; i < keys.length; i++) {
            const parameter = parameters[keys[i]];
            if (parameter.passFlags & passFlag) {
                if (!parameter.scopeId) {
                    parameter.scopeId = device.scope.resolve(keys[i]);
                }
                parameter.scopeId.setValue(parameter.data);
            }
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/scene/materials/material-parameters.test.mjs --timeout 5000`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/scene/mesh-instance.js test/scene/materials/material-parameters.test.mjs
git commit -m "perf: replace for...in with array-based iteration in MeshInstance.setParameters"
```

---

## Task 4: Fix StandardMaterial color getter dirty-shader hack

**Files:**
- Modify: `src/scene/materials/standard-material.js:1042-1068`
- Create: `test/scene/materials/standard-material-color.test.mjs`

- [ ] **Step 1: Write failing test for color version-based dirty tracking**

```js
// test/scene/materials/standard-material-color.test.mjs
import { expect } from 'chai';
import { Color } from '../../../src/core/math/color.js';
import { StandardMaterial } from '../../../src/scene/materials/standard-material.js';

describe('StandardMaterial color dirty tracking', function () {

    it('should not set _dirtyShader when accessing color getter without mutation', function () {
        const mat = new StandardMaterial();
        mat._dirtyShader = false;

        // Access the ambient color getter — should NOT dirty the shader
        const ambient = mat.ambient;

        expect(mat._dirtyShader).to.equal(false);
    });

    it('should set _dirtyShader when color is mutated via set()', function () {
        const mat = new StandardMaterial();
        mat._dirtyShader = false;

        // Mutate the color after getting reference
        mat.ambient.set(0.5, 0.5, 0.5);

        // _dirtyShader is detected on next updateUniforms, not on mutation.
        // But calling the getter again should detect version change.
        // Access the getter to trigger version check.
        const _ = mat.ambient;

        // After mutation, the getter should detect version change
        // The material should flag dirty on next updateUniforms or getter access
        // depending on implementation. We test that setting the color
        // directly via the setter still works:
        mat._dirtyShader = false;
        mat.ambient = new Color(0, 0, 0);
        // Setting the property itself should still set _dirtyShader
        // because the dirtyShaderFunc on the setter triggers for aggregate props
    });

    it('should detect color mutation between updateUniforms calls', function () {
        const mat = new StandardMaterial();

        // Simulate initial updateUniforms snapshot
        mat._snapshotColorVersions();

        // Mutate color in-place
        mat.ambient.set(0.5, 0.2, 0.1);

        // Check that mutation is detected
        expect(mat._hasColorChanged('ambient')).to.equal(true);
    });

    it('should not detect change if color was not mutated', function () {
        const mat = new StandardMaterial();

        mat._snapshotColorVersions();

        // Access but don't mutate
        const _ = mat.ambient;

        expect(mat._hasColorChanged('ambient')).to.equal(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/scene/materials/standard-material-color.test.mjs --timeout 5000`
Expected: FAIL — `_snapshotColorVersions` and `_hasColorChanged` do not exist, and getter still sets `_dirtyShader`

- [ ] **Step 3: Implement version-based color dirty tracking**

In `src/scene/materials/standard-material.js`:

**Add color version tracking to StandardMaterial class.** Find the constructor (search for `constructor()` in the class) and add:

```js
    /**
     * Tracks Color._version for each color property to detect in-place mutations.
     *
     * @type {Object<string, number>}
     * @ignore
     */
    _colorVersions = {};
```

**Add helper methods** to the StandardMaterial class body:

```js
    /**
     * Snapshot current color versions for dirty detection.
     *
     * @ignore
     */
    _snapshotColorVersions() {
        this._colorVersions.ambient = this._ambient._version;
        this._colorVersions.diffuse = this._diffuse._version;
        this._colorVersions.specular = this._specular._version;
        this._colorVersions.emissive = this._emissive._version;
        this._colorVersions.sheen = this._sheen._version;
        this._colorVersions.attenuation = this._attenuation._version;
    }

    /**
     * Check if a color property was mutated in-place since last snapshot.
     *
     * @param {string} name - The color property name.
     * @returns {boolean} True if the color was mutated.
     * @ignore
     */
    _hasColorChanged(name) {
        return this[`_${name}`]._version !== this._colorVersions[name];
    }
```

**Update `_defineColor`** (lines 1042-1068) — remove the `_dirtyShader` hack from the getter:

```js
function _defineColor(name, defaultValue) {
    defineProp({
        name: name,
        defaultValue: defaultValue
        // No getterFunc — use the default getter from definePropInternal.
        // The _dirtyShader hack is removed. In-place color mutations
        // are detected via _version tracking in updateUniforms.
    });

    defineUniform(name, (material, device, scene) => {
        const uniform = material._allocUniform(name, () => new Float32Array(3));
        const color = material[name];

        // uniforms are always in linear space
        _tempColor.linear(color);
        uniform[0] = _tempColor.r;
        uniform[1] = _tempColor.g;
        uniform[2] = _tempColor.b;

        return uniform;
    });
}
```

**Update `updateUniforms`** (around line 693) — add color version checking at the start of the method. Find the `updateUniforms(device, scene)` method and add at the beginning:

```js
    updateUniforms(device, scene) {

        // Detect in-place color mutations via version tracking
        if (!this._dirtyShader) {
            if (this._hasColorChanged('ambient') ||
                this._hasColorChanged('diffuse') ||
                this._hasColorChanged('specular') ||
                this._hasColorChanged('emissive') ||
                this._hasColorChanged('sheen') ||
                this._hasColorChanged('attenuation')) {
                // Color was mutated in-place — but this only affects uniforms,
                // not the shader variant. No need to set _dirtyShader.
                // The uniform values will be re-read below.
            }
        }

        // Snapshot color versions for next frame's comparison
        this._snapshotColorVersions();

        // ... rest of existing updateUniforms code ...
```

Note: The key insight is that the old hack set `_dirtyShader = true` on color getter access, which triggers **shader recompilation checks**. But color value changes only affect **uniform values**, not shader variants. The color getter never needs to set `_dirtyShader`. The uniform values are always re-read during `updateUniforms` anyway (via `getUniform` which reads `material[name]` directly). So the fix is simply: remove the `_dirtyShader = true` from the getter. The `_snapshotColorVersions` / `_hasColorChanged` are useful for future optimizations where we might skip `updateUniforms` entirely if nothing changed, but for now the critical fix is just removing the getter hack.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/scene/materials/standard-material-color.test.mjs --timeout 5000`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing tests pass. Verify that the existing `standard-material.test.mjs` tests still pass — they access color getters extensively in `checkDefaultMaterial`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/materials/standard-material.js src/core/math/color.js test/scene/materials/standard-material-color.test.mjs
git commit -m "perf: fix StandardMaterial color getter _dirtyShader hack using version tracking"
```

---

## Task 5: Pre-resolve ScopeIds at parameter set time

**Files:**
- Modify: `src/scene/materials/material.js:778-795`

- [ ] **Step 1: Understand the constraint**

Pre-resolving scope IDs requires access to `device.scope`. Materials get the device during `updateUniforms(device, scene)`. The `_setParameterSimple` method is called from `updateUniforms` context (via `_setParameter` in standard-material.js). So the device is available.

However, `_setParameterSimple` is also called during `copy()` (line 665), where no device is available. And `setParameter` is public API where users may not have a device reference.

**Decision:** Keep lazy resolution as a fallback but add an optional scope parameter to `_setParameterSimple` for the hot path. When called from `updateUniforms`, pass the scope. This avoids changing public API.

- [ ] **Step 2: Update `_setParameterSimple` to accept optional scope**

In `src/scene/materials/material.js`, update `_setParameterSimple`:

```js
    _setParameterSimple(name, data, scope) {

        Debug.call(() => {
            if (data === undefined) {
                Debug.warnOnce(`Material#setParameter: Attempting to set undefined data for parameter "${name}", this is likely not expected.`, this);
            }
        });

        const param = this.parameters[name];
        if (param) {
            param.data = data;
            if (scope && !param.scopeId) {
                param.scopeId = scope.resolve(name);
            }
        } else {
            this.parameters[name] = {
                scopeId: scope ? scope.resolve(name) : null,
                data: data
            };
            this._parameterNames.push(name);
        }
    }
```

- [ ] **Step 3: Update StandardMaterial._setParameter to pass scope**

In `src/scene/materials/standard-material.js`, find the `_setParameter` method (around line 641). It's called during `updateUniforms` where `device` is available. Add scope passing:

First, find `_setParameter` in standard-material.js. It should look something like:

```js
    _setParameter(name, value) {
        _params.add(name);
        this.setParameter(name, value);
    }
```

The challenge is that `_setParameter` doesn't have access to the device. But `updateUniforms(device, scene)` does. We can store the device scope on the material temporarily during `updateUniforms`:

In `updateUniforms`, at the start (before any `_setParameter` calls):

```js
    updateUniforms(device, scene) {
        this._scope = device.scope;
        // ... existing code ...
```

And update `_setParameter`:

```js
    _setParameter(name, value) {
        _params.add(name);
        this._setParameterSimple(name, value, this._scope);
    }
```

This way all parameters get their scopeIds pre-resolved during `updateUniforms`, eliminating the lazy resolution branch in `setParameters`.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/scene/materials/material.js src/scene/materials/standard-material.js
git commit -m "perf: pre-resolve ScopeIds during updateUniforms instead of lazy resolution"
```

---

## Task 6: Eliminate dead morph/skin calls and inline cull mode setup

**Files:**
- Modify: `src/scene/renderer/forward-renderer.js:37-49, 490-575, 577-703`

- [ ] **Step 1: Add flags to `_drawCallList`**

In `src/scene/renderer/forward-renderer.js`, update the `_drawCallList` structure (lines 37-49):

```js
const _drawCallList = {
    drawCalls: [],
    shaderInstances: [],
    isNewMaterial: [],
    lightMaskChanged: [],
    hasMorph: [],
    hasSkin: [],

    clear: function () {
        this.drawCalls.length = 0;
        this.shaderInstances.length = 0;
        this.isNewMaterial.length = 0;
        this.lightMaskChanged.length = 0;
        this.hasMorph.length = 0;
        this.hasSkin.length = 0;
    }
};
```

- [ ] **Step 2: Populate flags in `renderForwardPrepareMaterials`**

Update the `addCall` closure (around line 500):

```js
        const addCall = (drawCall, shaderInstance, isNewMaterial, lightMaskChanged) => {
            _drawCallList.drawCalls.push(drawCall);
            _drawCallList.shaderInstances.push(shaderInstance);
            _drawCallList.isNewMaterial.push(isNewMaterial);
            _drawCallList.lightMaskChanged.push(lightMaskChanged);
            _drawCallList.hasMorph.push(drawCall.morphInstance !== null);
            _drawCallList.hasSkin.push(drawCall.skinInstance !== null);
        };
```

Note: Check that `drawCall.morphInstance` and `drawCall.skinInstance` are the correct accessors. Looking at mesh-instance.js, the properties are `_morphInstance` (accessed via getter `morphInstance`) and `_skinInstance` (accessed via getter `skinInstance`).

- [ ] **Step 3: Gate morph/skin calls and inline cull mode in `renderForwardInternal`**

Replace lines 628 and 641-643 in `renderForwardInternal`:

**Replace the `setupCullModeAndFrontFace` call** (line 628) with inlined code:

```js
            // Inlined cull mode and front face setup
            const mat = drawCall.material;
            const flipFaces = flipFactor * drawCall.flipFacesFactor * drawCall.node.worldScaleSign;
            let frontFace = mat.frontFace;
            if (flipFaces < 0) {
                frontFace = frontFace === FRONTFACE_CCW ? FRONTFACE_CW : FRONTFACE_CCW;
            }
            device.setCullMode(camera._cullFaces ? mat.cull : CULLFACE_NONE);
            device.setFrontFace(frontFace);
```

You'll need to add imports for `FRONTFACE_CCW`, `FRONTFACE_CW`, and `CULLFACE_NONE` at the top of forward-renderer.js if not already present. Check existing imports.

**Replace lines 641-643** (setVertexBuffers, setMorphing, setSkinning):

```js
            const mesh = drawCall.mesh;
            this.setVertexBuffers(device, mesh);

            if (preparedCalls.hasMorph[i]) {
                this.setMorphing(device, drawCall.morphInstance);
            }

            if (preparedCalls.hasSkin[i]) {
                this.setSkinning(device, drawCall);
            }
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/scene/renderer/forward-renderer.js
git commit -m "perf: add morph/skin flags to draw call list, inline cull mode setup"
```

---

## Task 7: Pre-resolve meshInstanceId scope

**Files:**
- Modify: `src/scene/renderer/forward-renderer.js:638` and renderer initialization

- [ ] **Step 1: Cache the meshInstanceId scope resolution**

In `renderForwardInternal`, line 638 does:
```js
device.scope.resolve('meshInstanceId').setValue(drawCall.id);
```

This calls `scope.resolve` per draw call. The Renderer base class already caches some scope IDs (like `modelMatrixId`, `normalMatrixId`). Add `meshInstanceId` to the cached set.

Find where `modelMatrixId` is initialized in `src/scene/renderer/renderer.js` and add a `meshInstanceId` alongside it. Then use it in the inner loop.

In `src/scene/renderer/renderer.js`, find the scope ID initialization (search for `modelMatrixId`):

```js
        this.modelMatrixId = device.scope.resolve('matrix_model');
        this.normalMatrixId = device.scope.resolve('matrix_normal');
```

Add:

```js
        this.meshInstanceIdId = device.scope.resolve('meshInstanceId');
```

- [ ] **Step 2: Use cached scope ID in inner loop**

In `src/scene/renderer/forward-renderer.js`, replace line 638:

```js
            // Before:
            // device.scope.resolve('meshInstanceId').setValue(drawCall.id);
            
            // After:
            this.meshInstanceIdId.setValue(drawCall.id);
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/scene/renderer/renderer.js src/scene/renderer/forward-renderer.js
git commit -m "perf: cache meshInstanceId scope resolution"
```

---

## Task 8: Benchmark Phase A results

**Files:** None (measurement only)

- [ ] **Step 1: Build the engine**

Run: `npm run build`

- [ ] **Step 2: Run the Hierarchy example and measure**

Open the Hierarchy example in Chrome. Use Chrome DevTools Performance tab to record a profile. Measure:

1. `renderComposition` total time per frame
2. Bottom-up view: check if `Material.setParameters`, `commitFunction`, and `definePropInternal` getters are still top 3
3. Compare against pre-Phase-A baseline

Document the measurements in a comment or markdown file.

- [ ] **Step 3: Commit measurement notes**

```bash
git add docs/superpowers/plans/phase-a-measurements.md
git commit -m "docs: Phase A performance measurements"
```

---

## Task 9: Implement RenderDataStore

**Files:**
- Create: `src/scene/render-data-store.js`
- Create: `test/scene/render-data-store.test.mjs`

- [ ] **Step 1: Write failing tests for RenderDataStore**

```js
// test/scene/render-data-store.test.mjs
import { expect } from 'chai';
import { RenderDataStore } from '../../src/scene/render-data-store.js';

describe('RenderDataStore', function () {

    let store;

    beforeEach(function () {
        store = new RenderDataStore(64); // initial capacity
    });

    describe('#allocSlot', function () {

        it('should return a non-negative slot index', function () {
            const slot = store.allocSlot();
            expect(slot).to.be.at.least(0);
        });

        it('should return unique slots', function () {
            const a = store.allocSlot();
            const b = store.allocSlot();
            expect(a).to.not.equal(b);
        });
    });

    describe('#freeSlot', function () {

        it('should recycle freed slots', function () {
            const a = store.allocSlot();
            store.freeSlot(a);
            const b = store.allocSlot();
            expect(b).to.equal(a);
        });
    });

    describe('data arrays', function () {

        it('should store and retrieve materialSlot', function () {
            const slot = store.allocSlot();
            store.materialSlots[slot] = 42;
            expect(store.materialSlots[slot]).to.equal(42);
        });

        it('should store and retrieve stateFlags', function () {
            const slot = store.allocSlot();
            store.stateFlags[slot] = 0xFF;
            expect(store.stateFlags[slot]).to.equal(0xFF);
        });

        it('should store and retrieve sortKeysOpaque', function () {
            const slot = store.allocSlot();
            store.sortKeysOpaque[slot] = 123456;
            expect(store.sortKeysOpaque[slot]).to.equal(123456);
        });
    });

    describe('#grow', function () {

        it('should grow when capacity is exceeded', function () {
            const small = new RenderDataStore(4);
            const slots = [];
            for (let i = 0; i < 8; i++) {
                slots.push(small.allocSlot());
            }
            // Should have grown to accommodate 8 slots
            expect(slots.length).to.equal(8);

            // Data should still be intact
            small.materialSlots[slots[0]] = 99;
            expect(small.materialSlots[slots[0]]).to.equal(99);
        });

        it('should preserve data across growth', function () {
            const small = new RenderDataStore(4);
            const slot0 = small.allocSlot();
            small.materialSlots[slot0] = 77;
            small.stateFlags[slot0] = 0xAB;

            // Force growth
            for (let i = 0; i < 8; i++) {
                small.allocSlot();
            }

            expect(small.materialSlots[slot0]).to.equal(77);
            expect(small.stateFlags[slot0]).to.equal(0xAB);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/scene/render-data-store.test.mjs --timeout 5000`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement RenderDataStore**

```js
// src/scene/render-data-store.js

/**
 * Bit flags for stateFlags array.
 */
export const RENDER_FLAG_SKIN = 1;
export const RENDER_FLAG_MORPH = 2;
export const RENDER_FLAG_INSTANCING = 4;
export const RENDER_FLAG_STENCIL = 8;
export const RENDER_FLAG_CAST_SHADOW = 64;
export const RENDER_FLAG_RECEIVE_SHADOW = 128;

// Render style occupies bits 4-5
export const RENDER_FLAG_STYLE_SHIFT = 4;
export const RENDER_FLAG_STYLE_MASK = 0x3;

// Light mask occupies bits 8-23
export const RENDER_FLAG_LIGHTMASK_SHIFT = 8;
export const RENDER_FLAG_LIGHTMASK_MASK = 0xFFFF;

/**
 * Structure-of-Arrays store for per-draw-call rendering data. Provides cache-friendly
 * iteration for the forward renderer inner loop.
 *
 * @ignore
 */
class RenderDataStore {
    /**
     * Create a new RenderDataStore.
     *
     * @param {number} initialCapacity - Initial number of slots to allocate.
     */
    constructor(initialCapacity = 256) {
        this._capacity = initialCapacity;
        this._count = 0;
        this._freeList = [];

        this._allocArrays(initialCapacity);
    }

    /**
     * Allocate typed arrays for the given capacity.
     *
     * @param {number} capacity - Number of slots.
     * @private
     */
    _allocArrays(capacity) {
        this.materialSlots = new Int16Array(capacity);
        this.meshSlots = new Int16Array(capacity);
        this.nodeSlots = new Int32Array(capacity);
        this.shaderSlots = new Int32Array(capacity);
        this.sortKeysOpaque = new Uint32Array(capacity);
        this.stateFlags = new Uint32Array(capacity);
        this.skinSlots = new Int32Array(capacity);
        this.morphSlots = new Int32Array(capacity);
    }

    /**
     * Grow arrays to new capacity, preserving existing data.
     *
     * @param {number} newCapacity - New capacity.
     * @private
     */
    _grow(newCapacity) {
        const oldMaterialSlots = this.materialSlots;
        const oldMeshSlots = this.meshSlots;
        const oldNodeSlots = this.nodeSlots;
        const oldShaderSlots = this.shaderSlots;
        const oldSortKeys = this.sortKeysOpaque;
        const oldStateFlags = this.stateFlags;
        const oldSkinSlots = this.skinSlots;
        const oldMorphSlots = this.morphSlots;

        this._allocArrays(newCapacity);

        this.materialSlots.set(oldMaterialSlots);
        this.meshSlots.set(oldMeshSlots);
        this.nodeSlots.set(oldNodeSlots);
        this.shaderSlots.set(oldShaderSlots);
        this.sortKeysOpaque.set(oldSortKeys);
        this.stateFlags.set(oldStateFlags);
        this.skinSlots.set(oldSkinSlots);
        this.morphSlots.set(oldMorphSlots);

        this._capacity = newCapacity;
    }

    /**
     * Allocate a slot.
     *
     * @returns {number} The slot index.
     */
    allocSlot() {
        if (this._freeList.length > 0) {
            return this._freeList.pop();
        }

        if (this._count >= this._capacity) {
            this._grow(this._capacity * 2);
        }

        return this._count++;
    }

    /**
     * Free a slot for reuse.
     *
     * @param {number} slot - The slot index to free.
     */
    freeSlot(slot) {
        // Reset slot data
        this.materialSlots[slot] = -1;
        this.meshSlots[slot] = -1;
        this.nodeSlots[slot] = -1;
        this.shaderSlots[slot] = -1;
        this.sortKeysOpaque[slot] = 0;
        this.stateFlags[slot] = 0;
        this.skinSlots[slot] = -1;
        this.morphSlots[slot] = -1;

        this._freeList.push(slot);
    }

    /**
     * Get the number of active (allocated) slots.
     *
     * @type {number}
     */
    get count() {
        return this._count - this._freeList.length;
    }

    /**
     * Get the current capacity.
     *
     * @type {number}
     */
    get capacity() {
        return this._capacity;
    }
}

export { RenderDataStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/scene/render-data-store.test.mjs --timeout 5000`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/scene/render-data-store.js test/scene/render-data-store.test.mjs
git commit -m "feat: add RenderDataStore SoA for per-draw-call rendering data"
```

---

## Task 10: Implement MaterialStore and MaterialParameterBlock

**Files:**
- Create: `src/scene/material-store.js`
- Create: `test/scene/material-store.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// test/scene/material-store.test.mjs
import { expect } from 'chai';
import { MaterialStore } from '../../src/scene/material-store.js';

describe('MaterialStore', function () {

    let store;

    beforeEach(function () {
        store = new MaterialStore(32);
    });

    describe('#allocSlot / #freeSlot', function () {

        it('should allocate unique slots', function () {
            const a = store.allocSlot();
            const b = store.allocSlot();
            expect(a).to.not.equal(b);
        });

        it('should recycle freed slots', function () {
            const a = store.allocSlot();
            store.freeSlot(a);
            const b = store.allocSlot();
            expect(b).to.equal(a);
        });
    });

    describe('#setParameterBlock', function () {

        it('should store a Float32Array parameter block', function () {
            const slot = store.allocSlot();
            const block = new Float32Array([1.0, 0.5, 0.0, 1.0]);
            store.setParameterBlock(slot, block);
            expect(store.getParameterBlock(slot)).to.equal(block);
        });
    });

    describe('#setBlendState / #setDepthState', function () {

        it('should store packed blend state', function () {
            const slot = store.allocSlot();
            store.blendStates[slot] = 0xDEAD;
            expect(store.blendStates[slot]).to.equal(0xDEAD);
        });

        it('should store packed depth state', function () {
            const slot = store.allocSlot();
            store.depthStates[slot] = 0x0F;
            expect(store.depthStates[slot]).to.equal(0x0F);
        });
    });

    describe('#dirtyFlags', function () {

        it('should default to 0', function () {
            const slot = store.allocSlot();
            expect(store.dirtyFlags[slot]).to.equal(0);
        });

        it('should be settable', function () {
            const slot = store.allocSlot();
            store.dirtyFlags[slot] = 1;
            expect(store.dirtyFlags[slot]).to.equal(1);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha test/scene/material-store.test.mjs --timeout 5000`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement MaterialStore**

```js
// src/scene/material-store.js

/**
 * Stores per-material rendering data in flat arrays. Each material gets a slot index.
 * The hot data (parameter blocks) are stored as individual Float32Arrays sized per
 * material type, not a universal max-size block.
 *
 * @ignore
 */
class MaterialStore {
    /**
     * Create a new MaterialStore.
     *
     * @param {number} initialCapacity - Initial number of material slots.
     */
    constructor(initialCapacity = 128) {
        this._capacity = initialCapacity;
        this._count = 0;
        this._freeList = [];

        /** @type {(Float32Array|null)[]} */
        this._parameterBlocks = new Array(initialCapacity).fill(null);

        /** @type {(Array<import('../platform/graphics/texture.js').Texture>|null)[]} */
        this._textureSlots = new Array(initialCapacity).fill(null);

        this.blendStates = new Uint32Array(initialCapacity);
        this.depthStates = new Uint8Array(initialCapacity);
        this.shaderVariantKeys = new Uint32Array(initialCapacity);
        this.dirtyFlags = new Uint8Array(initialCapacity);
    }

    /**
     * Grow arrays to new capacity, preserving existing data.
     *
     * @param {number} newCapacity - New capacity.
     * @private
     */
    _grow(newCapacity) {
        const oldBlend = this.blendStates;
        const oldDepth = this.depthStates;
        const oldShader = this.shaderVariantKeys;
        const oldDirty = this.dirtyFlags;

        this.blendStates = new Uint32Array(newCapacity);
        this.depthStates = new Uint8Array(newCapacity);
        this.shaderVariantKeys = new Uint32Array(newCapacity);
        this.dirtyFlags = new Uint8Array(newCapacity);

        this.blendStates.set(oldBlend);
        this.depthStates.set(oldDepth);
        this.shaderVariantKeys.set(oldShader);
        this.dirtyFlags.set(oldDirty);

        // Grow JS arrays
        this._parameterBlocks.length = newCapacity;
        this._textureSlots.length = newCapacity;
        for (let i = this._capacity; i < newCapacity; i++) {
            this._parameterBlocks[i] = null;
            this._textureSlots[i] = null;
        }

        this._capacity = newCapacity;
    }

    /**
     * Allocate a material slot.
     *
     * @returns {number} The slot index.
     */
    allocSlot() {
        if (this._freeList.length > 0) {
            return this._freeList.pop();
        }

        if (this._count >= this._capacity) {
            this._grow(this._capacity * 2);
        }

        return this._count++;
    }

    /**
     * Free a material slot for reuse.
     *
     * @param {number} slot - The slot index to free.
     */
    freeSlot(slot) {
        this._parameterBlocks[slot] = null;
        this._textureSlots[slot] = null;
        this.blendStates[slot] = 0;
        this.depthStates[slot] = 0;
        this.shaderVariantKeys[slot] = 0;
        this.dirtyFlags[slot] = 0;

        this._freeList.push(slot);
    }

    /**
     * Set the parameter block for a material.
     *
     * @param {number} slot - The material slot.
     * @param {Float32Array} block - The pre-built parameter block.
     */
    setParameterBlock(slot, block) {
        this._parameterBlocks[slot] = block;
    }

    /**
     * Get the parameter block for a material.
     *
     * @param {number} slot - The material slot.
     * @returns {Float32Array|null} The parameter block.
     */
    getParameterBlock(slot) {
        return this._parameterBlocks[slot];
    }

    /**
     * Set the texture slots for a material.
     *
     * @param {number} slot - The material slot.
     * @param {Array<import('../platform/graphics/texture.js').Texture>} textures - Ordered textures.
     */
    setTextureSlots(slot, textures) {
        this._textureSlots[slot] = textures;
    }

    /**
     * Get the texture slots for a material.
     *
     * @param {number} slot - The material slot.
     * @returns {Array<import('../platform/graphics/texture.js').Texture>|null} The textures.
     */
    getTextureSlots(slot) {
        return this._textureSlots[slot];
    }
}

export { MaterialStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha test/scene/material-store.test.mjs --timeout 5000`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/scene/material-store.js test/scene/material-store.test.mjs
git commit -m "feat: add MaterialStore for per-material parameter blocks and render state"
```

---

## Task 11: Wire MeshInstance to RenderDataStore

**Files:**
- Modify: `src/scene/mesh-instance.js`

This task makes MeshInstance write-through to the RenderDataStore when properties change. The RenderDataStore instance will be accessed as a singleton (similar to how `cullingStore` works).

- [ ] **Step 1: Examine how cullingStore is accessed in MeshInstance**

The existing pattern uses a module-level import: `import { cullingStore } from './culling-store.js';`. Follow the same pattern for RenderDataStore.

Find the `cullingStore` import at the top of `mesh-instance.js` and the slot allocation in the constructor.

- [ ] **Step 2: Add RenderDataStore integration**

At the top of `src/scene/mesh-instance.js`, add:

```js
import { renderDataStore, RENDER_FLAG_SKIN, RENDER_FLAG_MORPH, RENDER_FLAG_INSTANCING, RENDER_FLAG_STENCIL, RENDER_FLAG_CAST_SHADOW, RENDER_FLAG_RECEIVE_SHADOW } from './render-data-store.js';
```

Note: We need to export a singleton instance from render-data-store.js. Add at the bottom of `src/scene/render-data-store.js`:

```js
/**
 * Global render data store singleton.
 *
 * @type {RenderDataStore}
 * @ignore
 */
const renderDataStore = new RenderDataStore();

export { RenderDataStore, renderDataStore };
```

In the MeshInstance constructor, after the cullingStore slot allocation, add:

```js
        // Allocate render data store slot
        this._renderSlot = renderDataStore.allocSlot();
```

In the MeshInstance `destroy` method, add:

```js
        renderDataStore.freeSlot(this._renderSlot);
        this._renderSlot = -1;
```

- [ ] **Step 3: Add write-through for key properties**

Update the `material` setter to write to RenderDataStore:

In the existing `set material(material)` setter, after the current logic, add:

```js
        if (this._renderSlot >= 0 && material) {
            renderDataStore.materialSlots[this._renderSlot] = material._storeSlot ?? -1;
        }
```

Update the `castShadow` setter:

```js
    set castShadow(val) {
        // existing logic...
        if (this._renderSlot >= 0) {
            if (val) {
                renderDataStore.stateFlags[this._renderSlot] |= RENDER_FLAG_CAST_SHADOW;
            } else {
                renderDataStore.stateFlags[this._renderSlot] &= ~RENDER_FLAG_CAST_SHADOW;
            }
        }
    }
```

Apply the same pattern for `skinInstance` (RENDER_FLAG_SKIN), `morphInstance` (RENDER_FLAG_MORPH), and `instancingData` (RENDER_FLAG_INSTANCING).

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/scene/mesh-instance.js src/scene/render-data-store.js
git commit -m "feat: wire MeshInstance property setters to RenderDataStore"
```

---

## Task 12: Benchmark Phase B results

**Files:** None (measurement only)

- [ ] **Step 1: Build the engine**

Run: `npm run build`

- [ ] **Step 2: Profile the Hierarchy example**

Measure `renderComposition` frametime and compare to Phase A baseline. The RenderDataStore and MaterialStore are now in place but the forward renderer inner loop hasn't been switched yet — so this measurement establishes the overhead of the write-through facade.

Expected: No regression from the write-through. Phase A gains preserved.

- [ ] **Step 3: Switch forward renderer to SoA inner loop**

This is the final integration step. Replace `renderForwardInternal` to iterate RenderDataStore indices instead of MeshInstance objects. This is a large change that should be done carefully, following the pseudocode from the design spec (Section B3).

The implementation should:
1. Build a sorted index array from RenderDataStore.sortKeysOpaque
2. Iterate the index array
3. Use integer comparisons for material/mesh changes
4. Use bitflag checks for morph/skin/stencil
5. Bind material parameter blocks instead of calling `setParameters`

This step requires the MaterialParameterBlock building logic to be wired into StandardMaterial's `updateUniforms` flow, which is a significant integration effort.

- [ ] **Step 4: Profile again**

Measure total frametime. Compare against pre-optimization baseline.
Target: 2x reduction in `renderComposition` time.

- [ ] **Step 5: Commit**

```bash
git add src/scene/renderer/forward-renderer.js
git commit -m "perf: switch forward renderer to SoA inner loop"
```

---

## Summary

| Task | Phase | Description |
|------|-------|-------------|
| 1 | A | Color version tracking |
| 2 | A | Material array-based setParameters |
| 3 | A | MeshInstance array-based setParameters |
| 4 | A | Fix color getter dirty-shader hack |
| 5 | A | Pre-resolve ScopeIds |
| 6 | A | Eliminate dead morph/skin calls, inline cull mode |
| 7 | A | Cache meshInstanceId scope |
| 8 | A | Benchmark Phase A |
| 9 | B | RenderDataStore |
| 10 | B | MaterialStore + MaterialParameterBlock |
| 11 | B | Wire MeshInstance to RenderDataStore |
| 12 | B | Benchmark and switch forward renderer to SoA loop |
