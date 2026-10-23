import {
  Color,
  CanvasTexture,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferAttribute,
} from 'three';
import type { BeltDef } from '../data/types';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rock {
  /** ベルト座標系(恒星中心)での位置 */
  x: number;
  y: number;
  z: number;
  /** 衝突判定用の半径 */
  r: number;
}

/**
 * 小惑星帯。1 つの InstancedMesh(1 ドローコール)で全岩石を描画する。
 * 形状は凹凸を付けた共有ジオメトリ 1 つ。個体差はインスタンスごとの非一様スケール・回転・色で出す。
 * 回転はグループ全体で行い、衝突判定用の岩リストは CPU 側に保持する(ベルト座標系)。
 */
export class AsteroidBelt {
  readonly group = new Group();
  readonly rocks: Rock[] = [];
  private mesh: InstancedMesh;
  private geo: IcosahedronGeometry;
  private detailedGeo: IcosahedronGeometry;
  private surface: CanvasTexture;
  private mat: MeshStandardMaterial;
  private angle = 0;

  constructor(readonly def: BeltDef, maxCount: number) {
    const r = rng(777);
    this.geo = new IcosahedronGeometry(1, 1);
    // 頂点を乱数で押し引きして岩らしい不整形にする
    const p = this.geo.getAttribute('position') as BufferAttribute;
    const v = new Vector3();
    const lump = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let k = lump.get(key);
      if (k === undefined) {
        k = 0.78 + r() * 0.42;
        lump.set(key, k);
      }
      v.multiplyScalar(k);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    this.geo.computeVertexNormals();
    this.detailedGeo = new IcosahedronGeometry(1, 2);
    const detailed = this.detailedGeo.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < detailed.count; i++) {
      v.fromBufferAttribute(detailed, i).normalize();
      const k = .94 + .14 * Math.sin(v.x * 8 + v.y * 3) * Math.sin(v.z * 7 - v.y * 4) + .09 * Math.cos(v.y * 11 + v.x * 5);
      v.multiplyScalar(k); detailed.setXYZ(i, v.x, v.y, v.z);
    }
    this.detailedGeo.computeVertexNormals();
    // One tiny shared map adds mineral grain without per-rock draw calls or shaders.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const paint = canvas.getContext('2d');
    if (paint) {
      const grain = rng(1927);
      paint.fillStyle = '#b9b5ae'; paint.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        const x = grain() * 256, y = grain() * 256, radius = 2 + grain() * 18;
        const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, 'rgba(54,47,43,.22)'); gradient.addColorStop(.8, 'rgba(92,83,72,.09)'); gradient.addColorStop(1, 'rgba(120,110,96,0)');
        paint.fillStyle = gradient; paint.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      for (let i = 0; i < 6500; i++) {
        const shade = 105 + Math.floor(grain() * 100);
        paint.fillStyle = `rgba(${shade},${shade},${shade},.22)`;
        paint.fillRect(grain() * 256, grain() * 256, 1, 1 + grain() * 2);
      }
    }
    this.surface = new CanvasTexture(canvas); this.surface.colorSpace = SRGBColorSpace;
    this.mat = new MeshStandardMaterial({ color: 0xffffff, map: this.surface, bumpMap: this.surface, bumpScale: .035, roughness: .96, metalness: .04, flatShading: true });
    this.mesh = new InstancedMesh(this.geo, this.mat, maxCount);
    this.mesh.frustumCulled = false;

    const dummy = new Object3D();
    const q = new Quaternion();
    const mid = (def.inner + def.outer) / 2;
    const half = (def.outer - def.inner) / 2;
    const col = new Color();
    for (let i = 0; i < maxCount; i++) {
      // 中心寄りに密度が高い分布
      const g = (r() + r() + r()) / 3 * 2 - 1;
      const rad = mid + g * half;
      const ang = r() * Math.PI * 2;
      const yy = ((r() + r() + r()) / 3 * 2 - 1) * def.halfThickness;
      const size = 7 + Math.pow(r(), 3.2) * 46;
      const sx = size * (0.7 + r() * 0.6);
      const sy = size * (0.6 + r() * 0.5);
      const sz = size * (0.7 + r() * 0.6);
      dummy.position.set(Math.cos(ang) * rad, yy, Math.sin(ang) * rad);
      q.set(r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      dummy.quaternion.copy(q);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      const tone = 0.32 + r() * 0.3;
      col.setRGB(tone * (0.95 + r() * 0.1), tone * (0.9 + r() * 0.1), tone * (0.82 + r() * 0.12));
      this.mesh.setColorAt(i, col);
      this.rocks.push({ x: dummy.position.x, y: dummy.position.y, z: dummy.position.z, r: Math.max(sx, sy, sz) * 0.85 });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = maxCount;
    this.group.add(this.mesh);
  }

  /** 画質に応じた表示数(先頭 n 個のみ描画)。衝突判定も同じ数に揃える */
  setCount(n: number): void {
    this.mesh.count = Math.min(n, this.rocks.length);
    this.mesh.geometry = n >= 2000 ? this.detailedGeo : this.geo;
  }

  get count(): number {
    return this.mesh.count;
  }

  update(time: number, origin: Vector3): void {
    this.angle = (Math.PI * 2 * time) / this.def.period;
    this.group.rotation.y = this.angle;
    // ベルトの中心(恒星)はワールド原点
    this.group.position.set(-origin.x, -origin.y, -origin.z);
  }

  /** ベルト座標の岩のワールド位置(回転を反映)を out に書き込む */
  rockWorld(i: number, out: Vector3): Vector3 {
    const k = this.rocks[i];
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    // Object3D.rotation.y = a: x' = x cos a + z sin a, z' = -x sin a + z cos a
    out.set(k.x * c + k.z * s, k.y, -k.x * s + k.z * c);
    return out;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geo.dispose();
    this.detailedGeo.dispose();
    this.surface.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}

export const _m4 = Matrix4;
