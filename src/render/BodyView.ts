import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  LOD,
  Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  BoxGeometry,
  CylinderGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import type { BodyDef } from '../data/types';
import {
  ATMO_FRAG,
  ATMO_VERT,
  CLOUD_FRAG,
  PLANET_FRAG,
  PLANET_VERT,
  RING_FRAG,
  RING_VERT,
} from './shaders';
import { PROGRAM_CLOUD, PROGRAM_ID, createGlowTexture, createRingTexture, type BakedTexture, type TextureBaker } from './bake';
import type { QualityProfile } from './quality';

export interface ViewContext {
  /** Floating Origin(倍精度のワールド座標)。描画座標 = ワールド座標 - origin */
  origin: Vector3;
  camera: PerspectiveCamera;
  /** 恒星の描画座標 */
  sunPos: Vector3;
  time: number;
  profile: QualityProfile;
}

// ------------------------------------------------------------------ 共有ジオメトリ

const sphereCache = new Map<number, SphereGeometry>();

export function sphereGeo(seg: number): SphereGeometry {
  let g = sphereCache.get(seg);
  if (!g) {
    g = new SphereGeometry(1, seg, Math.max(6, Math.round(seg / 2)));
    sphereCache.set(seg, g);
  }
  return g;
}

/** 使われなくなった分割数のジオメトリを破棄する(メモリリーク防止) */
export function pruneSphereGeos(keep: number[]): void {
  for (const [k, g] of sphereCache) {
    if (!keep.includes(k)) {
      g.dispose();
      sphereCache.delete(k);
    }
  }
}

const ATMO_SEG = 48;
const SUN_COLOR = new Color(1.0, 0.93, 0.8);

/** 太陽光の強さ。距離で緩やかに減衰させる(完全な逆二乗だと外縁が暗すぎて遊べない) */
export function sunIntensity(distance: number): number {
  return 1.5 * Math.pow(Math.min(Math.max(7000 / Math.max(distance, 1), 0.0), 4), 0.35);
}

const _v = new Vector3();
const _sunDirW = new Vector3();

/**
 * 惑星・衛星・探査機など「球体系」天体の描画オブジェクト。
 * 地表(ベイク済みテクスチャ + 簡易ライティング)、雲、大気光、リングを持つ。
 */
export class BodyView {
  readonly group = new Group();
  readonly def: BodyDef;
  private tilt = new Group();
  private spin = new Group();
  private lod: LOD | null = null;
  private lodMeshes: Mesh[] = [];
  private planetMat: ShaderMaterial | null = null;
  private cloudMesh: Mesh | null = null;
  private cloudMat: ShaderMaterial | null = null;
  private atmoMesh: Mesh | null = null;
  private atmoMat: ShaderMaterial | null = null;
  private ringMesh: Mesh | null = null;
  private ringMat: ShaderMaterial | null = null;
  private ringTex: Texture | null = null;
  private baked: BakedTexture[] = [];
  private probe: Group | null = null;
  private probeBeacon: Sprite | null = null;
  private disposables: { dispose(): void }[] = [];
  /** 現在の画面上での大きさ判定用 */
  distance = 0;

  constructor(def: BodyDef) {
    this.def = def;
    this.group.name = def.id;
    this.group.add(this.tilt);
    this.tilt.rotation.z = def.axialTilt;
    this.tilt.add(this.spin);
  }

