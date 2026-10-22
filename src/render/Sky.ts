import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LinearFilter,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  type PerspectiveCamera,
} from 'three';
import { PROGRAM_SKY, type BakedTexture, type TextureBaker } from './bake';
import { SKY_FRAG, SKY_VERT, STAR_FRAG, STAR_VERT } from './shaders';

const MAX_STARS = 9000;

/** 恒星スペクトル型(O..M)ごとの代表的な色 */
const STAR_PALETTE: [number, number, number][] = [
  [0.62, 0.72, 1.0],
  [0.78, 0.85, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.96, 0.82],
  [1.0, 0.82, 0.58],
  [1.0, 0.66, 0.42],
];

/** 再現性のある乱数 */
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

/**
 * 背景: ベイク済みの天の川・星雲(等距円筒テクスチャ)+ 点描画の星。
 * どちらも無限遠として扱い、カメラ位置に追従させるだけ(視差なし)。
 */
export class Sky {
  readonly group = new Group();
  private skyMesh: Mesh;
  private skyMat: ShaderMaterial;
  private baked: BakedTexture | null = null;
  private stars: Points;
  private starMat: ShaderMaterial;
  private starGeo: BufferGeometry;

  constructor() {
    this.skyMat = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { uSky: { value: null }, uBright: { value: 0.3 } },
    });
    this.skyMesh = new Mesh(new SphereGeometry(8000, 48, 24), this.skyMat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;

    // 星: 明るさは冪乗分布(暗い星が多く、明るい星はまれ)
    const r = rng(20260);
    const pos = new Float32Array(MAX_STARS * 3);
    const mag = new Float32Array(MAX_STARS);
    const col = new Float32Array(MAX_STARS * 3);
    for (let i = 0; i < MAX_STARS; i++) {
      // 球面上の一様分布。天の川の帯付近にやや多く配置する
      let x = 0, y = 0, z = 0;
      for (let tries = 0; tries < 4; tries++) {
        const u = r() * 2 - 1;
        const th = r() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        x = s * Math.cos(th);
        y = u;
        z = s * Math.sin(th);
        const band = Math.exp(-Math.pow((x * 0.35 + y + z * 0.18) / 0.35, 2));
        if (r() < 0.35 + 0.65 * band) break;
      }
      pos[i * 3] = x * 5000;
      pos[i * 3 + 1] = y * 5000;
      pos[i * 3 + 2] = z * 5000;
      const m = Math.pow(r(), 3.2);
      mag[i] = m;
      const pr = r();
      const idx = Math.min(STAR_PALETTE.length - 1, Math.floor(Math.pow(pr, 0.8) * STAR_PALETTE.length));
      const c = STAR_PALETTE[idx];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    // 明るい星ほど先頭に並べ、描画数を減らしても見栄えが保たれるようにする
    const order = Array.from({ length: MAX_STARS }, (_, i) => i).sort((a, b) => mag[b] - mag[a]);
    const pos2 = new Float32Array(MAX_STARS * 3);
    const mag2 = new Float32Array(MAX_STARS);
    const col2 = new Float32Array(MAX_STARS * 3);
    // 上位をシャッフルして偏りを防ぐ(明るさ順だと空の一部に偏る可能性は低いが念のため)
    order.forEach((src, dst) => {
      pos2.set(pos.subarray(src * 3, src * 3 + 3), dst * 3);
      mag2[dst] = mag[src];
      col2.set(col.subarray(src * 3, src * 3 + 3), dst * 3);
    });
    this.starGeo = new BufferGeometry();
    this.starGeo.setAttribute('position', new BufferAttribute(pos2, 3));
    this.starGeo.setAttribute('aMag', new BufferAttribute(mag2, 1));
    this.starGeo.setAttribute('aColor', new BufferAttribute(col2, 3));
    this.starMat = new ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { uScale: { value: 1 } },
    });
    this.stars = new Points(this.starGeo, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;

    this.group.add(this.skyMesh, this.stars);
  }

  /** 背景テクスチャをベイク(起動時のみ) */
  bake(baker: TextureBaker, width: number): void {
    this.baked?.dispose();
    this.baked = baker.bake(PROGRAM_SKY, { seed: 3, colors: ['#000', '#000', '#000'], sea: 0 }, width, false);
    this.baked.texture.minFilter = LinearFilter;
    this.baked.texture.generateMipmaps = false;
    this.skyMat.uniforms.uSky.value = this.baked.texture;
  }

  setStarCount(n: number): void {
    this.starGeo.setDrawRange(0, Math.min(MAX_STARS, n));
  }

  async bakeAsync(baker: TextureBaker, width: number, progress?: (fraction: number) => void): Promise<void> {
    const next = await baker.bakeAsync(PROGRAM_SKY, { seed: 3, colors: ['#000', '#000', '#000'], sea: 0 }, width, false, progress);
    this.baked?.dispose();
    this.baked = next;
    this.skyMat.uniforms.uSky.value = next.texture;
  }

  setPixelScale(s: number): void {
    this.starMat.uniforms.uScale.value = s;
  }

  update(camera: PerspectiveCamera): void {
    this.group.position.copy(camera.position);
  }

  dispose(): void {
    this.baked?.dispose();
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
    this.starGeo.dispose();
    this.starMat.dispose();
    this.group.removeFromParent();
  }
}

export const _unusedColor = Color;
