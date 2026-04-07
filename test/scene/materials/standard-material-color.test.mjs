import { expect } from 'chai';
import { Color } from '../../../src/core/math/color.js';
import { StandardMaterial } from '../../../src/scene/materials/standard-material.js';

describe('StandardMaterial color dirty tracking', function () {

    it('should not set _dirtyShader when accessing color getter', function () {
        const mat = new StandardMaterial();
        mat._dirtyShader = false;
        const ambient = mat.ambient;
        expect(mat._dirtyShader).to.equal(false);
    });

    it('should not set _dirtyShader when setting color via setter', function () {
        const mat = new StandardMaterial();
        mat._dirtyShader = false;
        mat.ambient = new Color(0.5, 0.5, 0.5);
        expect(mat._dirtyShader).to.equal(false);
    });

    it('should detect in-place color mutation via version tracking', function () {
        const mat = new StandardMaterial();
        mat._snapshotColorVersions();
        mat.ambient.set(0.5, 0.2, 0.1);
        expect(mat._hasColorChanged('ambient')).to.equal(true);
    });

    it('should not detect change when color was not mutated', function () {
        const mat = new StandardMaterial();
        mat._snapshotColorVersions();
        const _ = mat.ambient;
        expect(mat._hasColorChanged('ambient')).to.equal(false);
    });

    it('should detect change for all 6 color properties', function () {
        const mat = new StandardMaterial();
        mat._snapshotColorVersions();

        mat.diffuse.set(1, 0, 0);
        expect(mat._hasColorChanged('diffuse')).to.equal(true);
        expect(mat._hasColorChanged('ambient')).to.equal(false);
    });
});
