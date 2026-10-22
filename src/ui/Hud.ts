import type { HudSnapshot, MarkerInfo, Toast } from '../core/hud';
import { fmtDist, fmtNum, h, setText } from './dom';

/** プレイ中の HUD。DOM は一度だけ構築し、毎フレームは変化した値だけを書き換える。 */
export class Hud {
  readonly el: HTMLElement;

  private mission = h('div', { class: 'hud-mission' });
  private missionTitle = h('div', { class: 'mission-title' });
  private missionObj = h('div', { class: 'mission-obj' });
  private missionHint = h('div', { class: 'mission-hint' });
  private missionStep = h('div', { class: 'mission-step' });

  private dataVal = h('span', { class: 'num' }, '0');
  private hullBar = h('div', { class: 'bar-fill' });
  private hullVal = h('span', { class: 'bar-val' });
  private energyBar = h('div', { class: 'bar-fill' });
  private energyVal = h('span', { class: 'bar-val' });

  private heading = h('div', { class: 'hud-heading' });
  private speedVal = h('div', { class: 'speed-val' }, '0');
  private speedBar = h('div', { class: 'speed-fill' });
  private flags = h('div', { class: 'speed-flags' });
  private nearest = h('div', { class: 'speed-near' });

  private target = h('div', { class: 'hud-target' });
  private tName = h('div', { class: 't-name' });
  private tClass = h('div', { class: 't-class' });
  private tDist = h('div', { class: 't-dist' });
  private tState = h('div', { class: 't-state' });
  private tScanBar = h('div', { class: 't-scan-fill' });

  private markerLayer = h('div', { class: 'marker-layer' });
  private markers = new Map<string, HTMLElement>();
  private warning = h('div', { class: 'hud-warning' });
  private toasts = h('div', { class: 'toasts' });
  private glare = h('div', { class: 'glare' });
  private flash = h('div', { class: 'flash' });
  private lockHint = h('div', { class: 'lock-hint' }, 'クリックして視点操作を有効化');
  private fpsEl = h('div', { class: 'hud-fps' });
  private keys = h('div', { class: 'hud-keys' }, 'W/S 推進  A/D 横移動  Space/Shift 上昇/下降  F ブースト  R スキャン  Tab ターゲット  C 視点  Esc メニュー');
  private reticle = h('div', { class: 'reticle' }, h('i'), h('i'), h('i'), h('i'));

  private flashLevel = 0;
  private showFps = false;
  private last = new WeakMap<HTMLElement, string>();

  constructor(root: HTMLElement) {
    this.mission.append(
      h('div', { class: 'label' }, 'OBJECTIVE'),
      this.missionTitle,
      this.missionObj,
      this.missionHint,
      this.missionStep,
    );

    const status = h(
      'div',
      { class: 'hud-status' },
      h('div', { class: 'data-row' }, h('span', { class: 'label' }, 'DATA'), this.dataVal),
      h('div', { class: 'bar-row' }, h('span', { class: 'label' }, 'HULL'), h('div', { class: 'bar hull' }, this.hullBar), this.hullVal),
      h('div', { class: 'bar-row' }, h('span', { class: 'label' }, 'ENERGY'), h('div', { class: 'bar energy' }, this.energyBar), this.energyVal),
    );

    const speed = h(
      'div',
      { class: 'hud-speed' },
      this.nearest,
      h('div', { class: 'speed-main' }, this.speedVal, h('span', { class: 'unit' }, 'u/s')),
      h('div', { class: 'speed-track' }, this.speedBar),
      this.flags,
    );

    this.target.append(
      h('div', { class: 'label' }, 'TARGET'),
      this.tName,
      this.tClass,
      h('div', { class: 't-row' }, this.tDist, this.tState),
      h('div', { class: 't-scan' }, this.tScanBar),
    );

    this.el = h(
      'div',
      { class: 'hud', hidden: true },
      this.glare,
      this.markerLayer,
      this.reticle,
      this.mission,
      status,
      this.heading,
      speed,
      this.target,
      this.warning,
      this.toasts,
      this.fpsEl,
      this.keys,
      this.lockHint,
      this.flash,
    );
    root.append(this.el);
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
    if (!v) this.toasts.replaceChildren();
  }

  setShowFps(v: boolean): void {
    this.showFps = v;
    this.fpsEl.style.display = v ? 'block' : 'none';
  }

  /** 損傷時の赤いフラッシュ(0〜1) */
  damage(level: number): void {
    this.flashLevel = Math.max(this.flashLevel, Math.min(1, 0.25 + level));
  }

