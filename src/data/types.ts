/**
 * ゲームデータの型定義。
 * 「実際の天文値(real*)」と「ゲーム内スケール(radius, orbit.radius など)」を明確に区別する。
 * ゲーム内距離・半径の単位は "u"(ゲーム単位)。実値は km / AU で保持し、表示用にのみ使う。
 */

export type BodyKind = 'star' | 'planet' | 'moon' | 'belt' | 'anomaly';

/** 表面テクスチャ生成プログラム(render/bake.ts が解釈する) */
export type SurfaceProgram = 'sun' | 'rocky' | 'terran' | 'ice' | 'gas' | 'moon' | 'lava';

export interface OrbitDef {
  /** 親天体の id(恒星は null ではなく orbit 自体を持たない) */
  parent: string;
  /** 軌道半径 [u] */
  radius: number;
  /** 公転周期 [ゲーム内秒]。実際の周期とは無関係に、遊びやすい速度へ調整している */
  period: number;
  /** t=0 での軌道位相 [rad] */
  phase: number;
  /** 軌道傾斜 [rad] */
  inclination: number;
  /** 昇交点経度 [rad] */
  node: number;
}

export interface RingDef {
  /** 内縁・外縁 [u](惑星中心から) */
  inner: number;
  outer: number;
  /** リング面の傾き(惑星自転軸と同じ傾き) [rad] */
  tilt: number;
  seed: number;
}

export interface AtmosphereDef {
  /** 大気光の主色(リニア) */
  color: [number, number, number];
  /** 夕焼け・朝焼けの色(リニア) */
  sunset: [number, number, number];
  /** 大気の厚み(惑星半径に対する割合) */
  height: number;
  /** 強度 */
  density: number;
}

export interface CloudDef {
  /** 雲層の高さ(惑星半径に対する割合) */
  height: number;
  seed: number;
  coverage: number;
  /** 地表に対する相対自転(rad/s) */
  drift: number;
}

export interface BeltDef {
  inner: number;
  outer: number;
  halfThickness: number;
  /** High 設定での最大インスタンス数 */
  count: number;
  /** ベルト全体の回転周期 [ゲーム内秒] */
  period: number;
}

export interface SurfaceDef {
  program: SurfaceProgram;
  seed: number;
  /** テクスチャ生成に使う主要色(sRGB hex) */
  colors: [string, string, string];
  /** 海面高さ(0〜1)。undefined なら海なし */
  sea?: number;
  /** バンプ強度 */
  bump: number;
  /** 鏡面反射(海のきらめき等) */
  spec: number;
  /** 溶岩の発光強度 */
  lava?: number;
}

export interface BodyDef {
  id: string;
  name: string;
  nameJa: string;
  kind: BodyKind;
  /** 日本語の分類ラベル */
  classLabel: string;
  /** Inhabited operational hub, outside the legacy eleven-object survey catalog. */
  homeworld?: boolean;

  /** ---- ゲーム内スケール ---- */
  /** 半径 [u]。belt の場合は 0 */
  radius: number;
  orbit: OrbitDef | null;
  /** 自転周期 [ゲーム内秒] */
  rotationPeriod: number;
  axialTilt: number;

  /** ---- 設定上の実値(架空の星系) ---- */
  realDiameterKm: number;
  /** 地球質量比 */
  massEarth?: number;
  /** 表面重力 [g] */
  gravityG?: number;
  /** 表面(または雲頂)温度 [K] */
  tempK: number;
  /** 大気組成の説明 */
  atmosphereNote: string;
  /** 軌道の実値表記(例: 0.42 AU) */
  realOrbit: string;

  /** ---- 見た目 ---- */
  surface?: SurfaceDef;
  atmosphere?: AtmosphereDef;
  clouds?: CloudDef;
  ring?: RingDef;
  belt?: BeltDef;

  /** ---- ゲーム要素 ---- */
  features: string[];
  description: string;
  /** スキャン報酬(探査データ) */
  scanReward: number;
  /** スキャンに必要な秒数 */
  scanTime: number;
  /** スキャン距離の補正倍率(恒星・巨大惑星は少し遠くからでも可) */
  scanRangeMul: number;
  /** 地表からこの距離以内に入ると「発見」される [u] */
  detectRange: number;
}

export type UpgradeId = 'engine' | 'boost' | 'scan' | 'energy';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  nameEn: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
}
