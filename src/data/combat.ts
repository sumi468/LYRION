export const DIFFICULTIES = {
  off: { label: '敵なし', count: 0, hp: 0, shield: 0, damage: 0, interval: 9, speed: 0, burst: 0, assist: .9848, reinforcement: 0, reward: 0, hint: '戦闘なしで探査と着陸を楽しめます' },
  easy: { label: 'Easy', count: 1, hp: 65, shield: 15, damage: 5, interval: 2.6, speed: 120, burst: 2, assist: .9903, reinforcement: 0, reward: 20, hint: '敵1機・短い連射。操縦と照準の練習に' },
  normal: { label: 'Normal', count: 3, hp: 160, shield: 50, damage: 7, interval: 2.4, speed: 240, burst: 3, assist: .9986, reinforcement: 22, reward: 40, hint: '追撃・回避・3連射・増援。Vで回避ロール' },
  hard: { label: 'Hard', count: 5, hp: 210, shield: 75, damage: 9, interval: 1.9, speed: 320, burst: 4, assist: .9994, reinforcement: 16, reward: 65, hint: '敵5機・包囲・4連射・短い間隔の増援' },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const isDifficulty = (value: unknown): value is Difficulty => typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
export const SHIELD_MAX = 60;
export const WEAPON_RANGE = 1300;
export const MAX_ENEMIES = 6;
export const MAX_BOLTS = 160;
export const DODGE_DURATION = .9;
export const DODGE_COOLDOWN = 6;
export const DODGE_ENERGY = 18;
export type EnemyRole = 'hunter' | 'interceptor' | 'gunship';
export const ENEMY_ROLE_LABELS = { hunter:'追撃機', interceptor:'迎撃機', gunship:'重戦機' } as const;
