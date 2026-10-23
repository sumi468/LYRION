import type { Game } from '../core/Game';
import { DIFFICULTIES, type Difficulty } from '../data/combat';
import type { ActionName } from '../input/Input';
import { BODY_DEFS } from '../data/starSystem';
import { UPGRADE_DEFS } from '../data/upgrades';
import type { BodyDef, UpgradeDef } from '../data/types';
import { computeShipStats, upgradeCost } from '../systems/upgrades';
import type { QualitySetting } from '../render/quality';
import type { Settings } from '../systems/settings';
import { clear, fmtNum, fmtTime, h } from './dom';
import { Hud } from './Hud';

type Panel = 'none' | 'loading' | 'main' | 'pause' | 'log' | 'upgrades' | 'settings' | 'complete';

const CONTROLS: [string, string][] = [
  ['W / S', '前進 / 後退'],
  ['A / D', '左 / 右へバンク旋回'],
  ['Space / Shift', '機首を上げる / 下げる'],
  ['マウス', '機首の向き(矢印キーでも可)'],
  ['Q / E', 'ロール(左 / 右)'],
  ['F / 右クリック', 'ブースト(エネルギー消費)'],
  ['X', 'ブレーキ'],
  ['Z', 'フライトアシスト ON / OFF'],
  ['C', '視点切替(三人称 / コックピット)'],
  ['Tab', 'ターゲット切替'],
  ['R', 'スキャン開始 / 中断'],
  ['左クリック / J', '連装パルス砲（押し続けて連射）'],
  ['G', '自動着陸 / 離陸 / 降下中止'],
  ['V', '回避ロール（エネルギー18・冷却6秒）'],
  ['U / L', 'アップグレード / 探査記録'],
  ['Esc / P', '一時停止'],
];

/** メニュー・パネル・HUD を束ねる UI 層。ゲームとは events / 公開メソッドだけでやり取りする。 */
export class Ui {
  readonly hud: Hud;
  private panel: Panel = 'loading';
  private screens = new Map<Panel, HTMLElement>();
  private logSel: string | null = null;
  private loadBar = h('div', { class: 'load-fill' });
  private loadLabel = h('div', { class: 'load-label' }, '');
  private fatal: HTMLElement;
  private rebuildStatus = h('div', { class: 'rebuild-status', role: 'status', hidden: true });

  constructor(private root: HTMLElement, private game: Game, fatalEl: HTMLElement) {
    this.fatal = fatalEl;
    root.append(this.rebuildStatus);
    this.hud = new Hud(root);
    this.hud.setShowFps(game.settings.showFps);
    this.buildLoading();
    for (const p of ['main', 'pause', 'log', 'upgrades', 'settings', 'complete'] as Panel[]) {
      const el = h('div', { class: 'screen', 'data-screen': p });
      this.screens.set(p, el);
      root.append(el);
    }
    this.bindGame();
    game.afterFrame = () => {
      if (game.phase === 'playing') this.hud.update(game.snapshot());
    };
    this.show('loading');
  }

  // ------------------------------------------------------------- 画面切替

  private show(p: Panel): void {
    this.panel = p;
    for (const [k, el] of this.screens) el.classList.toggle('on', k === p);
    const loading = this.screens.get('loading');
    loading?.classList.toggle('on', p === 'loading');
    if (p === 'main') this.renderMain();
    if (p === 'pause') this.renderPause();
    if (p === 'log') this.renderLog();
    if (p === 'upgrades') this.renderUpgrades();
    if (p === 'settings') this.renderSettings();
    this.hud.setVisible(this.game.phase === 'playing');
  }

  /** パネルの「戻る」先 */
  private home(): Panel {
    return this.game.phase === 'menu' ? 'main' : 'pause';
  }

