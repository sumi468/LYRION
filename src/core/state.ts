import { Quaternion, Vector3 } from 'three';
import { BODY_DEFS, INITIAL_DETECTED } from '../data/starSystem';
import { createPositionTable, updateBodyPositions, updateBodyVelocities } from '../physics/orbits';
import { ExpeditionFrames } from '../physics/frames';
import { createHomecomingProgress, type HomecomingProgress } from '../systems/expeditions';
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
  homecoming: HomecomingProgress;
}

export const HULL_MAX = 100;

/** 開始位置: 母星に向いた基地の外側。基地の点速度を引き継ぐ。 */
export function computeStartPose(): { pos: Vector3; quat: Quaternion; vel: Vector3 } {
  const table = createPositionTable(BODY_DEFS);
  updateBodyPositions(BODY_DEFS, 0, table);
  const velocities = createPositionTable(BODY_DEFS);
  updateBodyVelocities(BODY_DEFS, 0, table, createPositionTable(BODY_DEFS), velocities);
  const frames = new ExpeditionFrames(); frames.update(0, table, velocities);
  const offset = new Vector3(0, 12, 110);
  return { pos: frames.asterion.toWorld(offset, new Vector3()), quat: frames.asterion.rotation.clone(), vel: frames.asterion.pointVelocity(offset, new Vector3()) };
}

export function createNewState(): GameState {
  const start = computeStartPose();
  return {
    time: 0,
    playSeconds: 0,
    pos: start.pos,
    vel: start.vel,
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
    homecoming: createHomecomingProgress(),
  };
}
