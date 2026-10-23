export const DIFFICULTIES = {
  off: { label: '敵なし', count: 0, hp: 0, damage: 0, interval: 9, speed: 0, reward: 0, hint: '戦闘なしで探査と着陸を楽しめます' },
  easy: { label: 'Easy', count: 1, hp: 45, damage: 5, interval: 2.4, speed: 45, reward: 15, hint: '敵1機・低い攻撃力。初めての戦闘に' },
  normal: { label: 'Normal', count: 2, hp: 70, damage: 9, interval: 1.8, speed: 65, reward: 25, hint: '敵2機・標準的な哨戒部隊' },
  hard: { label: 'Hard', count: 3, hp: 100, damage: 14, interval: 1.25, speed: 85, reward: 40, hint: '敵3機・高耐久・速い攻撃。熟練者向け' },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const isDifficulty = (value: unknown): value is Difficulty => typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
export const SHIELD_MAX = 60;
export const WEAPON_RANGE = 1300;
