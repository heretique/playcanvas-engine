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

        it('should set only named parameters when filter Material provided', function () {
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

            // Filter with another Material that only has param_a
            const filter = new Material();
            filter._setParameterSimple('param_a', 999);

            mat.setParameters(mockDevice, filter);

            expect(values['param_a']).to.equal(1.0);
            expect(values['param_b']).to.be.undefined;
        });

        it('should fall back to for...in when names is a plain object', function () {
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

            // Plain object filter (like MeshInstance.parameters)
            const plainFilter = { param_a: { scopeId: null, data: 999 } };

            mat.setParameters(mockDevice, plainFilter);

            expect(values['param_a']).to.equal(1.0);
            expect(values['param_b']).to.be.undefined;
        });
    });
});
