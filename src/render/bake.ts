import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  ClampToEdgeWrapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  CanvasTexture,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { SurfaceProgram } from '../data/types';
import { BAKE_FRAG, BAKE_VERT } from './shaders';

export const PROGRAM_ID: Record<SurfaceProgram, number> = {
  rocky: 0,
  terran: 1,
  ice: 2,
  gas: 3,
  moon: 4,
  lava: 5,
  sun: 0, // 恒星はリアルタイムシェーダーで描くのでベイクしない
};
export const PROGRAM_CLOUD = 6;
export const PROGRAM_SKY = 10;

export interface BakeParams {
  seed: number;
  colors: [string, string, string];
  /** terran: 海面高さ / cloud: 雲量 */
  sea: number;
}

export interface BakedTexture {
  texture: Texture;
  dispose(): void;
}

/**
 * 手続き的な地表・雲・背景を、GPU で等距円筒テクスチャへ 1 度だけ描画する。
 * 実行時は単純なテクスチャ参照になるため、高品質な見た目を軽い負荷で得られる。
 */
export class TextureBaker {
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private materials = new Map<number, ShaderMaterial>();

  constructor(private renderer: WebGLRenderer) {
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  private material(program: number): ShaderMaterial {
    let m = this.materials.get(program);
    if (!m) {
      m = new ShaderMaterial({
        vertexShader: BAKE_VERT,
        fragmentShader: BAKE_FRAG,
        defines: { PROGRAM: program },
        uniforms: {
          uSeed: { value: 0 },
          uC0: { value: new Color() },
          uC1: { value: new Color() },
          uC2: { value: new Color() },
          uSea: { value: 0.5 },
        },
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      this.materials.set(program, m);
    }
    return m;
  }

  private target(width: number, mipmaps: boolean): WebGLRenderTarget {
    const height = Math.max(2, Math.floor(width / 2));
    const rt = new WebGLRenderTarget(width, height, {
      type: UnsignedByteType,
      format: RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: mipmaps,
      minFilter: mipmaps ? LinearMipmapLinearFilter : LinearFilter,
      magFilter: LinearFilter,
      colorSpace: NoColorSpace,
    });
    rt.texture.wrapS = RepeatWrapping;
    rt.texture.wrapT = ClampToEdgeWrapping;
    rt.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return rt;
  }

  private draw(program: number, p: BakeParams, rt: WebGLRenderTarget): void {
    const mat = this.material(program);
    mat.uniforms.uSeed.value = p.seed;
    (mat.uniforms.uC0.value as Color).set(p.colors[0]);
    (mat.uniforms.uC1.value as Color).set(p.colors[1]);
    (mat.uniforms.uC2.value as Color).set(p.colors[2]);
    mat.uniforms.uSea.value = p.sea;
    this.quad.material = mat;

    const prevTarget = this.renderer.getRenderTarget();
    const prevAuto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = true;
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.autoClear = prevAuto;
    }
  }

  bake(program: number, p: BakeParams, width: number, mipmaps = true): BakedTexture {
    const rt = this.target(width, mipmaps);
    try { this.draw(program, p, rt); }
    catch (error) { rt.dispose(); throw error; }
    return { texture: rt.texture, dispose: () => rt.dispose() };
  }

  /** 128行ずつベイクし、ロード表示と入力をフレーム間で更新できるようにする。 */
  async bakeAsync(program: number, p: BakeParams, width: number, mipmaps = true, progress?: (fraction: number) => void): Promise<BakedTexture> {
    const rt = this.target(width, mipmaps);
    rt.scissorTest = true;
    rt.texture.generateMipmaps = false;
    try {
      for (let y = 0; y < rt.height; y += 128) {
        const rows = Math.min(128, rt.height - y);
        rt.scissor.set(0, y, width, rows);
        rt.texture.generateMipmaps = mipmaps && y + rows === rt.height;
        this.draw(program, p, rt);
        progress?.((y + rows) / rt.height);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      rt.scissorTest = false;
      return { texture: rt.texture, dispose: () => rt.dispose() };
    } catch (error) {
      rt.dispose();
      throw error;
    }
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.quad.geometry.dispose();
  }
}

// ---------------------------------------------------------------- ガス惑星のリング

/** 再現性のある簡易乱数 */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1 次元のリング(半径方向)テクスチャ。RGB=粒子の色、A=不透明度。 */
export function createRingTexture(seed: number, width = 1024): DataTexture {
  const rnd = mulberry32(seed * 977 + 13);
  const data = new Uint8Array(width * 4);
  // 帯ごとの性質をランダムに決める
  const bands: { at: number; w: number; amp: number }[] = [];
  for (let i = 0; i < 38; i++) bands.push({ at: rnd(), w: 0.004 + rnd() * 0.03, amp: (rnd() - 0.5) * 0.8 });
  for (let i = 0; i < width; i++) {
    const u = i / (width - 1);
    let dens = 0.55;
    for (const b of bands) dens += b.amp * Math.exp(-Math.pow((u - b.at) / b.w, 2));
    dens += 0.1 * Math.sin(u * 140 + rnd() * 0.2) * 0.5;
    // 高密度の主環と淡い内環・外環
    dens *= 0.25 + 0.75 * smooth(0.0, 0.08, u) * (1 - smooth(0.9, 1.0, u) * 0.7);
    // カッシーニの間隙風の大きな隙間と細い隙間
    dens *= 1 - 0.95 * bump(u, 0.43, 0.025);
    dens *= 1 - 0.8 * bump(u, 0.73, 0.008);
    dens *= 1 - 0.9 * bump(u, 0.9, 0.006);
    dens = clamp01(dens);
    const tint = 0.75 + 0.25 * Math.sin(u * 23.0 + seed);
    const r = (0.80 + 0.12 * tint) * 255;
    const g = (0.74 + 0.10 * tint) * 255;
    const bl = (0.64 + 0.08 * tint) * 255;
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = bl;
    data[i * 4 + 3] = Math.round(dens * 255);
  }
  const tex = new DataTexture(data, width, 1, RGBAFormat, UnsignedByteType);
  tex.colorSpace = NoColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function bump(x: number, c: number, w: number): number {
  return Math.exp(-Math.pow((x - c) / w, 2));
}

// ---------------------------------------------------------------- グロー用スプライト

/** 放射状グラデーションのテクスチャ(恒星のコロナ等) */
export function createGlowTexture(size = 256, stops: [number, string][] = []): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    const s = stops.length
      ? stops
      : ([
          [0, 'rgba(255,244,220,1)'],
          [0.08, 'rgba(255,225,170,0.85)'],
          [0.25, 'rgba(255,190,110,0.32)'],
          [0.55, 'rgba(255,150,70,0.08)'],
          [1, 'rgba(255,120,40,0)'],
        ] as [number, string][]);
    for (const [o, col] of s) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
