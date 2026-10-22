import type { BodyDef } from '../data/types';

/** その天体をスキャンできる「表面からの距離」[u] */
export function scanRangeFor(def: BodyDef, baseRange: number): number {
  return baseRange * def.scanRangeMul;
}

export type ScanPhase = 'idle' | 'scanning' | 'done' | 'cancelled';

export interface ScanState {
  id: string | null;
  progress: number;
}

export function createScanState(): ScanState {
  return { id: null, progress: 0 };
}

export function beginScan(s: ScanState, id: string): void {
  s.id = id;
  s.progress = 0;
}

export function cancelScan(s: ScanState): void {
  s.id = null;
  s.progress = 0;
}

/**
 * スキャンを dt 秒進める。範囲外や対象変更なら中断、完了なら 'done'(状態はリセットされる)。
 * 純粋関数に近い形にして単体テストできるようにしている。
 */
export function stepScan(s: ScanState, dt: number, def: BodyDef | null, inRange: boolean, currentTarget: string | null): ScanPhase {
  if (!s.id) return 'idle';
  if (!def || def.id !== s.id || currentTarget !== s.id || !inRange) {
    cancelScan(s);
    return 'cancelled';
  }
  s.progress += dt / Math.max(0.1, def.scanTime);
  if (s.progress >= 1) {
    cancelScan(s);
    return 'done';
  }
  return 'scanning';
}