  toast(t: Toast): void {
    if (!t.title) return;
    const el = h('div', { class: `toast ${t.kind}` }, h('div', { class: 'toast-title' }, t.title), t.text ? h('div', { class: 'toast-text' }, t.text) : null);
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4200);
  }

  update(s: HudSnapshot): void {
    // ミッション
    if (s.mission) {
      setText(this.missionTitle, s.mission.title);
      setText(this.missionObj, s.mission.objective);
      setText(this.missionHint, s.mission.hint);
      setText(this.missionStep, `${s.mission.index + 1} / ${s.mission.total}`);
    } else {
      setText(this.missionTitle, 'すべての目標を達成');
      setText(this.missionObj, '自由に探索を続けられます');
      setText(this.missionHint, '');
      setText(this.missionStep, '');
    }

    // ステータス
    setText(this.dataVal, fmtNum(s.data));
    const hp = Math.max(0, Math.min(1, s.hull / s.hullMax));
    const ep = Math.max(0, Math.min(1, s.energy / s.energyMax));
    this.setStyle(this.hullBar, 'transform', `scaleX(${hp.toFixed(3)})`);
    this.setStyle(this.energyBar, 'transform', `scaleX(${ep.toFixed(3)})`);
    this.hullBar.classList.toggle('low', hp < 0.3);
    this.energyBar.classList.toggle('low', ep < 0.15);
    setText(this.hullVal, `${Math.round(hp * 100)}%`);
    setText(this.energyVal, `${Math.round(ep * 100)}%`);

    // 速度・方位
    setText(this.speedVal, fmtNum(s.speed));
    this.setStyle(this.speedBar, 'transform', `scaleX(${Math.max(0, Math.min(1, s.speedFrac / 4)).toFixed(3)})`);
    this.speedBar.classList.toggle('boost', s.boosting);
    setText(this.heading, `HDG ${String(Math.round(s.heading)).padStart(3, '0')}°   PIT ${s.pitch >= 0 ? '+' : ''}${Math.round(s.pitch)}°`);
    setText(
      this.flags,
      `${s.assist ? 'ASSIST ON' : 'ASSIST OFF'}  ·  ${s.camera === 'third' ? '3RD' : 'COCKPIT'}${s.boosting ? '  ·  BOOST' : ''}`,
    );
    setText(this.nearest, s.nearest ? `${s.nearest.name}  高度 ${fmtDist(s.nearest.altitude)} u` : '');

    // ターゲット
    this.target.classList.toggle('empty', !s.target);
    if (s.target) {
      const t = s.target;
      setText(this.tName, t.def.nameJa);
      setText(this.tClass, `${t.def.name}  ·  ${t.def.classLabel}`);
      setText(this.tDist, `${fmtDist(t.dist)} u`);
      let st = '';
      if (t.scanned) st = 'SCANNED';
      else if (t.scanning) st = `SCANNING ${Math.round(t.progress * 100)}%`;
      else if (t.inRange) st = '[R] スキャン可能';
      else st = `スキャン範囲 ${fmtDist(t.range)} u`;
      setText(this.tState, st);
      this.tState.className = `t-state ${t.scanned ? 'done' : t.scanning ? 'busy' : t.inRange ? 'ready' : ''}`;
      this.setStyle(this.tScanBar, 'transform', `scaleX(${t.scanned ? 1 : t.progress.toFixed(3)})`);
    }

    this.updateMarkers(s.markers);

    // 警告
    this.warning.classList.toggle('on', !!s.warning);
    if (s.warning) setText(this.warning, s.warning);

    // 恒星グレア
    if (s.sun && s.sun.opacity > 0.01) {
      this.glare.style.opacity = s.sun.opacity.toFixed(3);
      this.glare.style.transform = `translate(${s.sun.x.toFixed(1)}px, ${s.sun.y.toFixed(1)}px)`;
    } else {
      this.glare.style.opacity = '0';
    }

    this.lockHint.classList.toggle('on', !s.locked);
    if (this.showFps) setText(this.fpsEl, `${Math.round(s.fps)} FPS · ${s.qualityLabel}`);

    // ダメージフラッシュ
    if (this.flashLevel > 0.005) {
      this.flashLevel *= 0.9;
      this.flash.style.opacity = this.flashLevel.toFixed(3);
    } else if (this.flashLevel !== 0) {
      this.flashLevel = 0;
      this.flash.style.opacity = '0';
    }
  }

  private updateMarkers(list: MarkerInfo[]): void {
    const seen = new Set<string>();
    for (const m of list) {
      const key = `${m.kind}:${m.id}`;
      seen.add(key);
      let el = this.markers.get(key);
      if (!el) {
        el = h('div', { class: `marker ${m.kind}` }, h('div', { class: 'm-shape' }), h('div', { class: 'm-label' }), h('div', { class: 'm-dist' }));
        this.markerLayer.append(el);
        this.markers.set(key, el);
      }
      el.classList.toggle('offscreen', !m.onScreen);
      el.classList.toggle('done', m.scanned);
      el.classList.toggle('unknown', m.unknown);
      el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      const shape = el.firstElementChild as HTMLElement;
      shape.style.transform = m.onScreen ? '' : `rotate(${((m.angle * 180) / Math.PI).toFixed(1)}deg)`;
      setText(el.children[1] as HTMLElement, m.label);
      setText(el.children[2] as HTMLElement, `${fmtDist(m.dist)} u`);
    }
    for (const [k, el] of this.markers) {
      if (!seen.has(k)) {
        el.remove();
        this.markers.delete(k);
      }
    }
  }

  private setStyle(el: HTMLElement, prop: 'transform', value: string): void {
    if (this.last.get(el) === value) return;
    this.last.set(el, value);
    el.style[prop] = value;
  }
}