  private bindGame(): void {
    const g = this.game;
    g.ev.on('loading', ({ progress, label }) => {
      this.loadBar.style.transform = `scaleX(${progress.toFixed(3)})`;
      this.loadLabel.textContent = label;
    });
    g.ev.on('rebuilding', ({ progress, label }) => {
      this.rebuildStatus.hidden = progress >= 1;
      this.rebuildStatus.textContent = `${label}  ${Math.round(progress * 100)}%`;
    });
    g.ev.on('phase', (p) => {
      if (p === 'playing') this.show('none');
      else if (p === 'menu') this.show('main');
      else if (p === 'paused') this.show('pause');
    });
    g.ev.on('toast', (t) => this.hud.toast(t));
    g.ev.on('damage', (d) => this.hud.damage(d));
    g.ev.on('scanned', ({ def, reward }) => {
      this.hud.toast({ kind: 'reward', title: `スキャン完了: ${def.nameJa}`, text: `+${reward} DATA  ·  探査記録に追加` });
    });
    g.ev.on('mission', ({ completed, reward, next }) => {
      const last = completed[completed.length - 1];
      this.hud.toast({
        kind: 'reward',
        title: `目標達成: ${last.title}`,
        text: `+${reward} DATA${next ? `  ·  次: ${next.objective}` : ''}`,
      });
    });
    g.ev.on('finished', () => {
      setTimeout(() => {
        if (g.phase === 'playing') {
          g.pause();
          this.show('complete');
          this.renderComplete();
        }
      }, 1600);
    });
    g.ev.on('purchased', () => {
      if (this.panel === 'upgrades') this.renderUpgrades();
    });
    g.ev.on('fatal', ({ message }) => this.showFatal(message));
  }

  showFatal(message: string): void {
    this.fatal.hidden = false;
    clear(this.fatal);
    this.fatal.append(
      h('div', { class: 'fatal-box' }, h('h2', {}, 'LYRION を起動できません'), h('p', {}, message), h('button', { class: 'btn', onclick: () => location.reload() }, '再読み込み')),
    );
  }

  /** Esc / P / U / L の処理(Input から呼ばれる) */
  handleAction(a: ActionName): void {
    const g = this.game;
    if (g.phase === 'loading') return;
    // ポインタロック解除(Esc)直後に届く keydown を無視して、メニューが即座に閉じるのを防ぐ
    if (a === 'pause' && performance.now() - g.lastLockLoss < 350) return;

    if (a === 'pause') {
      if (g.phase === 'playing') g.pause();
      else if (g.phase === 'paused') {
        if (this.panel === 'pause') g.resume();
        else this.show('pause');
      } else if (g.phase === 'menu' && this.panel !== 'main') this.show('main');
      return;
    }
    const target: Panel = a === 'upgrades' ? 'upgrades' : 'log';
    if (g.phase === 'playing') {
      g.pause();
      this.show(target);
    } else if (this.panel === target) {
      this.show(this.home());
    } else if (g.phase === 'paused' || g.phase === 'menu') {
      this.show(target);
    }
  }

  // ------------------------------------------------------------- 各画面

  private buildLoading(): void {
    const el = h(
      'div',
      { class: 'screen on loading', 'data-screen': 'loading' },
      h('div', { class: 'logo' }, 'LYRION'),
      h('div', { class: 'logo-sub' }, 'BEYOND THE STARS'),
      h('div', { class: 'load-bar' }, this.loadBar),
      this.loadLabel,
    );
    this.screens.set('loading', el);
    this.root.append(el);
  }

  private btn(label: string, onclick: () => void, opts: { primary?: boolean; disabled?: boolean; sub?: string } = {}): HTMLButtonElement {
    const b = h(
      'button',
      { class: `btn${opts.primary ? ' primary' : ''}`, onclick, disabled: opts.disabled },
      h('span', { class: 'btn-label' }, label),
      opts.sub ? h('span', { class: 'btn-sub' }, opts.sub) : null,
    );
    return b;
  }

