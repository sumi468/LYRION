import { Matrix4, Quaternion, Vector3 } from 'three';
import { BODY_DEFS, INITIAL_DETECTED } from '../data/starSystem';
import { createPositionTable, updateBodyPositions } from '../physics/orbits';
import { createUpgradeLevels, type UpgradeLevels } from '../systems/upgrades';

import type { LandingRecord } from '../systems/landing';

export type CameraMode = 'third' | 'first';

/** 実行中のゲーム状態(セーブ対象を含む) */
export interface GameState {
  /** ゲーム内時間 [s]。天体の位置はこれだけで決まる */
  time: number;
  playSeconds: number;
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
  hull: number;
  shield: number;
  kills: number;
  landed: LandingRecord | null;
  landings: Set<string>;
  energy: number;
  data: number;
  totalData: number;
  upgrades: UpgradeLevels;
  upgradesBought: number;
  detected: Set<string>;
  /** 天体 id → スキャン完了時刻(ゲーム内時間) */
  scanned: Map<string, number>;
  missionIndex: number;
  assist: boolean;
  cameraMode: CameraMode;
}

export const HULL_MAX = 100;

/** 開始位置: シンドラと恒星が両方見える位置から、シンドラを正面に見る */
export function computeStartPose(): { pos: Vector3; quat: Quaternion } {
  const table = createPositionTable(BODY_DEFS);
  updateBodyPositions(BODY_DEFS, 0, table);
  const cindra = table['cindra'];
  const toStar = new Vector3().copy(cindra).negate().normalize();
  const up = new Vector3(0, 1, 0);
  const tangent = new Vector3().crossVectors(up, toStar).normalize();
  const pos = new Vector3()
    .copy(cindra)
    .addScaledVector(tangent, 2300)
    .addScaledVector(toStar, -500)
    .addScaledVector(up, 120);
  const m = new Matrix4().lookAt(pos, cindra, up);
  const quat = new Quaternion().setFromRotationMatrix(m);
  return { pos, quat };
}

export function createNewState(): GameState {
  const start = computeStartPose();
  return {
    time: 0,
    playSeconds: 0,
    pos: start.pos,
    vel: new Vector3(),
    quat: start.quat,
    hull: HULL_MAX,
    shield: 60,
    kills: 0,
    landed: null,
    landings: new Set(),
    energy: 100,
    data: 0,
    totalData: 0,
    upgrades: createUpgradeLevels(),
    upgradesBought: 0,
    detected: new Set(INITIAL_DETECTED),
    scanned: new Map(),
    missionIndex: 0,
    assist: true,
    cameraMode: 'third',
  };
}