  /** メッシュ・マテリアルを構築しテクスチャをベイクする */
  build(baker: TextureBaker, bakeWidth: number, profile: QualityProfile, deferBake = false): void {
    const d = this.def;
    if (d.kind === 'anomaly') {
      this.buildProbe();
      return;
    }
    if (!d.surface) return;

    this.planetMat = new ShaderMaterial({
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
      defines: {
        ...(d.ring ? { USE_RING: '' } : {}),
        ...(d.clouds ? { USE_CLOUDSHADOW: '' } : {}),
      },
      uniforms: {
        uMap: { value: null },
        uSunDirV: { value: new Vector3(1, 0, 0) },
        uSunDirW: { value: new Vector3(1, 0, 0) },
        uSunColor: { value: new Color() },
        uAmbient: { value: new Color(0.018, 0.021, 0.03) },
        uBump: { value: 0 },
        uSea: { value: d.surface.sea ?? -1 },
        uSpec: { value: d.surface.spec },
        uLava: { value: d.surface.lava ?? 0 },
        uTwilight: { value: d.atmosphere ? 1 : 0 },
        uRingTex: { value: null },
        uRingIn: { value: d.ring?.inner ?? 0 },
        uRingOut: { value: d.ring?.outer ?? 1 },
        uRingInv: { value: new Matrix3() },
        uCloudTex: { value: null },
        uCloudOffset: { value: 0 },
      },
    });

    // LOD: 近 / 中 / 遠
    this.lod = new LOD();
    const [s0, s1, s2] = profile.segments;
    const segs = [s0, s1, s2];
    const dist = [0, d.radius * 14, d.radius * 70];
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(sphereGeo(segs[i]), this.planetMat);
      m.scale.setScalar(d.radius);
      this.lodMeshes.push(m);
      this.lod.addLevel(m, dist[i], i === 0 ? 0 : 0.08);
    }
    this.spin.add(this.lod);

