import { CATALOG_IDS } from './starSystem';

export interface MissionProgress {
  scanned: ReadonlySet<string>;
  upgradesBought: number;
}

export interface MissionDef {
  id: string;
  title: string;
  /** 目的の説明(HUD に表示) */
  objective: string;
  /** 補足ヒント */
  hint: string;
  reward: number;
  isComplete(p: MissionProgress): boolean;
  /** 現在ガイドするターゲット天体。null ならマーカーなし */
  resolveTarget(p: MissionProgress): string | null;
}

const scannedAll = (p: MissionProgress, ids: string[]) => ids.every((i) => p.scanned.has(i));
const firstUnscanned = (p: MissionProgress, ids: string[]) => ids.find((i) => !p.scanned.has(i)) ?? null;

const AURELION_MOONS = ['ember', 'glacia', 'mira'];

export const MISSIONS: MissionDef[] = [
  {
    id: 'm_cindra',
    title: '灼熱の岩石惑星',
    objective: '惑星シンドラに接近し、スキャンする',
    hint: 'W で前進。Tab でターゲットを切り替え、スキャン距離に入ったら R を押す。',
    reward: 15,
    isComplete: (p) => p.scanned.has('cindra'),
    resolveTarget: () => 'cindra',
  },
  {
    id: 'm_thalassa',
    title: '青い海の惑星',
    objective: '惑星タラッサへ向かい、スキャンする',
    hint: 'F(またはマウス右ボタン)でブースト。エネルギーを使い切らないよう注意。',
    reward: 20,
    isComplete: (p) => p.scanned.has('thalassa'),
    resolveTarget: () => 'thalassa',
  },
  {
    id: 'm_upgrade',
    title: '船を強化する',
    objective: '探査データで宇宙船をアップグレードする',
    hint: 'Esc でメニューを開き「アップグレード」を選ぶ。(U キーでも開ける)',
    reward: 10,
    isComplete: (p) => p.upgradesBought >= 1,
    resolveTarget: () => null,
  },
  {
    id: 'm_belt',
    title: '小惑星帯を越えて',
    objective: 'ハルシオン小惑星帯に入り、スキャンする',
    hint: '岩に衝突すると船体が傷つく。密集域では速度を落として慎重に。',
    reward: 25,
    isComplete: (p) => p.scanned.has('halcyon'),
    resolveTarget: () => 'halcyon',
  },
  {
    id: 'm_aurelion',
    title: 'リングをまとう巨人',
    objective: 'ガス惑星アウレリオンをスキャンする',
    hint: 'リングは岩と氷の粒子の集まり。リング面から離れると全体像が見える。',
    reward: 35,
    isComplete: (p) => p.scanned.has('aurelion'),
    resolveTarget: () => 'aurelion',
  },
  {
    id: 'm_moons',
    title: '巨人の衛星たち',
    objective: 'アウレリオンの衛星を2つスキャンする',
    hint: 'エンバー・グラキア・ミラのうち2つ。スキャンで探査機の残骸も見つかるかもしれない。',
    reward: 40,
    isComplete: (p) => AURELION_MOONS.filter((m) => p.scanned.has(m)).length >= 2,
    resolveTarget: (p) => firstUnscanned(p, AURELION_MOONS),
  },
  {
    id: 'm_vesper',
    title: '星系の最果てへ',
    objective: '最外縁の氷惑星ヴェスパーを発見し、スキャンする',
    hint: 'アウレリオンのさらに外側。接近するまで詳細は不明。',
    reward: 60,
    isComplete: (p) => p.scanned.has('vesper'),
    resolveTarget: () => 'vesper',
  },
  {
    id: 'm_catalog',
    title: 'リリオン星系の完全調査',
    objective: '星系のすべての天体をスキャンして記録を完成させる',
    hint: '恒星・衛星・探査機の残骸など、未調査の天体が残っている。',
    reward: 120,
    isComplete: (p) => scannedAll(p, CATALOG_IDS),
    resolveTarget: (p) => firstUnscanned(p, CATALOG_IDS),
  },
];
