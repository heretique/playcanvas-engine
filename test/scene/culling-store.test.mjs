import { expect } from 'chai';
import { CullingStore, CULL_VISIBLE, CULL_ENABLED, CULL_TRANSPARENT, CULL_CUSTOM } from '../../src/scene/culling-store.js';
import { TransformStore } from '../../src/scene/transform-store.js';

describe('CullingStore', function () {

    describe('slot lifecycle', function () {

        it('should allocate sequential slots', function () {
            const store = new CullingStore(16);
            const s0 = store.allocSlot();
            const s1 = store.allocSlot();
            expect(s0).to.equal(0);
            expect(s1).to.equal(1);
            expect(store.count).to.equal(2);
        });

        it('should reuse freed slots', function () {
            const store = new CullingStore(16);
            const s0 = store.allocSlot();
            store.allocSlot();
            store.freeSlot(s0);
            expect(store.count).to.equal(1);
            const s2 = store.allocSlot();
            expect(s2).to.equal(s0);
            expect(store.count).to.equal(2);
        });

        it('should grow when capacity is exceeded', function () {
            const store = new CullingStore(2);
            store.allocSlot();
            store.allocSlot();
            const s2 = store.allocSlot();
            expect(s2).to.equal(2);
            expect(store.capacity).to.be.greaterThanOrEqual(3);
            expect(store.sphereData.length).to.be.greaterThanOrEqual(3 * 4);
        });

        it('should initialize flags to 0 on alloc', function () {
            const store = new CullingStore(16);
            const s0 = store.allocSlot();
            expect(store.flagsData[s0]).to.equal(0);
        });

        it('should clear data on free', function () {
            const store = new CullingStore(16);
            const s0 = store.allocSlot();
            store.flagsData[s0] = CULL_VISIBLE | CULL_ENABLED;
            store.sphereData[s0 * 4 + 3] = 5.0;
            store.freeSlot(s0);
            expect(store.flagsData[s0]).to.equal(0);
            expect(store.sphereData[s0 * 4 + 3]).to.equal(0);
        });
    });

    describe('local bounds', function () {

        it('should store local bounds at the correct offset', function () {
            const store = new CullingStore(16);
            const slot = store.allocSlot();
            store.setLocalBounds(slot, 1, 2, 3, 4.5);
            const off = slot * 4;
            expect(store.localBoundsData[off]).to.equal(1);
            expect(store.localBoundsData[off + 1]).to.equal(2);
            expect(store.localBoundsData[off + 2]).to.equal(3);
            expect(store.localBoundsData[off + 3]).to.equal(4.5);
        });
    });

    describe('updateWorldSpheres', function () {

        it('should transform local sphere center by world matrix and scale radius', function () {
            const ts = new TransformStore(16);
            const cs = new CullingStore(16);

            // Allocate a graph node slot with a translation of (10, 0, 0)
            const nodeSlot = ts.allocSlot();
            ts.setLocalPosition(nodeSlot, 10, 0, 0);
            ts.parentSlot[nodeSlot] = -1; // root node
            ts.propagate();

            // Allocate a culling slot linked to that node
            const cullSlot = cs.allocSlot();
            cs.graphNodeSlots[cullSlot] = nodeSlot;
            cs.setLocalBounds(cullSlot, 0, 0, 0, 1.0); // unit sphere at origin

            cs.updateWorldSpheres(ts, ts.currentFrame);

            const off = cullSlot * 4;
            expect(cs.sphereData[off]).to.be.closeTo(10, 0.001);     // cx translated
            expect(cs.sphereData[off + 1]).to.be.closeTo(0, 0.001);  // cy
            expect(cs.sphereData[off + 2]).to.be.closeTo(0, 0.001);  // cz
            expect(cs.sphereData[off + 3]).to.be.closeTo(1, 0.001);  // radius unchanged (uniform scale=1)
        });

        it('should scale radius by max axis scale', function () {
            const ts = new TransformStore(16);
            const cs = new CullingStore(16);

            const nodeSlot = ts.allocSlot();
            ts.setLocalPosition(nodeSlot, 0, 0, 0);
            ts.setLocalScale(nodeSlot, 2, 3, 1); // max scale = 3
            ts.parentSlot[nodeSlot] = -1;
            ts.propagate();

            const cullSlot = cs.allocSlot();
            cs.graphNodeSlots[cullSlot] = nodeSlot;
            cs.setLocalBounds(cullSlot, 0, 0, 0, 1.0);

            cs.updateWorldSpheres(ts, ts.currentFrame);

            const off = cullSlot * 4;
            expect(cs.sphereData[off + 3]).to.be.closeTo(3, 0.001); // radius scaled by max axis
        });

        it('should only update slots whose graph node was updated this frame', function () {
            const ts = new TransformStore(16);
            const cs = new CullingStore(16);

            const nodeSlot = ts.allocSlot();
            ts.setLocalPosition(nodeSlot, 5, 0, 0);
            ts.parentSlot[nodeSlot] = -1;
            ts.propagate(); // frame 1

            const cullSlot = cs.allocSlot();
            cs.graphNodeSlots[cullSlot] = nodeSlot;
            cs.setLocalBounds(cullSlot, 0, 0, 0, 1.0);
            cs.updateWorldSpheres(ts, ts.currentFrame);

            // Manually overwrite sphere to detect if it gets re-updated
            cs.sphereData[cullSlot * 4] = 999;

            // Advance frame without modifying the node
            ts.currentFrame++;
            cs.updateWorldSpheres(ts, ts.currentFrame);

            // Should NOT have been updated (no transform change this frame)
            expect(cs.sphereData[cullSlot * 4]).to.equal(999);
        });
    });
});
