import { BufferAttribute, BufferGeometry, AdditiveBlending, LineSegments, ShaderMaterial, Vector3 } from 'three';
import { DUST_FRAG, DUST_VERT } from './shaders';

const MAX_DUST = 400;
const BOX = 520;

/**
 * 速度感を出すための宇宙塵。位置の更新は頂点シェーダー(mod によるラップ)で行うので CPU 負荷はほぼ無し。
 * 船の速度に応じて線分(ストリーク)が伸びる。
 */
export class SpaceDust {
  readonly object: LineSegments;
  private mat: ShaderMaterial;
  private geo: BufferGeometry;

  constructor() {
    const seed = new Float32Array(MAX_DUST * 2 * 3);
    const end = new Float32Array(MAX_DUST * 2);
    let a = 12345;
    const r = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    for (let i = 0; i < MAX_DUST; i++) {
      const x = r(), y = r(), z = r();
      for (let k = 0; k < 2; k++) {
        seed[(i * 2 + k) * 3] = x;
        seed[(i * 2 + k) * 3 + 1] = y;
        seed[(i * 2 + k) * 3 + 2] = z;
        end[i * 2 + k] = k;
      }
    }
    this.geo = new BufferGeometry();
    // position は使わないがダミーで必要(頂点数の決定)
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_DUST * 2 * 3), 3));
    this.geo.setAttribute('aSeed', new BufferAttribute(seed, 3));
    this.geo.setAttribute('aEnd', new BufferAttribute(end, 1));
    this.mat = new ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        uCamMod: { value: new Vector3() },
        uBox: { value: BOX },
        uVel: { value: new Vector3() },
        uStreak: { value: 0.05 },
        uAlpha: { value: 0 },
      },
    });
    this.object = new LineSegments(this.geo, this.mat);
    this.object.frustumCulled = false;
  }

  setCount(n: number): void {
    this.geo.setDrawRange(0, Math.min(MAX_DUST, n) * 2);
  }

  /** shipPos: ワールド座標(倍精度)。vel: ワールド速度 */
  update(shipPos: Vector3, vel: Vector3, cameraScenePos: Vector3, speed: number): void {
    const m = (v: number) => ((v % BOX) + BOX) % BOX;
    this.mat.uniforms.uCamMod.value.set(m(shipPos.x), m(shipPos.y), m(shipPos.z));
    this.mat.uniforms.uVel.value.copy(vel);
    // 速いほどストリークを伸ばし、少し濃くする。低速では目立たない粒に近づける
    this.mat.uniforms.uStreak.value = 0.012 + Math.min(speed / 1200, 1) * 0.06;
    this.mat.uniforms.uAlpha.value = Math.min(1, 0.2 + speed / 220) * 0.75;
    this.object.position.copy(cameraScenePos);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.object.removeFromParent();
  }
}