  private renderMain(): void {
    const g = this.game;
    const el = this.screens.get('main')!;
    clear(el);
    const saved = g.menuHasSave;
    const savedAt = g.saves.savedAt();
    const sub = saved
      ? `${fmtNum(g.state.totalData)} DATA  ·  スキャン ${g.state.scanned.size}/${BODY_DEFS.length}${savedAt ? '  ·  ' + new Date(savedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : ''}`
      : undefined;
    const list = h(
      'div',
      { class: 'menu-list' },
      this.btn('続きから', () => g.continueGame(), { primary: saved, disabled: !saved, sub }),
      this.btn('新しい探査を開始', () => this.confirmNew(), { primary: !saved }),
      this.btn('探査記録', () => this.show('log'), { disabled: !saved }),
      this.btn('宇宙船アップグレード', () => this.show('upgrades'), { disabled: !saved }),
      this.btn('設定', () => this.show('settings')),
    );
    el.append(
      h('div', { class: 'main-menu' }, h('div', { class: 'logo' }, 'LYRION'), h('div', { class: 'logo-sub' }, 'BEYOND THE STARS'), this.difficultySelector(()=>this.renderMain()), list),
      h('div', { class: 'main-foot' }, 'WASD で操縦  ·  マウスで視点  ·  F でブースト  ·  R でスキャン'),
    );
  }

  private confirmNew(): void {
    if (!this.game.menuHasSave || confirm('既存のセーブデータを削除して、最初から始めますか?')) this.game.startNew();
  }

  private difficultySelector(refresh:()=>void):HTMLElement {
    const selected=this.game.settings.difficulty;
    return h('div',{class:'difficulty-select'},h('div',{class:'label'},'ENEMY LEVEL / 敵の難易度'),
      h('div',{class:'segs'},...(Object.keys(DIFFICULTIES) as Difficulty[]).map(level=>
        h('button',{class:`seg${selected===level?' on':''}`,'aria-pressed':selected===level,onclick:()=>{this.game.applySettings({...this.game.settings,difficulty:level});refresh();}},DIFFICULTIES[level].label))),
      h('div',{class:'dim small'},DIFFICULTIES[selected].hint));
  }

  private renderPause(): void {
    const g = this.game;
    const el = this.screens.get('pause')!;
    clear(el);
    el.append(
      h(
        'div',
        { class: 'pause-menu' },
        h('div', { class: 'panel-title' }, 'PAUSED'),
        h('div', { class: 'pause-stat' }, `探査データ ${fmtNum(g.state.data)}   ·   スキャン ${g.state.scanned.size}/${BODY_DEFS.length}   ·   飛行時間 ${fmtTime(g.state.playSeconds)}`),
        h(
          'div',
          { class: 'menu-list' },
          this.btn('再開', () => g.resume(), { primary: true }),
          this.btn('宇宙船アップグレード', () => this.show('upgrades')),
          this.btn('探査記録', () => this.show('log')),
          this.btn('設定', () => this.show('settings')),
          this.btn('セーブしてメインメニューへ', () => g.toMenu()),
        ),
      ),
    );
  }

