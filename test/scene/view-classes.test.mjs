import { expect } from 'chai';

import { Vec3 } from '../../src/core/math/vec3.js';
import { Quat } from '../../src/core/math/quat.js';
import { Mat4 } from '../../src/core/math/mat4.js';
import { Vec3View, QuatView } from '../../src/scene/view-classes.js';

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

describe('QuatView', function () {

    let store;

    beforeEach(function () {
        store = {
            localData: new Float32Array(20),
            flags: new Uint16Array(2)
        };
    });

    it('should be an instanceof Quat', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        expect(q).to.be.an.instanceof(Quat);
    });

    it('should read x/y/z/w from the store', function () {
        store.localData[0] = 1;
        store.localData[1] = 2;
        store.localData[2] = 3;
        store.localData[3] = 4;
        const q = new QuatView(store, 'localData', 0, 0);
        expect(q.x).to.equal(1);
        expect(q.y).to.equal(2);
        expect(q.z).to.equal(3);
        expect(q.w).to.equal(4);
    });

    it('should write x/y/z/w to the store', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.x = 5;
        q.y = 6;
        q.z = 7;
        q.w = 8;
        expect(store.localData[0]).to.equal(5);
        expect(store.localData[1]).to.equal(6);
        expect(store.localData[2]).to.equal(7);
        expect(store.localData[3]).to.equal(8);
    });

    it('should set dirty flags on write', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        expect(store.flags[0]).to.equal(0);
        q.x = 1;
        expect(store.flags[0] & 0x03).to.equal(0x03);

        store.flags[0] = 0;
        q.w = 1;
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should set() all components and dirty once', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.set(0.1, 0.2, 0.3, 0.4);
        expect(store.localData[0]).to.be.closeTo(0.1, 1e-6);
        expect(store.localData[1]).to.be.closeTo(0.2, 1e-6);
        expect(store.localData[2]).to.be.closeTo(0.3, 1e-6);
        expect(store.localData[3]).to.be.closeTo(0.4, 1e-6);
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should copy() from another quaternion', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        const src = new Quat(0.5, 0.5, 0.5, 0.5);
        q.copy(src);
        expect(store.localData[0]).to.equal(0.5);
        expect(store.localData[1]).to.equal(0.5);
        expect(store.localData[2]).to.equal(0.5);
        expect(store.localData[3]).to.equal(0.5);
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should clone() as a plain Quat', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.set(0.1, 0.2, 0.3, 0.4);
        const c = q.clone();
        expect(c).to.be.an.instanceof(Quat);
        expect(c).to.not.be.an.instanceof(QuatView);
        expect(c.x).to.be.closeTo(0.1, 1e-6);
        expect(c.y).to.be.closeTo(0.2, 1e-6);
        expect(c.z).to.be.closeTo(0.3, 1e-6);
        expect(c.w).to.be.closeTo(0.4, 1e-6);
    });

    it('should support inherited setFromEulerAngles()', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.setFromEulerAngles(0, 90, 0);
        // 90 degree rotation around Y: expect x=0, y~0.707, z=0, w~0.707
        expect(q.x).to.be.closeTo(0, 1e-4);
        expect(q.y).to.be.closeTo(0.7071, 1e-3);
        expect(q.z).to.be.closeTo(0, 1e-4);
        expect(q.w).to.be.closeTo(0.7071, 1e-3);
        expect(store.flags[0] & 0x03).to.equal(0x03);
    });

    it('should support inherited mul()', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.set(0, 0, 0, 1); // identity
        const r = new Quat();
        r.setFromEulerAngles(0, 90, 0);
        q.mul(r);
        expect(q.y).to.be.closeTo(0.7071, 1e-3);
        expect(q.w).to.be.closeTo(0.7071, 1e-3);
    });

    it('should support inherited slerp()', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        const a = new Quat(0, 0, 0, 1);
        const b = new Quat();
        b.setFromEulerAngles(0, 90, 0);
        q.slerp(a, b, 0.5);
        // halfway between identity and 90deg Y -> 45deg Y
        expect(q.y).to.be.closeTo(Math.sin(Math.PI / 8), 1e-3);
        expect(q.w).to.be.closeTo(Math.cos(Math.PI / 8), 1e-3);
    });

    it('should support inherited transformVector()', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.setFromEulerAngles(0, 90, 0);
        const v = new Vec3(1, 0, 0);
        const result = new Vec3();
        q.transformVector(v, result);
        // 90deg Y rotation transforms (1,0,0) -> (0,0,-1)
        expect(result.x).to.be.closeTo(0, 1e-4);
        expect(result.z).to.be.closeTo(-1, 1e-4);
    });

    it('should support inherited getEulerAngles()', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.setFromEulerAngles(10, 20, 30);
        const euler = q.getEulerAngles();
        expect(euler.x).to.be.closeTo(10, 0.1);
        expect(euler.y).to.be.closeTo(20, 0.1);
        expect(euler.z).to.be.closeTo(30, 0.1);
    });

    it('should survive store array replacement (indirect access)', function () {
        const q = new QuatView(store, 'localData', 0, 0);
        q.set(0.1, 0.2, 0.3, 0.4);

        const newData = new Float32Array(40);
        newData.set(store.localData);
        store.localData = newData;

        expect(q.x).to.be.closeTo(0.1, 1e-6);
        expect(q.y).to.be.closeTo(0.2, 1e-6);
        expect(q.z).to.be.closeTo(0.3, 1e-6);
        expect(q.w).to.be.closeTo(0.4, 1e-6);

        q.x = 100;
        expect(store.localData[0]).to.equal(100);
    });
});
