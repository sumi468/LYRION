import type { UpgradeDef, UpgradeId } from './types';

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: 'engine',
    name: 'エンジン推進力',
    nameEn: 'ENGINE OUTPUT',
    description: '加速力と巡航最高速度が向上する。',
    maxLevel: 4,
    baseCost: 40,
    costGrowth: 1.55,
  },
  {
    id: 'boost',
    name: 'ブースト性能',
    nameEn: 'BOOST DRIVE',
    description: 'ブースト時の加速と最高速度が上がり、消費エネルギーが減る。',
    maxLevel: 4,
    baseCost: 60,
    costGrowth: 1.55,
  },
  {
    id: 'scan',
    name: 'スキャン可能距離',
    nameEn: 'SCANNER RANGE',
    description: 'より遠くから天体をスキャンできる。恒星の安全な観測にも有効。',
    maxLevel: 4,
    baseCost: 50,
    costGrowth: 1.5,
  },
  {
    id: 'energy',
    name: 'エネルギー容量',
    nameEn: 'ENERGY CAPACITY',
    description: 'エネルギーの最大量と回復速度が上がる。ブースト継続時間が延びる。',
    maxLevel: 4,
    baseCost: 50,
    costGrowth: 1.5,
  },
];

export const UPGRADE_IDS: UpgradeId[] = UPGRADE_DEFS.map((u) => u.id);
export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  UPGRADE_DEFS.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;
