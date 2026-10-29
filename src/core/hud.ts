import type { BodyDef } from '../data/types';
import type { CameraMode } from './state';

/** 画面上のマーカー(ターゲット/ミッション誘導) */
export interface MarkerInfo {
  kind: 'target' | 'guide';
  id: string;
  label: string;
  dist: number;
  /** 画面座標(CSS px)。画面外なら端にクランプ済み */
  x: number;
  y: number;
  onScreen: boolean;
  /** 画面外のとき、画面中心から見た方向 [rad] */
  angle: number;
  /** 未探知(名前を伏せる) */
  unknown: boolean;
  scanned: boolean;
}

export interface TargetInfo {
  def: BodyDef;
  /** 表面までの距離 [u] */
  dist: number;
  range: number;
  inRange: boolean;
  scanned: boolean;
  scanning: boolean;
  progress: number;
}

/** Game → HUD へ毎フレーム渡す読み取り専用スナップショット */
export interface HudSnapshot {
  stationTarget: { name: string; distance: number; relativeSpeed: number; mode: string } | null;
  operations: { mode: string; text: string; detail: string; progress: number; oxygen: number; oxygenMax: number; distance: number };
  shield: number;
  shieldMax: number;
  kills: number;
  difficulty: string;
  enemies: {id:number;x:number;y:number;onScreen:boolean;hp:number;maxHp:number;shield:number;maxShield:number;distance:number;role:string;mode:string;windup:number;angle:number}[];
  wave: number;
  pursuers: number;
  incoming: number;
  dodgeCooldown: number;
  dodgeActive: boolean;
  reinforcementsIn: number;
  lead: {x:number;y:number}|null;
  weaponHeat: number;
  overheated: boolean;
  hit: number;
  landingText: string;
  landingMode: 'flight'|'approach'|'landed';
  speed: number;
  speedFrac: number;
  boosting: boolean;
  hull: number;
  hullMax: number;
  energy: number;
  energyMax: number;
  data: number;
  assist: boolean;
  camera: CameraMode;
  locked: boolean;
  mission: { title: string; objective: string; hint: string; index: number; total: number; code?: string; completed?: number; objectiveTotal?: number; destination?: string; distance?: number; action?: string } | null;
  target: TargetInfo | null;
  markers: MarkerInfo[];
  sun: { x: number; y: number; opacity: number } | null;
  heading: number;
  pitch: number;
  fps: number;
  frameMs: number;
  qualityLabel: string;
  nearest: { name: string; altitude: number } | null;
  warning: string | null;
}

export type ToastKind = 'info' | 'discover' | 'reward' | 'warn';

export interface Toast {
  kind: ToastKind;
  title: string;
  text?: string;
}
