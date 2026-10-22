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
  mission: { title: string; objective: string; hint: string; index: number; total: number } | null;
  target: TargetInfo | null;
  markers: MarkerInfo[];
  sun: { x: number; y: number; opacity: number } | null;
  heading: number;
  pitch: number;
  fps: number;
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
