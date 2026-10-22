import { UPGRADE_BY_ID, UPGRADE_IDS } from '../data/upgrades';
import type { UpgradeId } from '../data/types';

export type UpgradeLevels = Record<UpgradeId, number>;

export function createUpgradeLevels(): UpgradeLevels {
  return { engine: 0, boost: 0, scan: 0, energy: 0 };
}

/** 現在の強化レベルから決まる宇宙船の性能値 */
export interface ShipStats {
  /** 前進加速度 [u/s^2] */
  thrust: number;
  /** 巡航最高速度 [u/s] */
  maxSpeed: number;
  /** ブースト中の加速倍率 */
  boostAccelMul: number;
  /** ブースト中の最高速度倍率(maxSpeed に乗算) */
  boostSpeedMul: number;
  /** ブースト消費 [energy/s] */
  boostDrain: number;
  energyMax: number;
  /** エネルギー回復 [energy/s] */
  energyRegen: number;
  /** スキャン可能距離(天体表面からの距離) [u] */
  scanRange: number;
}

export function computeShipStats(lv: UpgradeLevels): ShipStats {
  return {
    thrust: 90 * (1 + 0.2 * lv.engine),
    maxSpeed: 300 * (1 + 0.14 * lv.engine),
    boostAccelMul: 3.2 + 0.5 * lv.boost,
    boostSpeedMul: 3.4 + 0.45 * lv.boost,
    boostDrain: 16 * (1 - 0.07 * lv.boost),
    energyMax: 100 + 30 * lv.energy,
    energyRegen: 5 * (1 + 0.12 * lv.energy),
    scanRange: 750 + 350 * lv.scan,
  };
}

/** 次レベルへのコスト。最大レベルなら null */
export function upgradeCost(id: UpgradeId, currentLevel: number): number | null {
  const def = UPGRADE_BY_ID[id];
  if (currentLevel >= def.maxLevel) return null;
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

export type PurchaseResult =
  | { ok: true; newLevel: number; cost: number }
  | { ok: false; reason: 'max' | 'funds' };

/** 購入可否を判定し、可能なら levels を更新して残高を返す(副作用はここだけ) */
export function purchaseUpgrade(
  id: UpgradeId,
  levels: UpgradeLevels,
  data: number,
): PurchaseResult & { data: number } {
  const cost = upgradeCost(id, levels[id]);
  if (cost === null) return { ok: false, reason: 'max', data };
  if (data < cost) return { ok: false, reason: 'funds', data };
  levels[id] += 1;
  return { ok: true, newLevel: levels[id], cost, data: data - cost };
}

export function totalUpgradeLevels(lv: UpgradeLevels): number {
  return UPGRADE_IDS.reduce((s, id) => s + lv[id], 0);
}
