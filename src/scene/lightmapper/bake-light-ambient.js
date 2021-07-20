import { Vec3 } from '../../math/vec3.js';
import { math } from '../../math/math.js';
import { BakeLight } from './bake-light.js';

const _tempPoint = new Vec3();

class BakeLightAmbient extends BakeLight {
    constructor() {

        const lightEntity = new pc.Entity("AmbientLight");
        lightEntity.addComponent("light", {
            type: "directional",
            affectDynamic: true,
            affectLightmapped: false,
            bake: true,
            numBakeSamples: 50,
            castShadows: true,
            normalOffsetBias: 0.05,
            shadowBias: 0.2,
            shadowDistance: 50,
            shadowResolution: 2048,
            shadowType: pc.SHADOW_PCF3,
            color: pc.Color.WHITE,
            intensity: 1
        });

        super(lightEntity.light.light);
    }

    prepareVirtualLight(index, numVirtualLights) {

        // directional points down the negative Y-axis
        math.fibonacciSpherePoint(_tempPoint, index, numVirtualLights, 0, 0.4);
        this.light._node.lookAt(_tempPoint.mulScalar(-1));
        this.light._node.rotateLocal(90, 0, 0);



        // TODO: this does not seem to work well and lightmap gets dark with more virtual lights
        this.light.intensity = this.intensity / numVirtualLights;
    }
}

export { BakeLightAmbient };