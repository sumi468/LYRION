import type { BodyDef, OrbitDef } from './types';

export const HOMEWORLD_ID = 'lyrion-prime';
export const STATION_ID = 'asterion';

/** Between Thalassa's outermost moon path and the inner edge (12500u) of Halcyon. */
export const HOMEWORLD: BodyDef = {
  id: HOMEWORLD_ID, name: 'LYRION PRIME', nameJa: 'リリオン・プライム', kind: 'planet',
  classLabel: '生命居住 / 地球型ホームワールド', homeworld: true,
  radius: 310, orbit: { parent: 'lyrion', radius: 11100, period: 13800, phase: .9, inclination: .01, node: .2 },
  rotationPeriod: 1500, axialTilt: .38, realDiameterKm: 12940, massEarth: 1.04, gravityG: 1.01,
  tempK: 287, atmosphereNote: '窒素・酸素 / 海洋と大陸に広がる居住圏', realOrbit: '1.32 AU',
  surface: { program: 'terran', seed: 73, colors: ['#071e39', '#334e3a', '#8d8565'], sea: .53, bump: .55, spec: 1 },
  atmosphere: { color: [.15, .38, .85], sunset: [.95, .38, .12], height: .028, density: .5 },
  clouds: { height: .009, seed: 39, coverage: .4, drift: .006 },
  features: ['人類の居住惑星と遠征本部', '軌道研究基地アステリオン', '深い海と温帯の大陸'],
  description: '私たちが帰る場所。海洋と大陸の上に都市が灯り、軌道上のアステリオン基地から観測船が旅立つ。母星の既知の記録は、従来の11天体の完全調査とは別に扱われる。',
  scanReward: 25, scanTime: 3, scanRangeMul: 1.2, detectRange: 1e9,
};

export const STATION_ORBIT: OrbitDef = { parent: HOMEWORLD_ID, radius: 720, period: 1800, phase: 4, inclination: .06, node: .16 };
export const SATELLITE_ORBIT: OrbitDef = { parent: HOMEWORLD_ID, radius: 1040, period: 2450, phase: 2.2, inclination: .12, node: .4 };
export const DEEP_ORBIT: OrbitDef = { parent: 'lyrion', radius: 43000, period: 52000, phase: 1.8, inclination: .12, node: .8 };
export const DOCK_PORT = [0, 0, 24] as const;
export const DOCK_SHIP = [0, 0, 32.2] as const;
export const SHIP_HATCH = [-3.3, 1.25, -2.2] as const;
export const NAV_WAYPOINT = [130, 45, 330] as const;
export const STATION_SAFE_RADIUS = 1000;

export type FrameId = 'asterion' | 'wayfarer' | 'satellite' | 'deep' | 'inertial';
export type InvestigationKind = 'inspect' | 'scan' | 'repair' | 'retrieve';
export interface InvestigationDef {
  id: string; frame: Exclude<FrameId, 'inertial'>; position: readonly [number, number, number];
  name: string; kind: InvestigationKind; seconds: number; reward: number; result: string; requires?: string;
}

