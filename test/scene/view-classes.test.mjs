import { expect } from 'chai';

import { Vec3 } from '../../src/core/math/vec3.js';
import { Quat } from '../../src/core/math/quat.js';
import { Mat4 } from '../../src/core/math/mat4.js';
import { Vec3View } from '../../src/scene/view-classes.js';

describe('Vec3View', function () {

    let store;

    beforeEach(function () {
        store = {
            localData: new Float32Array(20),
            flags: new Uint16Array(2)
        };
        store.localData[6] = 1; // qw
        store.localData[7] = 1; // sx
        store.localData[8] = 1; // sy
        store.localData[9] = 1; // sz
    });

    it('should be an instanceof Vec3', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        expect(v).to.be.an.instanceof(Vec3);
    });

    it('should read x/y/z from the store', function () {
        store.localData[0] = 10;
        store.localData[1] = 20;
        store.localData[2] = 30;
        const v = new Vec3View(store, 'localData', 0, 0);
        expect(v.x).to.equal(10);
        expect(v.y).to.equal(20);
        expect(v.z).to.equal(30);
    });

    it('should write x/y/z to the store', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.x = 5;
        v.y = 6;
        v.z = 7;
        expect(store.localData[0]).to.equal(5);
        expect(store.localData[1]).to.equal(6);
        expect(store.localData[2]).to.equal(7);
    });

    it('should set dirty flags on write', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        expect(store.flags[0]).to.equal(0);
        v.x = 1;
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should set() all components and dirty once', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(4, 5, 6);
        expect(store.localData[0]).to.equal(4);
        expect(store.localData[1]).to.equal(5);
        expect(store.localData[2]).to.equal(6);
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should copy() from another vector', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        const src = new Vec3(11, 22, 33);
        v.copy(src);
        expect(store.localData[0]).to.equal(11);
        expect(store.localData[1]).to.equal(22);
        expect(store.localData[2]).to.equal(33);
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should support inherited add()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(1, 2, 3);
        store.flags[0] = 0;
        v.add(new Vec3(10, 20, 30));
        expect(v.x).to.equal(11);
        expect(v.y).to.equal(22);
        expect(v.z).to.equal(33);
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should support inherited sub()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(10, 20, 30);
        store.flags[0] = 0;
        v.sub(new Vec3(1, 2, 3));
        expect(v.x).to.equal(9);
        expect(v.y).to.equal(18);
        expect(v.z).to.equal(27);
    });

    it('should support inherited mulScalar()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(2, 3, 4);
        store.flags[0] = 0;
        v.mulScalar(3);
        expect(v.x).to.equal(6);
        expect(v.y).to.equal(9);
        expect(v.z).to.equal(12);
    });

    it('should support inherited length()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(3, 4, 0);
        expect(v.length()).to.equal(5);
    });

    it('should support inherited normalize()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(3, 0, 0);
        store.flags[0] = 0;
        v.normalize();
        expect(v.x).to.equal(1);
        expect(v.y).to.equal(0);
        expect(v.z).to.equal(0);
    });

    it('should support inherited dot()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(1, 2, 3);
        expect(v.dot(new Vec3(4, 5, 6))).to.equal(32);
    });

    it('should support inherited clone()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(7, 8, 9);
        const c = v.clone();
        expect(c).to.be.an.instanceof(Vec3);
        expect(c.x).to.equal(7);
        expect(c.y).to.equal(8);
        expect(c.z).to.equal(9);
    });

    it('should support inherited equals()', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(1, 2, 3);
        expect(v.equals(new Vec3(1, 2, 3))).to.be.true;
        expect(v.equals(new Vec3(1, 2, 4))).to.be.false;
    });

    it('should reflect external store writes', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        store.localData[0] = 99;
        expect(v.x).to.equal(99);
    });

    it('should survive store array replacement (indirect access)', function () {
        const v = new Vec3View(store, 'localData', 0, 0);
        v.set(1, 2, 3);

        const newData = new Float32Array(40);
        newData.set(store.localData);
        store.localData = newData;

        expect(v.x).to.equal(1);
        expect(v.y).to.equal(2);
        expect(v.z).to.equal(3);

        v.x = 100;
        expect(store.localData[0]).to.equal(100);
    });
});