  private panelShell(title: string, body: Node, extra?: Node): HTMLElement {
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, title), extra ?? null, h('button', { class: 'close', 'aria-label': '戻る', onclick: () => this.show(this.home()) }, '×')),
      body,
    );
  }

  // --- 探査記録 ---

  private renderLog(): void {
    const g = this.game;
    const s = g.state;
    const el = this.screens.get('log')!;
    clear(el);
    if (!this.logSel || !BODY_DEFS.some((d) => d.id === this.logSel)) {
      this.logSel = BODY_DEFS.find((d) => s.scanned.has(d.id))?.id ?? BODY_DEFS[1].id;
    }

    const list = h('div', { class: 'log-list' });
    for (const d of BODY_DEFS) {
      const scanned = s.scanned.has(d.id);
      const known = s.detected.has(d.id);
      list.append(
        h(
          'button',
          { class: `log-item${d.id === this.logSel ? ' sel' : ''}${scanned ? ' done' : ''}`, onclick: () => { this.logSel = d.id; this.renderLog(); } },
          h('span', { class: 'dot' }),
          h('span', { class: 'li-name' }, known ? d.nameJa : '???'),
          h('span', { class: 'li-tag' }, scanned ? 'SCANNED' : known ? '未スキャン' : '未探知'),
        ),
      );
    }
    const pct = Math.round((s.scanned.size / BODY_DEFS.length) * 100);
    const progress = h(
      'div',
      { class: 'log-progress' },
      h('span', {}, `記録完成率 ${pct}%  (${s.scanned.size}/${BODY_DEFS.length})`),
      h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `transform:scaleX(${pct / 100})` })),
    );

    const body = h('div', { class: 'log-body' }, h('div', { class: 'log-side' }, progress, list), this.logDetail(this.logSel));
    el.append(this.panelShell('探査記録  EXPLORATION LOG', body));
  }

  private logDetail(id: string): HTMLElement {
    const s = this.game.state;
    const d = BODY_DEFS.find((b) => b.id === id)!;
    const scanned = s.scanned.has(id);
    const known = s.detected.has(id);
    const box = h('div', { class: 'log-detail' });
    if (!known) {
      box.append(h('div', { class: 'detail-name' }, '???'), h('p', { class: 'dim' }, 'この天体はまだ探知されていません。星系を探索して、手がかりを探してください。'));
      return box;
    }
    box.append(h('div', { class: 'detail-name' }, d.nameJa, h('span', { class: 'detail-en' }, d.name)), h('div', { class: 'detail-class' }, d.classLabel));
    if (!scanned) {
      box.append(
        h('p', { class: 'dim' }, '詳細データは未取得です。接近してスキャンすると、この天体の情報が開示されます。'),
        h('div', { class: 'reward-chip' }, `スキャン報酬 +${d.scanReward} DATA`),
      );
      return box;
    }
    box.append(h('p', { class: 'detail-desc' }, d.description), this.specTable(d), this.scaleNote(d));
    box.append(h('div', { class: 'label' }, 'FEATURES'), h('ul', { class: 'features' }, ...d.features.map((f) => h('li', {}, f))));
    return box;
  }

  private specTable(d: BodyDef): HTMLElement {
    const rows: [string, string][] = [];
    if (d.kind !== 'belt') rows.push(['直径(設定値)', `${fmtNum(d.realDiameterKm)} km`]);
    if (d.massEarth !== undefined) rows.push(['質量', d.massEarth >= 1000 ? `地球の ${fmtNum(d.massEarth)} 倍` : `地球の ${d.massEarth} 倍`]);
    if (d.gravityG !== undefined) rows.push(['表面重力', `${d.gravityG} g`]);
    rows.push(['温度', `${d.tempK} K (${Math.round(d.tempK - 273.15)} °C)`]);
    rows.push(['大気', d.atmosphereNote]);
    rows.push(['軌道', d.realOrbit]);
    return h('div', { class: 'specs' }, ...rows.map(([k, v]) => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v))));
  }

  private scaleNote(d: BodyDef): HTMLElement {
    const txt =
      d.kind === 'belt' && d.belt
        ? `ゲーム内: 内縁 ${fmtNum(d.belt.inner)} u / 外縁 ${fmtNum(d.belt.outer)} u(設定値とは別のゲーム内スケール)`
        : `ゲーム内スケール: 半径 ${d.radius} u${d.orbit ? ` / 軌道半径 ${fmtNum(d.orbit.radius)} u` : ''}  — 見やすさのため実寸より誇張・圧縮しています`;
    return h('div', { class: 'scale-note' }, txt);
  }

  // --- アップグレード ---

  private renderUpgrades(): void {
    const g = this.game;
    const el = this.screens.get('upgrades')!;
    clear(el);
    const lv = g.state.upgrades;
    const cards = h('div', { class: 'upg-grid' });
    for (const u of UPGRADE_DEFS) cards.append(this.upgradeCard(u, lv[u.id]));
    const data = h('div', { class: 'data-badge' }, h('span', { class: 'label' }, 'DATA'), h('span', { class: 'num' }, fmtNum(g.state.data)));
    el.append(this.panelShell('宇宙船アップグレード  SHIP UPGRADES', cards, data));
  }

  private upgradeCard(u: UpgradeDef, level: number): HTMLElement {
    const g = this.game;
    const cost = upgradeCost(u.id, level);
    const can = cost !== null && g.state.data >= cost && (g.phase !== 'menu' || g.menuHasSave);
    const pips = h('div', { class: 'pips' });
    for (let i = 0; i < u.maxLevel; i++) pips.append(h('i', { class: i < level ? 'on' : '' }));

    // 現在値 → 次レベルの性能値を実際の計算式から求める
    const now = computeShipStats(g.state.upgrades);
    const nextLv = { ...g.state.upgrades, [u.id]: Math.min(u.maxLevel, level + 1) };
    const nxt = computeShipStats(nextLv);
    const lines: [string, number, number, string][] = {
      engine: [
        ['推進力', now.thrust, nxt.thrust, ''],
        ['巡航速度', now.maxSpeed, nxt.maxSpeed, ' u/s'],
      ],
      boost: [
        ['ブースト最高速', now.maxSpeed * now.boostSpeedMul, nxt.maxSpeed * nxt.boostSpeedMul, ' u/s'],
        ['消費', now.boostDrain, nxt.boostDrain, '/s'],
      ],
      scan: [['スキャン距離', now.scanRange, nxt.scanRange, ' u']],
      energy: [
        ['容量', now.energyMax, nxt.energyMax, ''],
        ['回復', now.energyRegen, nxt.energyRegen, '/s'],
      ],
    }[u.id] as [string, number, number, string][];

    const maxed = cost === null;
    return h(
      'div',
      { class: `upg-card${maxed ? ' maxed' : ''}` },
      h('div', { class: 'upg-en' }, u.nameEn),
      h('div', { class: 'upg-name' }, u.name),
      pips,
      h('p', { class: 'upg-desc' }, u.description),
      h(
        'div',
        { class: 'upg-stats' },
        ...lines.map(([k, a, b, unit]) =>
          h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, maxed ? `${Math.round(a)}${unit}` : `${Math.round(a)} → ${Math.round(b)}${unit}`)),
        ),
      ),
      this.btn(maxed ? 'MAX' : `強化  ${cost} DATA`, () => { g.buyUpgrade(u.id); this.renderUpgrades(); }, { primary: can, disabled: !can }),
    );
  }

  // --- 設定 ---

  private renderSettings(): void {
    const g = this.game;
    const el = this.screens.get('settings')!;
    clear(el);
    const st = g.settings;
    const set = (patch: Partial<Settings>) => {
      const next = { ...g.settings, ...patch };
      g.applySettings(next);
      this.hud.setShowFps(next.showFps);
    };

    const qualityBtn = (q: QualitySetting, label: string, hint: string) =>
      h('button', { class: `seg${st.quality === q ? ' on' : ''}`, onclick: () => { set({ quality: q }); this.renderSettings(); }, title: hint }, label);

    const slider = (label: string, min: number, max: number, step: number, val: number, key: 'sensitivity' | 'fov' | 'masterVolume' | 'musicVolume' | 'effectsVolume', fmt: (v: number) => string) => {
      const out = h('span', { class: 'v' }, fmt(val));
      const input = h('input', { type: 'range', min, max, step, value: val });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        set({ [key]: v } as Partial<Settings>);
      });
      return h('label', { class: 'row' }, h('span', { class: 'k' }, label), input, out);
    };
    const toggle = (label: string, on: boolean, fn: (v: boolean) => void) => {
      const cb = h('input', { type: 'checkbox', checked: on });
      cb.checked = on;
      cb.addEventListener('change', () => fn(cb.checked));
      return h('label', { class: 'row' }, h('span', { class: 'k' }, label), cb, h('span', { class: 'v' }));
    };

    const gfx = h(
      'div',
      { class: 'set-group' },
      h('div', { class: 'label' }, 'GRAPHICS'),
      h('div', { class: 'segs' }, qualityBtn('low', 'Low', '解像度 65% · 軽量(モバイル向け)'), qualityBtn('medium', 'Medium', '解像度 90% · バランス'), qualityBtn('high', 'High', '解像度 100% · 高精細テクスチャ'), qualityBtn('auto', 'Auto', 'フレームレートを測定して自動調整')),
      h('div', { class: 'dim small' }, st.quality === 'auto' ? `現在の段階: ${g.qualityLabel}  (実測 fps に応じて段階的に調整)` : `現在の設定: ${g.qualityLabel}  ·  解像度・描画距離・星の数・小惑星・雲・凹凸を調整`),
      toggle('FPS 表示', st.showFps, (v) => set({ showFps: v })),
    );
    const ctl = h(
      'div',
      { class: 'set-group' },
      h('div', { class: 'label' }, 'CONTROLS'),
      slider('マウス感度', 0.2, 3, 0.1, st.sensitivity, 'sensitivity', (v) => v.toFixed(1)),
      slider('視野角 (FOV)', 55, 100, 1, st.fov, 'fov', (v) => `${Math.round(v)}°`),
      toggle('上下反転', st.invertY, (v) => set({ invertY: v })),
      toggle('フライトアシスト', g.state.assist, (v) => { g.state.assist = v; }),
    );
    const audio = h('div', { class: 'set-group' },
      h('div', { class: 'label' }, 'AUDIO'),
      toggle('サウンド', st.audioEnabled, (v) => set({ audioEnabled: v })),
      slider('全体音量', 0, 1, 0.05, st.masterVolume, 'masterVolume', (v) => `${Math.round(v * 100)}%`),
      slider('BGM 音量', 0, 1, 0.05, st.musicVolume, 'musicVolume', (v) => `${Math.round(v * 100)}%`),
      slider('効果音', 0, 1, 0.05, st.effectsVolume, 'effectsVolume', (v) => `${Math.round(v * 100)}%`),
    );
    const keys = h(
      'div',
      { class: 'set-group keys' },
      h('div', { class: 'label' }, 'KEY BINDINGS'),
      ...CONTROLS.map(([k, v]) => h('div', { class: 'kv' }, h('span', { class: 'k key' }, k), h('span', { class: 'v' }, v))),
    );
    const danger = h(
      'div',
      { class: 'set-group' },
      this.btn('セーブデータを削除', () => {
        if (confirm('セーブデータを完全に削除します。よろしいですか?')) {
          g.saves.clear();
          if (g.phase === 'menu') g.enterMenu();
          this.show(this.home());
        }
      }),
    );
    el.append(this.panelShell('設定  SETTINGS', h('div', { class: 'set-grid' }, h('div', {}, this.difficultySelector(()=>this.renderSettings()), gfx, ctl, audio, danger), keys)));
  }

  // --- クリア ---

  private renderComplete(): void {
    const g = this.game;
    const s = g.state;
    const el = this.screens.get('complete')!;
    clear(el);
    el.append(
      h(
        'div',
        { class: 'pause-menu complete' },
        h('div', { class: 'label' }, 'MISSION COMPLETE'),
        h('div', { class: 'panel-title big' }, 'リリオン星系の調査完了'),
        h('p', { class: 'dim' }, 'すべての天体を記録しました。あなたの発見は、人類が星々へ踏み出す次の一歩になるでしょう。'),
        h('div', { class: 'specs' },
          h('div', { class: 'kv' }, h('span', { class: 'k' }, '飛行時間'), h('span', { class: 'v' }, fmtTime(s.playSeconds))),
          h('div', { class: 'kv' }, h('span', { class: 'k' }, '獲得した探査データ'), h('span', { class: 'v' }, fmtNum(s.totalData))),
          h('div', { class: 'kv' }, h('span', { class: 'k' }, '強化回数'), h('span', { class: 'v' }, String(s.upgradesBought))),
        ),
        h('div', { class: 'menu-list' }, this.btn('探索を続ける', () => g.resume(), { primary: true }), this.btn('メインメニューへ', () => g.toMenu())),
      ),
    );
    this.show('complete');
  }
}
