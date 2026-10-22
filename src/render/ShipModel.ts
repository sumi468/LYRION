import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';

/**
 * 探査船の手続き生成モデル(約 12u)。機首が -Z。
 * ジオメトリとマテリアルは少数で共有し、ドローコールを抑える。
 */
export class ShipModel {
  readonly group = new Group();
  /** 一人称視点で隠す外装 */
  readonly hull = new Group();
  private flames: Mesh[] = [];
  private flameMat: MeshBasicMaterial;
  private glowMat: MeshBasicMaterial;
  private geos: BufferGeometry[] = [];
  private mats: Material[] = [];

  constructor() {
    const hullMat = new MeshStandardMaterial({ color: 0xc7cfd9, metalness: 0.35, roughness: 0.42 });
    const darkMat = new MeshStandardMaterial({ color: 0x252b33, metalness: 0.3, roughness: 0.55 });
    const glassMat = new MeshStandardMaterial({
      color: 0x0c1830,
      metalness: 0.6,
      roughness: 0.12,
      emissive: 0x0a2040,
      emissiveIntensity: 0.6,
    });
    const accentMat = new MeshStandardMaterial({ color: 0x1a2430, emissive: 0x8fd0ff, emissiveIntensity: 1.6 });
    this.flameMat = new MeshBasicMaterial({
      color: 0x8fd0ff,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.glowMat = new MeshBasicMaterial({ color: 0xcfeaff, side: 2 });
    this.mats.push(hullMat, darkMat, glassMat, accentMat, this.flameMat, this.glowMat);

    const add = (geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, parent: Group = this.hull): Mesh => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      this.geos.push(geo);
      return m;
    };

    // 胴体(後部が太く、前方へ細くなる)
    const body = add(new CylinderGeometry(1.45, 0.9, 7.2, 20).rotateX(Math.PI / 2), hullMat, 0, 0, 0.6);
    body.scale.set(1, 0.78, 1);
    const nose = add(new ConeGeometry(0.9, 3.6, 20).rotateX(-Math.PI / 2), hullMat, 0, 0, -5.0);
    nose.scale.set(1, 0.78, 1);
    // キャノピー
    const canopy = add(new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat, 0, 0.62, -1.9);
    canopy.scale.set(0.95, 0.7, 1.9);
    // 主翼(後退角つき)
    const wingGeo = new BoxGeometry(5.4, 0.16, 2.8);
    const wl = add(wingGeo, hullMat, -3.7, -0.15, 1.6);
    wl.rotation.set(0, 0.42, -0.06);
    const wr = add(wingGeo, hullMat, 3.7, -0.15, 1.6);
    wr.rotation.set(0, -0.42, 0.06);
    // 翼端のパネルとライン
    const tipGeo = new BoxGeometry(1.3, 0.2, 0.7);
    add(tipGeo, darkMat, -6.0, -0.1, 2.5).rotation.y = 0.42;
    add(tipGeo, darkMat, 6.0, -0.1, 2.5).rotation.y = -0.42;
    const lineGeo = new BoxGeometry(4.2, 0.05, 0.08);
    add(lineGeo, accentMat, -3.7, -0.04, 1.3).rotation.y = 0.42;
    add(lineGeo, accentMat, 3.7, -0.04, 1.3).rotation.y = -0.42;
    // 垂直尾翼
    add(new BoxGeometry(0.16, 2.2, 2.0), darkMat, 0, 1.4, 3.2).rotation.x = 0.35;
    // 胴体のアクセントライン
    add(new BoxGeometry(0.06, 0.06, 5.6), accentMat, 0.0, 1.02, 0.2);

    // エンジン(ノズル + 炎)
    const engGeo = new CylinderGeometry(0.62, 0.78, 2.4, 16).rotateX(Math.PI / 2);
    const nozzleGeo = new CircleGeometry(0.52, 16);
    const flameGeo = new ConeGeometry(0.5, 1, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.geos.push(flameGeo);
    for (const sx of [-1.35, 1.35]) {
      add(engGeo, darkMat, sx, -0.1, 4.0);
      const noz = add(nozzleGeo, this.glowMat, sx, -0.1, 5.22);
      noz.rotation.y = Math.PI;
      const flame = new Mesh(flameGeo, this.flameMat);
      flame.position.set(sx, -0.1, 5.25);
      flame.scale.set(1, 1, 0.01);
      flame.frustumCulled = false;
      this.group.add(flame);
      this.flames.push(flame);
    }

    // 航法灯
    const lightGeo = new SphereGeometry(0.16, 8, 6);
    const red = new MeshBasicMaterial({ color: 0xff4a4a });
    const green = new MeshBasicMaterial({ color: 0x4aff8a });
    this.mats.push(red, green);
    add(lightGeo, red, -6.5, -0.1, 2.8);
    add(lightGeo, green, 6.5, -0.1, 2.8);

    this.group.add(this.hull);
  }

  /** 推力(0〜1)とブースト状態に応じてエンジンの炎を調整 */
  setThrust(level: number, boosting: boolean): void {
    const len = (0.25 + level * 3.2) * (boosting ? 2.0 : 1.0);
    for (const f of this.flames) f.scale.set(boosting ? 1.35 : 1, boosting ? 1.35 : 1, Math.max(0.01, len));
    this.flameMat.color.setHex(boosting ? 0xe6f6ff : 0x8fd0ff);
    this.flameMat.opacity = 0.35 + Math.min(1, level + (boosting ? 0.5 : 0)) * 0.5;
  }

  setHullVisible(v: boolean): void {
    this.hull.visible = v;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}
