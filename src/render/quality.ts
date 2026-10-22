/**
 * 画質プロファイルと Auto 画質コントローラ。
 * 描画負荷に関わるパラメータはすべてここに集約する。
 */

export type QualitySetting = 'low' | 'medium' | 'high' | 'auto';

export interface QualityProfile {
  label: string;
  /** 内部解像度スケール(devicePixelRatio 上限適用後にさらに乗算) */
  renderScale: number;
  /** devicePixelRatio の上限 */
  maxDpr: number;
  /** 星空の描画数 */
  stars: number;
  /** 小惑星のインスタンス数(上限) */
  belt: number;
  /** 宇宙塵(速度感の演出)の数 */
  dust: number;
  /** 球体の分割数 [近, 中, 遠] */
  segments: [number, number, number];
  clouds: boolean;
  bump: boolean;
  /** 天体を描画する最大距離(月・小惑星帯・探査機のカリングに使用) */
  cullDistance: number;
  /** 恒星グレア(CSS オーバーレイ) */
  glare: boolean;
}

/** 低→高 の 6 段階。Auto はこのラダーを上下する */
export const QUALITY_LADDER: QualityProfile[] = [
  { label: 'L0', renderScale: 0.5, maxDpr: 1, stars: 1500, belt: 600, dust: 60, segments: [24, 16, 10], clouds: false, bump: false, cullDistance: 12000, glare: false },
  { label: 'L1', renderScale: 0.65, maxDpr: 1, stars: 2500, belt: 900, dust: 100, segments: [32, 20, 12], clouds: true, bump: false, cullDistance: 14000, glare: true },
  { label: 'L2', renderScale: 0.8, maxDpr: 1.25, stars: 3500, belt: 1400, dust: 150, segments: [40, 24, 12], clouds: true, bump: true, cullDistance: 20000, glare: true },
  { label: 'L3', renderScale: 0.9, maxDpr: 1.5, stars: 5000, belt: 2000, dust: 220, segments: [56, 32, 16], clouds: true, bump: true, cullDistance: 30000, glare: true },
  { label: 'L4', renderScale: 1.0, maxDpr: 1.75, stars: 7000, belt: 2800, dust: 300, segments: [72, 40, 20], clouds: true, bump: true, cullDistance: 60000, glare: true },
  { label: 'L5', renderScale: 1.0, maxDpr: 2, stars: 9000, belt: 3600, dust: 380, segments: [96, 48, 24], clouds: true, bump: true, cullDistance: 80000, glare: true },
];

/** 固定設定とラダー段の対応 */
export const FIXED_LEVEL: Record<Exclude<QualitySetting, 'auto'>, number> = { low: 1, medium: 3, high: 5 };

/** 惑星テクスチャのベイク幅(起動時に決定。高さは幅の半分) */
export function bakeWidthFor(setting: QualitySetting, mobile: boolean): number {
  if (setting === 'low') return 512;
  if (setting === 'high') return 2048;
  // medium / auto: モバイルは軽量、それ以外は 1024
  return mobile ? 512 : 1024;
}

export function startLevelFor(setting: QualitySetting, mobile: boolean): number {
  if (setting === 'auto') return mobile ? 1 : 3;
  return FIXED_LEVEL[setting];
}

/**
 * 実測フレームレートで画質を段階的に調整する。
 * - 一定時間ごとの平均 fps が目標を下回れば 1 段下げる。
 * - 十分な余裕が長く続いた場合のみ、クールダウン後に 1 段上げる。
 * DOM や three に依存しない純粋なクラスなのでテスト可能。
 */
export class AutoQuality {
  level: number;
  private acc = 0;
  private frames = 0;
  private lowWindows = 0;
  private highWindows = 0;
  private cooldown = 0;
  /** 一度下げた段より上には戻らない(上げ下げの往復による周期的なカクつきを防ぐ) */
  private ceiling: number;

  constructor(
    startLevel: number,
    readonly targetFps: number,
    readonly maxLevel: number = QUALITY_LADDER.length - 1,
    readonly windowSec = 1.5,
  ) {
    this.level = startLevel;
    this.ceiling = maxLevel;
  }

  /** フレームごとに呼ぶ。レベルが変わったときだけ新しい値を返す */
  update(dt: number): number | null {
    // タブ復帰・ロード直後などの異常に長いフレームは計測から除外
    if (dt <= 0 || dt > 0.5) return null;
    this.acc += dt;
    this.frames++;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.acc < this.windowSec) return null;

    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;

    if (fps < this.targetFps * 0.9) {
      this.lowWindows++;
      this.highWindows = 0;
      if (this.lowWindows >= 2 && this.level > 0) {
        this.lowWindows = 0;
        this.level--;
        this.ceiling = Math.min(this.ceiling, this.level);
        this.cooldown = 12;
        return this.level;
      }
    } else if (fps > this.targetFps * 0.97) {
      // 目標に張り付いているときだけ余裕ありと判断する
      this.lowWindows = 0;
      this.highWindows++;
      if (this.highWindows >= 5 && this.cooldown <= 0 && this.level < this.ceiling) {
        this.highWindows = 0;
        this.level++;
        this.cooldown = 12;
        return this.level;
      }
    } else {
      this.lowWindows = 0;
      this.highWindows = 0;
    }
    return null;
  }
}