export const INVESTIGATIONS: readonly InvestigationDef[] = [
  { id: 'maintenance-panel', frame: 'asterion', position: [-4.7, 1.4, 8], name: '外部保守パネル', kind: 'inspect', seconds: 2.8, reward: 10,
    result: '外殻と電力系統は正常。船外点検の基礎データを記録した。' },
  { id: 'station-sensor', frame: 'asterion', position: [7, 3.2, 2], name: '環境観測センサー', kind: 'scan', seconds: 4, reward: 12,
    result: '放射線・温度・微粒子の測定を完了。母星周辺の安全性を確認した。' },
  { id: 'antenna-diagnosis', frame: 'asterion', position: [-7, 4.6, -11], name: '通信アンテナの診断端末', kind: 'inspect', seconds: 3, reward: 12,
    result: '受信機の異常は増幅器の接点にある。外部モジュールの交換で復旧できる。' },
  { id: 'antenna-repair', frame: 'asterion', position: [-7, 6.2, -13], name: '破損した通信増幅器', kind: 'repair', seconds: 5, reward: 18, requires: 'antenna-diagnosis',
    result: '接点を清掃し増幅器を交換。アンテナのステータスが正常に戻った。' },
  { id: 'communications-test', frame: 'asterion', position: [-4.8, 3, -8], name: '通信検証センサー', kind: 'scan', seconds: 3.5, reward: 10, requires: 'antenna-repair',
    result: '通信回線は安定。過去の遠征で使われた微弱な識別信号も受信した。' },
  { id: 'station-debris', frame: 'asterion', position: [16, -5, 17], name: '回収済みの微小デブリ試料', kind: 'scan', seconds: 3, reward: 8,
    result: '表面の衝突痕と組成を記録。軌道保守の資料に追加した。' },
  { id: 'satellite-sensor', frame: 'satellite', position: [0, 2.5, 0], name: '観測衛星の計測装置', kind: 'inspect', seconds: 3.5, reward: 15,
    result: '独立観測衛星は正常。母星の気象データを基地の記録と同期した。' },
  { id: 'wayfarer-recorder', frame: 'wayfarer', position: [0, 5.8, 1.7], name: 'WAYFARER-3 データレコーダー', kind: 'retrieve', seconds: 4.5, reward: 25,
    result: '最後の記録には、既知の航路にない座標と、等間隔の受信パルスが残されていた。' },
  { id: 'probe-component', frame: 'wayfarer', position: [-4, 2, 3.5], name: '探査機の回収可能な記憶素子', kind: 'retrieve', seconds: 3.5, reward: 20, requires: 'wayfarer-recorder',
    result: '保護された記憶素子を回収。深宇宙の観測地点を復元できる。' },
  { id: 'deep-readings', frame: 'deep', position: [0, 3.5, 0], name: '放棄された深宇宙観測ブイ', kind: 'scan', seconds: 5, reward: 30,
    result: 'ノイズは自然現象とは一致しない。母星から遠いこの場所で、同じパルスが繰り返されている。' },
  { id: 'deep-evidence', frame: 'deep', position: [11, -.5, 4], name: '観測ブイの封印された試料', kind: 'retrieve', seconds: 4, reward: 30, requires: 'deep-readings',
    result: '人類の旧遠征番号と、まだ記録にない星図。答えは見つからなかったが、次の旅の目的地が生まれた。' },
];
export const INVESTIGATION_BY_ID = Object.assign(Object.create(null), Object.fromEntries(INVESTIGATIONS.map(def => [def.id, def]))) as Record<string, InvestigationDef>;
export const INVESTIGATION_LABELS: Record<InvestigationKind, string> = { inspect: '点検', scan: '観測', repair: '修理', retrieve: '回収' };

/** Local axis-aligned solids; intentionally simple instead of a heavyweight physics engine. */
export interface SolidBox { min: readonly [number, number, number]; max: readonly [number, number, number] }
export const STATION_SOLIDS: readonly SolidBox[] = [
  { min: [-3.1, -3.1, -14], max: [3.1, 3.1, 17] },
  { min: [-13.5, -2.8, -1], max: [-2.8, 2.8, 5] },
  { min: [2.8, -2.8, -1], max: [13.5, 2.8, 5] },
  { min: [-43, -1.2, -19], max: [43, 1.2, -15] },
  { min: [-2.4, -2.4, 17], max: [2.4, 2.4, 24] },
  { min: [-5, .5, 7.6], max: [-3.8, 2.3, 8.4] },
  { min: [6.6, 2.25, 1.5], max: [7.4, 3.75, 2.5] },
  { min: [-7.65, 5.6, -13.5], max: [-6.35, 6.4, -12.5] },
];
export const SHIP_SOLIDS: readonly SolidBox[] = [{ min: [-2.1, -1, -7.8], max: [2.1, 1.25, 5.8] }];
export const HARDWARE_SOLIDS: Readonly<Record<'wayfarer'|'satellite'|'deep', readonly SolidBox[]>> = {
  wayfarer: [{min:[-2.2,-2.2,-2.7],max:[2.2,2.2,2.7]}],
  satellite: [{min:[-1.5,-1.5,-1.5],max:[1.5,1.5,1.5]}],
  deep: [{min:[-1.9,-3.5,-1.9],max:[1.9,3.5,1.9]},{min:[9,-2.5,1.5],max:[13,-.5,6.5]}],
};
