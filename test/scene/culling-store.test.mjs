import { expect } from 'chai';
import { CullingStore, CULL_VISIBLE, CULL_ENABLED, CULL_TRANSPARENT, CULL_CUSTOM } from '../../src/scene/culling-store.js';

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
});
