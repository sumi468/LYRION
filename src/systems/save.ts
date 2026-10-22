import { Quaternion, Vector3 } from 'three';
import { CATALOG_IDS, INITIAL_DETECTED } from '../data/starSystem';
import { MISSIONS } from '../data/missions';
import { UPGRADE_BY_ID, UPGRADE_IDS } from '../data/upgrades';
import { createNewState, HULL_MAX, type GameState } from '../core/state';

export const SAVE_KEY = 'lyrion.save.v1';
export const SAVE_VERSION = 1;

/** localStorage 互換の最小インターフェース(テストで差し替え可能) */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveData {
  version: number;
  savedAt: number;
  time: number;
  playSeconds: number;
  pos: [number, number, number];
  vel: [number, number, number];
  quat: [number, number, number, number];
  hull: number;
  energy: number;
  data: number;
  totalData: number;
  upgrades: Record<string, number>;
  upgradesBought: number;
  detected: string[];
  scanned: Record<string, number>;
  missionIndex: number;
  assist: boolean;
  cameraMode: 'third' | 'first';
}

export function serialize(s: GameState, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    time: s.time,
    playSeconds: s.playSeconds,
    pos: [s.pos.x, s.pos.y, s.pos.z],
    vel: [s.vel.x, s.vel.y, s.vel.z],
    quat: [s.quat.x, s.quat.y, s.quat.z, s.quat.w],
    hull: s.hull,
    energy: s.energy,
    data: s.data,
    totalData: s.totalData,
    upgrades: { ...s.upgrades },
    upgradesBought: s.upgradesBought,
    detected: [...s.detected],
    scanned: Object.fromEntries(s.scanned),
    missionIndex: s.missionIndex,
    assist: s.assist,
    cameraMode: s.cameraMode,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(isNum);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 外部入力(localStorage の文字列など)を検証して GameState へ復元する。
 * 壊れたデータ・古いバージョンでも例外を投げず、可能な限り復元し、無理なら null を返す。
 */
export function deserialize(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (!isNum(d.version) || d.version < 1 || d.version > SAVE_VERSION) return null;
  if (!isVec(d.pos, 3) || !isVec(d.quat, 4) || !isNum(d.time)) return null;

  const base = createNewState();
  const s: GameState = base;
  s.time = Math.max(0, d.time);
  s.playSeconds = isNum(d.playSeconds) ? Math.max(0, d.playSeconds) : 0;
  s.pos.set(d.pos[0], d.pos[1], d.pos[2]);
  if (isVec(d.vel, 3)) s.vel.set(d.vel[0], d.vel[1], d.vel[2]);
  s.quat = new Quaternion(d.quat[0], d.quat[1], d.quat[2], d.quat[3]);
  if (s.quat.lengthSq() < 1e-6) return null;
  s.quat.normalize();
  s.hull = isNum(d.hull) ? clamp(d.hull, 1, HULL_MAX) : HULL_MAX;
  s.energy = isNum(d.energy) ? Math.max(0, d.energy) : 100;
  s.data = isNum(d.data) ? Math.max(0, Math.floor(d.data)) : 0;
  s.totalData = isNum(d.totalData) ? Math.max(s.data, Math.floor(d.totalData)) : s.data;

  const up = d.upgrades && typeof d.upgrades === 'object' ? (d.upgrades as Record<string, unknown>) : {};
  let bought = 0;
  for (const id of UPGRADE_IDS) {
    const v = up[id];
    const lv = isNum(v) ? clamp(Math.floor(v), 0, UPGRADE_BY_ID[id].maxLevel) : 0;
    s.upgrades[id] = lv;
    bought += lv;
  }
  s.upgradesBought = Math.max(isNum(d.upgradesBought) ? Math.floor(d.upgradesBought) : 0, bought);

  const known = new Set(CATALOG_IDS);
  s.detected = new Set(INITIAL_DETECTED);
  if (Array.isArray(d.detected)) for (const id of d.detected) if (typeof id === 'string' && known.has(id)) s.detected.add(id);

  s.scanned = new Map();
  if (d.scanned && typeof d.scanned === 'object') {
    for (const [id, t] of Object.entries(d.scanned as Record<string, unknown>)) {
      if (known.has(id) && isNum(t)) {
        s.scanned.set(id, t);
        s.detected.add(id);
      }
    }
  }

  s.missionIndex = isNum(d.missionIndex) ? clamp(Math.floor(d.missionIndex), 0, MISSIONS.length) : 0;
  s.assist = typeof d.assist === 'boolean' ? d.assist : true;
  s.cameraMode = d.cameraMode === 'first' ? 'first' : 'third';
  return s;
}

export class SaveManager {
  constructor(private storage: StorageLike | null) {}

  /** セーブの有無(破損データは「なし」扱い) */
  hasSave(): boolean {
    return this.load() !== null;
  }

  save(s: GameState): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(serialize(s)));
      return true;
    } catch {
      // 容量超過・プライベートモード等。ゲーム進行は止めない
      return false;
    }
  }

  load(): GameState | null {
    if (!this.storage) return null;
    try {
      const txt = this.storage.getItem(SAVE_KEY);
      if (!txt) return null;
      return deserialize(JSON.parse(txt));
    } catch {
      return null;
    }
  }

  savedAt(): number | null {
    if (!this.storage) return null;
    try {
      const txt = this.storage.getItem(SAVE_KEY);
      if (!txt) return null;
      const o = JSON.parse(txt) as Partial<SaveData>;
      return isNum(o.savedAt) ? o.savedAt : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      /* noop */
    }
  }
}

export function safeLocalStorage(): StorageLike | null {
  try {
    const ls = window.localStorage;
    const k = '__lyrion_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

/** 使用しない import 警告を避けつつ、Vector3 型を再エクスポート(外部利用の利便性) */
export type { Vector3 };
