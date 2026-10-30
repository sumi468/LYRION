import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { BodyDef } from '../data/types';
import { SUN_FRAG, SUN_VERT } from './shaders';
import { createGlowTexture } from './bake';
import { sphereGeo } from './BodyView';
import type { QualityProfile } from './quality';

/** 恒星: リアルタイムの粒状模様シェーダー + コロナ用の加算スプライト(ポストプロセス不使用) */
export class SunView {
  readonly group = new Group();
  private mat: ShaderMaterial;
  private mesh: Mesh;
  private glowA: Sprite;
  private glowB: Sprite;
  private glowTexA: CanvasTexture;
  private glowTexB: CanvasTexture;
  distance = 0;

  constructor(readonly def: BodyDef, profile: QualityProfile) {
    this.mat = new ShaderMaterial({
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCore: { value: new Color('#fff0c4') },
        uEdge: { value: new Color('#ff8a24') },
        uOct: { value: 4 },
      },
    });
    this.mesh = new Mesh(sphereGeo(profile.segments[0]), this.mat);
    this.mesh.scale.setScalar(def.radius);
    this.group.add(this.mesh);

    // An annular corona preserves photosphere detail instead of washing out its centre.
    this.glowTexA = createGlowTexture(256, [
      [0, 'rgba(255,224,164,0)'], [.30, 'rgba(255,214,142,0)'],
      [.38, 'rgba(255,193,105,.27)'], [.46, 'rgba(255,165,75,.08)'],
      [1, 'rgba(255,120,40,0)'],
    ]);
    this.glowTexB = createGlowTexture(256, [
      [0, 'rgba(255,200,130,0.05)'],
      [0.2, 'rgba(255,170,90,0.14)'],
      [0.6, 'rgba(255,140,60,0.03)'],
      [1, 'rgba(255,120,40,0)'],
    ]);
    const mk = (map: CanvasTexture) =>
      new Sprite(
        // The opaque scene must occlude the corona, including a suit or hull in
        // front of the sun. Otherwise its additive ring shines through cloth.
        new SpriteMaterial({ map, blending: AdditiveBlending, depthWrite: false, depthTest: true, transparent: true }),
      );
    this.glowA = mk(this.glowTexA);
    this.glowB = mk(this.glowTexB);
    this.glowA.scale.setScalar(def.radius * 2.8);
    this.glowB.scale.setScalar(def.radius * 16);
    this.glowA.renderOrder = -5;
    this.glowB.renderOrder = -6;
    this.group.add(this.glowB, this.glowA);
    this.applyProfile(profile);
  }

  applyProfile(p: QualityProfile): void {
    this.mesh.geometry = sphereGeo(p.segments[0]);
    this.mat.uniforms.uOct.value = p.bump ? 4 : 3;
  }

  update(worldPos: Vector3, origin: Vector3, camera: PerspectiveCamera, time: number): void {
    this.group.position.copy(worldPos).sub(origin);
    this.distance = this.group.position.distanceTo(camera.position);
    this.mat.uniforms.uTime.value = time;
    this.mesh.rotation.y = (Math.PI * 2 * time) / this.def.rotationPeriod;
    // 近づくとスプライトの光が表面に被りすぎないよう、距離に応じて弱める
    const rel = this.distance / this.def.radius;
    const f = Math.min(1, Math.max(0.0, (rel - 1.0) / 2.5));
    (this.glowA.material as SpriteMaterial).opacity = 0.25 + 0.75 * f;
    (this.glowB.material as SpriteMaterial).opacity = 0.2 + 0.8 * f;
  }

  dispose(): void {
    this.mat.dispose();
    this.glowTexA.dispose();
    this.glowTexB.dispose();
    (this.glowA.material as SpriteMaterial).dispose();
    (this.glowB.material as SpriteMaterial).dispose();
    this.group.removeFromParent();
  }
}