    if (d.clouds) {
      this.cloudMat = new ShaderMaterial({
        vertexShader: PLANET_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: null },
          uSunDirV: { value: new Vector3() },
          uSunColor: { value: new Color() },
          uAmbient: { value: new Color(0.02, 0.023, 0.034) },
          uOffset: { value: 0 },
          uBump: { value: 0 },
        },
      });
      this.cloudMesh = new Mesh(sphereGeo(s1), this.cloudMat);
      this.cloudMesh.scale.setScalar(d.radius * (1 + d.clouds.height));
      this.cloudMesh.renderOrder = 1;
      this.spin.add(this.cloudMesh);
    }

    if (d.atmosphere) {
      const a = d.atmosphere;
      this.atmoMat = new ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: FrontSide,
        uniforms: {
          uCenter: { value: new Vector3() },
          uRp: { value: d.radius },
          uRa: { value: d.radius * (1 + a.height) },
          uSunDirW: { value: new Vector3(1, 0, 0) },
          uColor: { value: new Color(a.color[0], a.color[1], a.color[2]) },
          uSunset: { value: new Color(a.sunset[0], a.sunset[1], a.sunset[2]) },
          uStrength: { value: a.density },
        },
      });
      this.atmoMesh = new Mesh(sphereGeo(ATMO_SEG), this.atmoMat);
      this.atmoMesh.scale.setScalar(d.radius * (1 + a.height));
      this.atmoMesh.renderOrder = 3;
      this.group.add(this.atmoMesh);
    }

    if (d.ring) {
      const r = d.ring;
      this.ringTex = createRingTexture(r.seed);
      const mu = (this.planetMat.uniforms.uRingInv.value as Matrix3).setFromMatrix4(new Matrix4().makeRotationZ(-r.tilt));
      void mu;
      this.planetMat.uniforms.uRingTex.value = this.ringTex;
      this.ringMat = new ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uRingTex: { value: this.ringTex },
          uRingIn: { value: r.inner },
          uRingOut: { value: r.outer },
          uPlanetR: { value: d.radius },
          uSunDirW: { value: new Vector3(1, 0, 0) },
          uRingInv: { value: new Matrix3().setFromMatrix4(new Matrix4().makeRotationZ(-r.tilt)) },
          uSunColor: { value: new Color() },
        },
      });
      const geo = new RingGeometry(r.inner, r.outer, 192, 1);
      this.disposables.push(geo);
      this.ringMesh = new Mesh(geo, this.ringMat);
      this.ringMesh.rotation.x = -Math.PI / 2;
      this.ringMesh.renderOrder = 2;
      this.ringMesh.frustumCulled = false;
      this.tilt.add(this.ringMesh);
    }

    if (!deferBake) this.rebake(baker, bakeWidth);
    this.applyProfile(profile);
  }

  /** 地表・雲テクスチャを(再)生成する */
  rebake(baker: TextureBaker, width: number): void {
    const d = this.def;
    if (!d.surface || !this.planetMat) return;
    for (const b of this.baked) b.dispose();
    this.baked = [];

    const surf = baker.bake(
      PROGRAM_ID[d.surface.program],
      { seed: d.surface.seed, colors: d.surface.colors, sea: d.surface.sea ?? 0.5 },
      width,
    );
    this.baked.push(surf);
    this.planetMat.uniforms.uMap.value = surf.texture;

    if (d.clouds && this.cloudMat) {
      const cl = baker.bake(
        PROGRAM_CLOUD,
        { seed: d.clouds.seed, colors: ['#fff', '#fff', '#fff'], sea: d.clouds.coverage },
        width,
      );
      this.baked.push(cl);
      this.cloudMat.uniforms.uMap.value = cl.texture;
      this.planetMat.uniforms.uCloudTex.value = cl.texture;
    }
  }

  /** 地表と雲を段階生成し、完成後に旧テクスチャを置き換える。 */
  async rebakeAsync(baker: TextureBaker, width: number, progress?: (fraction: number) => void): Promise<void> {
    const d = this.def;
    if (!d.surface || !this.planetMat) return;
    const next: BakedTexture[] = [];
    const parts = d.clouds && this.cloudMat ? 2 : 1;
    try {
      next.push(await baker.bakeAsync(PROGRAM_ID[d.surface.program],
        { seed: d.surface.seed, colors: d.surface.colors, sea: d.surface.sea ?? 0.5 }, width, true,
        (value) => progress?.(value / parts)));
      if (d.clouds && this.cloudMat) {
        next.push(await baker.bakeAsync(PROGRAM_CLOUD,
          { seed: d.clouds.seed, colors: ['#fff', '#fff', '#fff'], sea: d.clouds.coverage }, width, true,
          (value) => progress?.((1 + value) / parts)));
      }
    } catch (error) {
      for (const baked of next) baked.dispose();
      throw error;
    }
    for (const baked of this.baked) baked.dispose();
    this.baked = next;
    this.planetMat.uniforms.uMap.value = next[0].texture;
    if (next[1] && this.cloudMat) {
      this.cloudMat.uniforms.uMap.value = next[1].texture;
      this.planetMat.uniforms.uCloudTex.value = next[1].texture;
    }
  }

  /** 画質プロファイルを適用(分割数、雲、バンプの有無) */
  applyProfile(p: QualityProfile): void {
    const d = this.def;
    if (this.lodMeshes.length) {
      for (let i = 0; i < 3; i++) this.lodMeshes[i].geometry = sphereGeo(p.segments[i]);
    }
    if (this.cloudMesh) {
      this.cloudMesh.geometry = sphereGeo(p.segments[1]);
      this.cloudMesh.visible = p.clouds;
    }
    if (this.planetMat && d.surface) {
      this.planetMat.uniforms.uBump.value = p.bump ? d.radius * 0.03 * d.surface.bump : 0;
    }
    if (this.cloudMat) this.cloudMat.uniforms.uBump.value = p.bump ? d.radius * 0.012 : 0;
  }

  private buildProbe(): void {
    const body = new MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.5 });
    const panel = new MeshStandardMaterial({ color: 0x1d2b4a, metalness: 0.4, roughness: 0.35, emissive: 0x0a1428 });
    const core = new Mesh(new BoxGeometry(1.6, 1.2, 2.4), body);
    const dish = new Mesh(new CylinderGeometry(0.1, 1.3, 0.5, 14, 1, true), body);
    dish.rotation.x = Math.PI / 2;
    dish.position.set(0, 0.7, -1.6);
    const wingL = new Mesh(new BoxGeometry(3.6, 0.08, 1.4), panel);
    wingL.position.set(-2.8, 0, 0);
    const wingR = wingL.clone();
    wingR.position.x = 2.8;
    wingR.rotation.z = 0.35;
    wingL.rotation.z = -0.15;
    const mast = new Mesh(new OctahedronGeometry(0.4), body);
    mast.position.set(0, 1.2, 0.8);
    this.probe = new Group();
    this.probe.add(core, dish, wingL, wingR, mast);
    this.probe.scale.setScalar(2.2);
    this.spin.add(this.probe);

    const glow = createGlowTexture(64, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    const sm = new SpriteMaterial({
      map: glow,
      color: 0x66ddff,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.probeBeacon = new Sprite(sm);
    this.probeBeacon.scale.setScalar(70);
    this.probeBeacon.position.set(0, 4, 0);
    this.group.add(this.probeBeacon);
    this.disposables.push(
      glow,
      sm,
      core.geometry,
      dish.geometry,
      wingL.geometry,
      mast.geometry,
      body,
      panel,
    );
  }

  /** 毎フレーム更新。worldPos は倍精度ワールド座標 */
  update(ctx: ViewContext, worldPos: Vector3): void {
    const d = this.def;
    this.group.position.copy(worldPos).sub(ctx.origin);
    this.distance = this.group.position.distanceTo(ctx.camera.position);

    // 遠方の小天体は描画しない(描画距離設定)
    if (d.kind === 'moon' || d.kind === 'anomaly') {
      this.group.visible = this.distance - d.radius < ctx.profile.cullDistance;
      if (!this.group.visible) return;
    }

    this.spin.rotation.y = (Math.PI * 2 * ctx.time) / d.rotationPeriod;

    if (this.probeBeacon) {
      const s = 0.5 + 0.5 * Math.sin(ctx.time * 3.2);
      (this.probeBeacon.material as SpriteMaterial).opacity = 0.25 + 0.75 * s * s;
      this.probeBeacon.scale.setScalar(Math.max(40, this.distance * 0.03));
    }
    if (!this.planetMat) return;

    _sunDirW.copy(ctx.sunPos).sub(this.group.position);
    const sunDist = _sunDirW.length();
    _sunDirW.multiplyScalar(1 / Math.max(sunDist, 1e-3));
    const k = sunIntensity(sunDist);
    const sunCol = _v.set(SUN_COLOR.r * k, SUN_COLOR.g * k, SUN_COLOR.b * k);

    const pu = this.planetMat.uniforms;
    pu.uSunDirW.value.copy(_sunDirW);
    pu.uSunDirV.value.copy(_sunDirW).transformDirection(ctx.camera.matrixWorldInverse);
    (pu.uSunColor.value as Color).setRGB(sunCol.x, sunCol.y, sunCol.z);

    if (this.cloudMat && this.cloudMesh && d.clouds) {
      const visible = ctx.profile.clouds && this.distance < d.radius * 500;
      this.cloudMesh.visible = visible;
      const off = (d.clouds.drift * ctx.time) / (Math.PI * 2);
      pu.uCloudOffset.value = off;
      if (visible) {
        const cu = this.cloudMat.uniforms;
        cu.uSunDirV.value.copy(pu.uSunDirV.value);
        (cu.uSunColor.value as Color).setRGB(sunCol.x, sunCol.y, sunCol.z);
        cu.uOffset.value = off;
      }
    }

    if (this.atmoMat && this.atmoMesh) {
      const au = this.atmoMat.uniforms;
      au.uCenter.value.copy(this.group.position);
      au.uSunDirW.value.copy(_sunDirW);
      // カメラが大気の殻の内側に入ったら裏面を描く(連続的に見えるよう計算はレイ基準)
      const inside = this.distance < d.radius * (1 + d.atmosphere!.height) * 1.002;
      const side = inside ? BackSide : FrontSide;
      if (this.atmoMat.side !== side) {
        this.atmoMat.side = side;
        this.atmoMat.needsUpdate = true;
      }
    }

    if (this.ringMat) {
      const ru = this.ringMat.uniforms;
      ru.uSunDirW.value.copy(_sunDirW);
      (ru.uSunColor.value as Color).setRGB(sunCol.x, sunCol.y, sunCol.z);
    }
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  dispose(): void {
    for (const b of this.baked) b.dispose();
    this.baked = [];
    this.planetMat?.dispose();
    this.cloudMat?.dispose();
    this.atmoMat?.dispose();
    this.ringMat?.dispose();
    this.ringTex?.dispose();
    for (const x of this.disposables) x.dispose();
    this.disposables = [];
    this.group.removeFromParent();
  }
}

export type { Material, BufferGeometry };
