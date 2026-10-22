import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { BODY_BY_ID, BODY_DEFS, STAR_ID } from '../data/starSystem';
import { GameAudio } from '../audio/GameAudio';
import { MISSIONS, type MissionDef } from '../data/missions';
import type { BodyDef, UpgradeId } from '../data/types';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { createPositionTable, updateBodyPositions, updateBodyVelocities } from '../physics/orbits';
import { emptyInput, maybeRebaseOrigin, stepFlight } from '../physics/flight';
import { bankedQuaternion, createAttitude, resetAttitude } from '../physics/attitude';
import { Input, type ActionName } from '../input/Input';
import { AsteroidBelt } from '../render/AsteroidBelt';
import { BodyView, pruneSphereGeos, sunIntensity, type ViewContext } from '../render/BodyView';
import { ChaseCamera } from '../render/ChaseCamera';
import { Sky } from '../render/Sky';
import { ShipModel } from '../render/ShipModel';
import { SpaceDust } from '../render/SpaceDust';
import { SunView } from '../render/SunView';
import { TextureBaker } from '../render/bake';
import {
  AutoQuality,
  QUALITY_LADDER,
  bakeWidthFor,
  startLevelFor,
  type QualityProfile,
} from '../render/quality';
import { resolveSphereCollision, impactDamage, heatDamagePerSecond } from '../systems/collision';
import { advanceMissions, currentMission, missionTarget } from '../systems/missions';
import { beginScan, cancelScan, createScanState, scanRangeFor, stepScan } from '../systems/scan';
import { SaveManager, safeLocalStorage } from '../systems/save';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../systems/settings';
import { computeShipStats, purchaseUpgrade, upgradeCost, type ShipStats } from '../systems/upgrades';
import { Emitter } from './events';
import { createNewState, HULL_MAX, type CameraMode, type GameState } from './state';
import type { HudSnapshot, MarkerInfo, Toast } from './hud';

export type Phase = 'loading' | 'menu' | 'playing' | 'paused';

export type GameEvents = {
  phase: Phase;
  toast: Toast;
  scanned: { def: BodyDef; reward: number };
  mission: { completed: MissionDef[]; reward: number; next: MissionDef | null };
  finished: undefined;
  damage: number;
  purchased: { id: UpgradeId; level: number };
  loading: { progress: number; label: string };
  rebuilding: { progress: number; label: string };
  fatal: { message: string };
};

const SHIP_RADIUS = 5;
const STAR = BODY_BY_ID[STAR_ID];
const BELT = BODY_BY_ID['halcyon'];
const AUTOSAVE_INTERVAL = 15;
/** 太陽の熱ダメージが始まる表面からの距離 [u] */
const HEAT_ZONE = 650;

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _fwd = new Vector3();

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function detectMobile(): boolean {
  try {
    return (
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    );
  } catch {
    return false;
  }
}

/**
 * ゲーム全体のオーケストレーター。
 * 責務: 状態の保持、フレームループ、シミュレーション(物理・衝突・スキャン・ミッション)、
 *       描画オブジェクトの更新、画質制御。DOM の UI は持たず、events と snapshot() で通知する。
 */
export class Game {
  readonly ev = new Emitter<GameEvents>();
  readonly input = new Input();
  readonly audio = new GameAudio();
  readonly saves = new SaveManager(safeLocalStorage());
  readonly isMobile = detectMobile();

  phase: Phase = 'loading';
  state: GameState = createNewState();
  settings: Settings = { ...DEFAULT_SETTINGS };
  stats: ShipStats = computeShipStats(this.state.upgrades);
  /** ポインタロスト起因で一時停止した時刻(Esc キーの二重処理防止用) */
  lastLockLoss = -1e9;
  /** 毎フレーム描画後に呼ばれる(HUD 更新用) */
  afterFrame: (() => void) | null = null;

  private renderer!: WebGLRenderer;
  private scene = new Scene();
  private chase!: ChaseCamera;
  private baker!: TextureBaker;
  private sky = new Sky();
  private sun!: SunView;
  private views = new Map<string, BodyView>();
  private belt!: AsteroidBelt;
  private dust = new SpaceDust();
  private shipModel = new ShipModel();
  private sunLight = new DirectionalLight(0xfff0d8, 3);
  private ambient = new AmbientLight(0x56657f, 1.0);

  private origin = new Vector3();
  private positions = createPositionTable(BODY_DEFS);
  private velocities = createPositionTable(BODY_DEFS);
  private scratch = createPositionTable(BODY_DEFS);
  private refVel = new Vector3();
  private camWorld = new Vector3();
  private flightInput = emptyInput();
  private attitude = createAttitude();
  private displayQuat = new Quaternion();

  private targetId: string | null = null;
  private scan = createScanState();
  private boostLocked = false;
  private boost01 = 0;
  private relSpeed = 0;
  private thrustLevel = 0;
  private sinceDamage = 99;
  private autosaveTimer = 0;
  private warning: string | null = null;
  private nearest: { name: string; altitude: number } | null = null;

  private profile: QualityProfile = QUALITY_LADDER[3];
  private auto: AutoQuality | null = null;
  private bakeWidth = 1024;
  private fps = 60;

  private raf = 0;
  private lastT = 0;
  private running = false;
  private canvas!: HTMLCanvasElement;
  private cleanup: (() => void)[] = [];
  private menuClock = 0;
  /** メニューに表示中の状態がセーブデータ由来か(探査記録・アップグレードを開ける) */
  menuHasSave = false;
  private errorStreak = 0;
  private contextLost = false;
  private textureTask: Promise<void> = Promise.resolve();
  private bakeRevision = 0;
  private disposed = false;

  // ---------------------------------------------------------------- 起動

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.settings = loadSettings(safeLocalStorage());

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: !this.isMobile,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch {
      throw new Error('WebGL を初期化できませんでした。ブラウザのハードウェアアクセラレーションが有効か確認してください。');
    }
    this.renderer = renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(new Color(0x000000), 1);

    this.chase = new ChaseCamera(window.innerWidth / Math.max(1, window.innerHeight));
    this.chase.baseFov = this.settings.fov;

    this.baker = new TextureBaker(renderer);
    this.bakeWidth = bakeWidthFor(this.settings.quality, this.isMobile);
    const level = startLevelFor(this.settings.quality, this.isMobile);
    this.profile = QUALITY_LADDER[level];
    this.auto = this.settings.quality === 'auto' ? new AutoQuality(level, this.isMobile ? 30 : 58) : null;

    // --- シーン構築(重いテクスチャのベイクはフレームをまたいで分散し、進捗を通知) ---
    this.scene.add(this.sky.group, this.dust.object, this.shipModel.group, this.sunLight, this.ambient);
    this.scene.add(this.sunLight.target);
    this.ev.emit('loading', { progress: 0.05, label: '宇宙を生成しています' });
    await nextFrame();
    await this.sky.bakeAsync(this.baker, this.isMobile ? 1024 : 2048,
      (fraction) => this.ev.emit('loading', { progress: 0.05 + fraction * 0.1, label: '星空を生成中' }));

    this.sun = new SunView(STAR, this.profile);
    this.scene.add(this.sun.group);

    this.belt = new AsteroidBelt(BELT.belt!, BELT.belt!.count);
    this.scene.add(this.belt.group);

    const bodies = BODY_DEFS.filter((d) => d.kind !== 'star' && d.kind !== 'belt');
    for (let i = 0; i < bodies.length; i++) {
      const d = bodies[i];
      this.ev.emit('loading', { progress: 0.15 + (0.8 * i) / bodies.length, label: `${d.nameJa} を生成中` });
      await nextFrame();
      const v = new BodyView(d);
      v.build(this.baker, this.bakeWidth, this.profile, true);
      await v.rebakeAsync(this.baker, this.bakeWidth,
        (fraction) => this.ev.emit('loading', { progress: 0.15 + (0.8 * (i + fraction)) / bodies.length, label: `${d.nameJa} を生成中` }));
      this.views.set(d.id, v);
      this.scene.add(v.group);
    }

    this.input.attach(canvas);
    this.input.onLockChange = (locked) => {
      if (!locked && this.phase === 'playing') {
        this.lastLockLoss = performance.now();
        this.pause();
      }
    };
    this.applySettings(this.settings, true);
    this.applyProfile(this.profile);
    this.resize();
    this.bindWindowEvents();

    this.enterMenu();
    this.ev.emit('loading', { progress: 1, label: '準備完了' });
    this.start();
  }

  private bindWindowEvents(): void {
    const on = <T extends EventTarget>(t: T, name: string, fn: EventListener) => {
      t.addEventListener(name, fn);
      this.cleanup.push(() => t.removeEventListener(name, fn));
    };
    on(window, 'resize', () => this.resize());
    on(window, 'pointerdown', () => this.audio.unlock());
    on(window, 'keydown', () => this.audio.unlock());
    this.cleanup.push(
      this.ev.on('scanned', () => this.audio.cue('scan')),
      this.ev.on('purchased', () => this.audio.cue('upgrade')),
      this.ev.on('mission', () => this.audio.cue('mission')),
      this.ev.on('damage', () => this.audio.cue('damage')),
    );
    on(document, 'visibilitychange', () => {
      if (document.hidden) {
        // 非表示の間は描画ループを止めて負荷を 0 にする。プレイ中なら一時停止してセーブする
        this.stop();
        if (this.phase === 'playing') this.pause();
        else this.saveNow();
      } else {
        this.start();
      }
    });
    on(window, 'pagehide', () => this.saveNow());
    on(window, 'beforeunload', () => this.saveNow());
    on(this.canvas, 'webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.ev.emit('toast', { kind: 'warn', title: 'グラフィックスが一時的に失われました', text: '復帰を待っています…' });
    });
    on(this.canvas, 'webglcontextrestored', () => {
      // ベイク済みテクスチャは GPU 側で失われるので再生成する
      void this.rebakeAll().then(() => {
        this.contextLost = false;
        this.ev.emit('toast', { kind: 'info', title: 'グラフィックスが復帰しました' });
      });
    });
  }

  // ---------------------------------------------------------------- ループ

  start(): void {
    if (this.running || !this.renderer) return;
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(now: number): void {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const rawDt = Math.max(0, (now - this.lastT) / 1000);
    this.lastT = now;
    if (this.contextLost) return;
    try {
      this.tick(rawDt);
      this.errorStreak = 0;
    } catch (e) {
      console.error('[LYRION] frame error', e);
      if (++this.errorStreak === 30) {
        this.stop();
        this.ev.emit('fatal', { message: '描画中にエラーが繰り返し発生したため停止しました。ページを再読み込みしてください。' });
      }
    }
  }

  /** 1 フレーム。dt はシミュレーション用に上限を設ける(タブ復帰などでの大ジャンプ防止) */
  tick(rawDt: number): void {
    const dt = Math.min(rawDt, 0.05);
    if (rawDt > 0) this.fps += (1 / Math.max(rawDt, 1e-3) - this.fps) * 0.08;

    if (this.phase === 'playing') this.simulate(dt);
    else if (this.phase === 'menu' || this.phase === 'paused') this.idle(dt);

    this.updateAutoQuality(rawDt);
    this.render(dt);
  }

  // ---------------------------------------------------------------- フェーズ

  private setPhase(p: Phase): void {
    this.phase = p;
    this.audio.setActive(p === 'playing');
    this.input.enabled = p === 'playing';
    if (p !== 'playing') this.input.reset();
    this.ev.emit('phase', p);
  }

  /** メインメニュー: セーブ(なければ新規)の状態を背景に表示する */
  enterMenu(): void {
    resetAttitude(this.attitude);
    this.input.releaseLock();
    cancelScan(this.scan);
    const saved = this.saves.load();
    this.menuHasSave = saved !== null;
    this.state = saved ?? createNewState();
    this.stats = computeShipStats(this.state.upgrades);
    this.menuClock = 0;
    this.targetId = null;
    this.chase.snap();
    this.setPhase('menu');
  }

  startNew(): void {
    this.saves.clear();
    this.begin(createNewState());
  }

  continueGame(): boolean {
    const s = this.saves.load();
    if (!s) return false;
    this.begin(s);
    return true;
  }

  private begin(s: GameState): void {
    resetAttitude(this.attitude);
    this.state = s;
    this.stats = computeShipStats(s.upgrades);
    s.energy = Math.min(s.energy, this.stats.energyMax);
    s.vel.multiplyScalar(0.5);
    this.origin.copy(s.pos);
    this.refVel.set(0, 0, 0);
    this.boostLocked = false;
    this.boost01 = 0;
    cancelScan(this.scan);
    this.syncMissionTarget();
    this.autosaveTimer = 0;
    this.chase.snap();
    this.setPhase('playing');
    this.input.requestLock(this.canvas);
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    cancelScan(this.scan);
    this.saveNow();
    this.input.releaseLock();
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.setPhase('playing');
    this.input.requestLock(this.canvas);
  }

  toMenu(): void {
    if (this.phase === 'playing' || this.phase === 'paused') this.saveNow();
    this.enterMenu();
  }

  saveNow(): boolean {
    const ok = this.phase === 'playing' || this.phase === 'paused' || (this.phase === 'menu' && this.menuHasSave);
    if (!ok) return false;
    return this.saves.save(this.state);
  }

  /** プレイ中の 1 回押し操作(スキャン・ターゲット・視点・アシスト)。UI 系の操作は含まない */
  handlePlayAction(a: ActionName): void {
    // pause / upgrades / log は UI が処理する。ここではプレイ中の操作のみ扱う
    if (this.phase !== 'playing') return;
    switch (a) {
      case 'scan':
        this.toggleScan();
        break;
      case 'target':
        this.cycleTarget();
        break;
      case 'camera':
        this.setCameraMode(this.state.cameraMode === 'third' ? 'first' : 'third');
        break;
      case 'assist':
        this.setAssist(!this.state.assist);
        break;
      default:
        break; // pause / upgrades / log は UI が処理
    }
  }

  // ---------------------------------------------------------------- 操作系 API

  setCameraMode(m: CameraMode): void {
    this.state.cameraMode = m;
  }

  setAssist(on: boolean): void {
    this.state.assist = on;
    this.ev.emit('toast', { kind: 'info', title: `フライトアシスト ${on ? 'ON' : 'OFF'}` });
  }

  cycleTarget(): void {
    const list = BODY_DEFS.filter((d) => this.state.detected.has(d.id));
    if (!list.length) return;
    const i = list.findIndex((d) => d.id === this.targetId);
    this.targetId = list[(i + 1) % list.length].id;
  }

  setTarget(id: string | null): void {
    this.targetId = id;
  }

  toggleScan(): void {
    if (this.scan.id) {
      cancelScan(this.scan);
      this.ev.emit('toast', { kind: 'info', title: 'スキャンを中断しました' });
      return;
    }
    const def = this.targetId ? BODY_BY_ID[this.targetId] : null;
    if (!def) {
      this.ev.emit('toast', { kind: 'warn', title: 'ターゲットがありません', text: 'Tab で天体を選択してください' });
      return;
    }
    if (this.state.scanned.has(def.id)) {
      this.ev.emit('toast', { kind: 'info', title: `${def.nameJa} はスキャン済みです` });
      return;
    }
    const range = scanRangeFor(def, this.stats.scanRange);
    const d = this.surfaceDistance(def);
    if (d > range) {
      this.ev.emit('toast', {
        kind: 'warn',
        title: 'スキャン範囲外です',
        text: `あと ${Math.ceil(d - range)} u 接近してください`,
      });
      return;
    }
    beginScan(this.scan, def.id);
  }

  buyUpgrade(id: UpgradeId): boolean {
    const s = this.state;
    const r = purchaseUpgrade(id, s.upgrades, s.data);
    if (!r.ok) return false;
    s.data = r.data;
    s.upgradesBought++;
    this.stats = computeShipStats(s.upgrades);
    s.energy = Math.min(this.stats.energyMax, s.energy + 25);
    this.ev.emit('purchased', { id, level: r.newLevel });
    this.ev.emit('toast', { kind: 'reward', title: `${UPGRADE_BY_ID[id].name} Lv.${r.newLevel}`, text: `-${r.cost} DATA` });
    this.checkMissions();
    this.saveNow();
    return true;
  }

  upgradeCostFor(id: UpgradeId): number | null {
    return upgradeCost(id, this.state.upgrades[id]);
  }

  // ---------------------------------------------------------------- 設定・画質

  applySettings(s: Settings, silent = false): void {
    const prevQuality = this.settings.quality;
    this.settings = s;
    this.audio.configure(s);
    this.input.settings.sensitivity = s.sensitivity;
    this.input.settings.invertY = s.invertY;
    this.chase.baseFov = s.fov;
    saveSettings(safeLocalStorage(), s);
    if (silent || s.quality === prevQuality) return;

    // 画質の切り替え
    const level = startLevelFor(s.quality, this.isMobile);
    this.auto = s.quality === 'auto' ? new AutoQuality(level, this.isMobile ? 30 : 58) : null;
    const newBake = bakeWidthFor(s.quality, this.isMobile);
    this.applyProfile(QUALITY_LADDER[level]);
    if (newBake !== this.bakeWidth) {
      this.bakeWidth = newBake;
      this.rebakeAll();
    }
  }

  private updateAutoQuality(rawDt: number): void {
    if (!this.auto || this.phase === 'loading') return;
    const next = this.auto.update(rawDt);
    if (next !== null) this.applyProfile(QUALITY_LADDER[next]);
  }

  /** 画質プロファイルを描画系へ反映する(解像度・星・小惑星・塵・分割数・雲・バンプ) */
  applyProfile(p: QualityProfile): void {
    const prev = this.profile;
    this.profile = p;
    this.updateRendererSize();
    this.sky.setStarCount(p.stars);
    this.belt.setCount(Math.min(p.belt, BELT.belt!.count));
    this.dust.setCount(p.dust);
    this.sun.applyProfile(p);
    for (const v of this.views.values()) v.applyProfile(p);
    // 使われなくなった分割数のジオメトリを破棄
    pruneSphereGeos([48, ...new Set([p, prev].flatMap((q) => q.segments))]);
    // 再度必要になるジオメトリは sphereGeo() が再生成する
  }

  get qualityLabel(): string {
    const s = this.settings.quality;
    return s === 'auto' ? `AUTO (${this.profile.label})` : s.toUpperCase();
  }

  get currentProfile(): QualityProfile {
    return this.profile;
  }

  get glareEnabled(): boolean {
    return this.profile.glare;
  }

  get texturesReady(): Promise<void> {
    return this.textureTask;
  }

  private rebakeAll(): Promise<void> {
    const revision = ++this.bakeRevision;
    const width = this.bakeWidth;
    this.textureTask = this.textureTask.then(async () => {
      if (revision !== this.bakeRevision || this.disposed) return;
      const total = this.views.size + 1;
      this.ev.emit('rebuilding', { progress: 0, label: '星空を更新中' });
      await this.sky.bakeAsync(this.baker, this.isMobile ? 1024 : 2048);
      let done = 1;
      for (const v of this.views.values()) {
        if (revision !== this.bakeRevision || this.disposed) return;
        await v.rebakeAsync(this.baker, width, (fraction) => {
          this.ev.emit('rebuilding', { progress: (done + fraction) / total, label: `${v.def.nameJa} を更新中` });
        });
        done++;
      }
      this.ev.emit('rebuilding', { progress: 1, label: '画質を更新しました' });
    }).catch((error: unknown) => {
      console.error('[LYRION] texture rebuild', error);
      this.ev.emit('fatal', { message: 'テクスチャを再生成できませんでした。ページを再読み込みしてください。' });
    });
    return this.textureTask;
  }

  private resize(): void {
    if (!this.renderer) return;
    this.chase.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
    this.updateRendererSize();
  }

  private updateRendererSize(): void {
    const p = this.profile;
    const dpr = Math.min(window.devicePixelRatio || 1, p.maxDpr) * p.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.sky.setPixelScale(Math.max(0.6, dpr));
  }

  // ---------------------------------------------------------------- シミュレーション

  private updateBodies(time: number): void {
    updateBodyPositions(BODY_DEFS, time, this.positions);
    updateBodyVelocities(BODY_DEFS, time, this.positions, this.scratch, this.velocities);
  }

  /** メニュー/一時停止中: 時間だけゆっくり進め、背景の船を漂わせる */
  private idle(dt: number): void {
    // メニュー中は状態(時間・位置)を変更しない。見た目の時間だけを進める(visualTime)
    if (this.phase === 'menu') this.menuClock += dt;
    this.updateBodies(this.state.time);
    this.thrustLevel += (0.12 - this.thrustLevel) * 0.1;
    this.boost01 += (0 - this.boost01) * 0.1;
  }

  private surfaceDistance(def: BodyDef): number {
    if (def.kind === 'belt' && def.belt) {
      const p = this.state.pos;
      const r = Math.hypot(p.x, p.z);
      const dr = r < def.belt.inner ? def.belt.inner - r : r > def.belt.outer ? r - def.belt.outer : 0;
      const dy = Math.max(0, Math.abs(p.y) - def.belt.halfThickness);
      return Math.hypot(dr, dy);
    }
    return this.state.pos.distanceTo(this.positions[def.id]) - def.radius;
  }

  private simulate(dt: number): void {
    const s = this.state;
    s.time += dt;
    s.playSeconds += dt;
    this.updateBodies(s.time);

    // --- 入力と飛行 ---
    const input = this.input.poll(dt, this.flightInput);
    this.updateReferenceFrame(dt);

    if (s.energy <= 0.5) this.boostLocked = true;
    else if (s.energy > this.stats.energyMax * 0.15) this.boostLocked = false;
    const wantBoost = input.boost && !this.boostLocked && s.energy > 0;
    input.boost = wantBoost;
    const res = stepFlight(s, input, this.stats, s.assist, this.refVel, wantBoost, dt, this.attitude);

    if (res.boosting) s.energy = Math.max(0, s.energy - this.stats.boostDrain * dt);
    else s.energy = Math.min(this.stats.energyMax, s.energy + this.stats.energyRegen * dt);
    this.boost01 += ((res.boosting ? 1 : 0) - this.boost01) * (1 - Math.exp(-dt * 4));
    this.relSpeed = res.relSpeed;
    const thrustTarget = res.boosting ? 1 : Math.abs(input.thrust) * 0.7;
    this.thrustLevel += (Math.min(1, thrustTarget) - this.thrustLevel) * (1 - Math.exp(-dt * 8));
    this.audio.update(dt, this.thrustLevel, this.boost01, this.scan.id !== null);

    // --- 衝突・熱 ---
    this.sinceDamage += dt;
    this.collide(dt);

    // --- 探知・スキャン・ターゲット ---
    this.detect();
    this.updateScan(dt);

    // --- 船体の自然回復(被弾後しばらく経ってから)---
    if (this.sinceDamage > 6 && s.hull < HULL_MAX) s.hull = Math.min(HULL_MAX, s.hull + 0.4 * dt);

    // --- オートセーブ ---
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
      this.autosaveTimer = 0;
      this.saves.save(s);
    }

    this.updateNearest();
  }

  /** 近くの天体の速度を基準系にする(公転する天体のそばで停止できるように) */
  private updateReferenceFrame(dt: number): void {
    const p = this.state.pos;
    let best: BodyDef | null = null;
    let bestD = Infinity;
    for (const d of BODY_DEFS) {
      if (d.kind === 'star' || d.kind === 'belt') continue;
      const sd = p.distanceTo(this.positions[d.id]) - d.radius;
      if (sd < d.radius * 10 + 900 && sd < bestD) {
        bestD = sd;
        best = d;
      }
    }
    _v1.set(0, 0, 0);
    if (best) _v1.copy(this.velocities[best.id]);
    this.refVel.lerp(_v1, 1 - Math.exp(-dt * 2.5));
  }

  private updateNearest(): void {
    const p = this.state.pos;
    let best: BodyDef | null = null;
    let bestD = Infinity;
    for (const d of BODY_DEFS) {
      if (d.kind === 'belt') continue;
      const sd = p.distanceTo(this.positions[d.id]) - d.radius;
      if (sd < bestD) {
        bestD = sd;
        best = d;
      }
    }
    this.nearest = best ? { name: best.nameJa, altitude: Math.max(0, bestD) } : null;

    // 警告表示
    const s = this.state;
    const sunSd = p.length() - STAR.radius;
    if (sunSd < HEAT_ZONE) this.warning = '恒星に接近しすぎています — 船体が高温になっています';
    else if (s.hull < 30) this.warning = '船体の損傷が深刻です';
    else if (this.boostLocked && s.energy < 1) this.warning = 'エネルギー枯渇 — ブースト不可';
    else this.warning = null;
  }

  private collide(dt: number): void {
    const s = this.state;
    let worst = 0;

    for (const d of BODY_DEFS) {
      if (d.radius <= 0) continue;
      const r = resolveSphereCollision(s.pos, s.vel, this.positions[d.id], this.velocities[d.id], d.radius, SHIP_RADIUS);
      if (r.hit) worst = Math.max(worst, r.impact);
    }

    // 小惑星帯(帯の中にいるときだけ判定)
    const bd = BELT.belt!;
    const rr = Math.hypot(s.pos.x, s.pos.z);
    if (rr > bd.inner - 120 && rr < bd.outer + 120 && Math.abs(s.pos.y) < bd.halfThickness + 120) {
      const omega = (Math.PI * 2) / bd.period;
      const n = this.belt.count;
      for (let i = 0; i < n; i++) {
        const k = this.belt.rocks[i];
        this.belt.rockWorld(i, _v1);
        const dx = s.pos.x - _v1.x;
        if (dx > k.r + 40 || dx < -k.r - 40) continue;
        const rad = k.r + SHIP_RADIUS;
        const dz = s.pos.z - _v1.z;
        const dy = s.pos.y - _v1.y;
        if (dx * dx + dy * dy + dz * dz >= rad * rad) continue;
        _v2.set(_v1.z * omega, 0, -_v1.x * omega); // 岩の速度(帯の回転)
        const r = resolveSphereCollision(s.pos, s.vel, _v1, _v2, k.r, SHIP_RADIUS, 0.4);
        if (r.hit) worst = Math.max(worst, r.impact);
      }
    }

    if (worst > 0) {
      const dmg = impactDamage(worst);
      if (dmg > 0) this.damageHull(dmg, worst);
    }

    // 恒星の熱
    const heat = heatDamagePerSecond(s.pos.length() - STAR.radius, HEAT_ZONE);
    if (heat > 0) {
      this.damageHull(heat * dt, 0, true);
    }
  }

  private damageHull(amount: number, impact: number, continuous = false): void {
    const s = this.state;
    s.hull = Math.max(0, s.hull - amount);
    this.sinceDamage = 0;
    if (!continuous) this.ev.emit('damage', Math.min(1, impact / 120));
    else if (Math.random() < 0.08) this.ev.emit('damage', 0.25);
    if (s.hull <= 0) this.emergencyRescue();
  }

  /**
   * 船体が限界に達したときの緊急回収。進行不能を避けるため、最寄りの惑星・衛星の
   * 安全な距離へ再配置し、船体を修復する(探査データなどの進行状況は失わない)。
   */
  private emergencyRescue(): void {
    const s = this.state;
    let best: BodyDef | null = null;
    let bestD = Infinity;
    for (const d of BODY_DEFS) {
      if (d.kind !== 'planet' && d.kind !== 'moon') continue;
      const sd = s.pos.distanceTo(this.positions[d.id]) - d.radius;
      if (sd < bestD) {
        bestD = sd;
        best = d;
      }
    }
    if (best) {
      const c = this.positions[best.id];
      // 恒星に照らされた側(昼側)の、天体半径の約 3 倍 + 500u の位置へ再配置する
      _v3.copy(c).negate();
      if (_v3.lengthSq() < 1) _v3.set(1, 0, 0);
      _v3.normalize().multiplyScalar(best.radius * 3 + 500);
      s.pos.copy(c).add(_v3);
      s.vel.copy(this.velocities[best.id]);
      // 惑星の方を向く
      _v1.copy(c).sub(s.pos).normalize();
      s.quat.setFromUnitVectors(_fwd.set(0, 0, -1), _v1);
    } else {
      s.vel.set(0, 0, 0);
    }
    s.hull = 60;
    resetAttitude(this.attitude);
    s.energy = this.stats.energyMax;
    this.chase.snap();
    this.origin.copy(s.pos);
    cancelScan(this.scan);
    this.ev.emit('toast', { kind: 'warn', title: '緊急回収システムが作動', text: '船体を修復し、安全な位置へ移動しました' });
  }

  private detect(): void {
    const s = this.state;
    for (const d of BODY_DEFS) {
      if (s.detected.has(d.id)) continue;
      if (this.surfaceDistance(d) < d.detectRange) {
        s.detected.add(d.id);
        this.ev.emit('toast', { kind: 'discover', title: '新しい天体を探知', text: `${d.nameJa} — ${d.classLabel}` });
      }
    }
  }

  private updateScan(dt: number): void {
    const s = this.state;
    if (!this.scan.id) return;
    const def = BODY_BY_ID[this.scan.id] ?? null;
    const inRange = def ? this.surfaceDistance(def) <= scanRangeFor(def, this.stats.scanRange) : false;
    const id = this.scan.id;
    const phase = stepScan(this.scan, dt, def, inRange, this.targetId);
    if (phase === 'cancelled') {
      this.ev.emit('toast', { kind: 'warn', title: 'スキャンが中断されました', text: '範囲内に留まり、ターゲットを維持してください' });
    } else if (phase === 'done' && def) {
      s.scanned.set(id, s.time);
      s.data += def.scanReward;
      s.totalData += def.scanReward;
      this.ev.emit('scanned', { def, reward: def.scanReward });
      this.checkMissions();
      this.saveNow();
    }
  }

  // ---------------------------------------------------------------- ミッション

  private missionCtx() {
    return { scanned: new Set(this.state.scanned.keys()), upgradesBought: this.state.upgradesBought, missionIndex: this.state.missionIndex };
  }

  private checkMissions(): void {
    const s = this.state;
    const adv = advanceMissions(this.missionCtx());
    if (!adv.completed.length) return;
    s.missionIndex = adv.newIndex;
    s.data += adv.reward;
    s.totalData += adv.reward;
    const next = currentMission(s.missionIndex);
    this.ev.emit('mission', { completed: adv.completed, reward: adv.reward, next });
    this.syncMissionTarget();
    if (!next) this.ev.emit('finished', undefined);
  }

  /** ミッションが変わったら、誘導先を自動でターゲットにする */
  private syncMissionTarget(): void {
    const t = missionTarget(this.missionCtx());
    if (t) this.targetId = t;
  }

  // ---------------------------------------------------------------- 描画

  private render(dt: number): void {
    const s = this.state;
    const camera = this.chase.camera;
    bankedQuaternion(s.quat, this.attitude.bank, this.displayQuat);
    const playing = this.phase === 'playing';
    const visualTime = s.time + (this.phase === 'menu' ? this.menuClock * 6 : 0);

    // Floating Origin: 船が原点から離れたら原点を移し替える(描画座標は常に原点付近)
    maybeRebaseOrigin(this.origin, s.pos, 1200);

    // カメラ
    if (this.phase === 'menu') {
      const t = this.menuClock;
      // メニュー背景: 船の斜め後方から、ゆっくり旋回するシネマティックなカメラ
      _v1.set(Math.sin(t * 0.07) * 22, 6 + Math.sin(t * 0.11) * 3, 20 + Math.cos(t * 0.07) * 6).applyQuaternion(s.quat);
      this.camWorld.copy(s.pos).add(_v1);
      camera.position.copy(this.camWorld).sub(this.origin);
      _v2.copy(s.pos).addScaledVector(_fwd.set(0, 0, -1).applyQuaternion(s.quat), 90).sub(this.origin);
      camera.up.set(0, 1, 0);
      camera.lookAt(_v2);
    } else {
      const speedFrac = this.relSpeed / this.stats.maxSpeed;
      this.chase.update(dt, s.pos, this.displayQuat, s.cameraMode, speedFrac, this.boost01, this.camWorld, this.attitude.bank);
      camera.position.copy(this.camWorld).sub(this.origin);
    }
    camera.updateMatrixWorld();

    // 船
    this.shipModel.group.position.copy(s.pos).sub(this.origin);
    this.shipModel.group.quaternion.copy(this.displayQuat);
    this.shipModel.setThrust(this.thrustLevel, this.boost01 > 0.5);
    this.shipModel.setSteering(this.attitude.yawRate, this.attitude.pitchRate);
    this.shipModel.setHullVisible(this.phase === 'menu' || this.chase.firstPersonAmount < 0.85);

    // 恒星
    this.sun.update(this.positions[STAR_ID], this.origin, camera, visualTime);
    const sunPos = this.sun.group.position;

    // ライト(恒星方向)。船・小惑星に当たる
    _v1.copy(sunPos).sub(this.shipModel.group.position);
    const sunDist = _v1.length();
    _v1.multiplyScalar(1 / Math.max(sunDist, 1e-3));
    this.sunLight.position.copy(_v1).multiplyScalar(100);
    this.sunLight.intensity = sunIntensity(sunDist) * 1.1;

    const ctx: ViewContext = { origin: this.origin, camera, sunPos, time: visualTime, profile: this.profile };
    for (const [id, v] of this.views) v.update(ctx, this.positions[id]);

    this.belt.update(visualTime, this.origin);
    this.belt.group.visible = this.profile.belt > 0;

    this.sky.update(camera);
    const velScene = s.vel;
    this.dust.update(s.pos, velScene, camera.position, Math.max(0, this.relSpeed));
    this.dust.object.visible = playing;

    this.renderer.render(this.scene, camera);
    this.afterFrame?.();
  }

  // ---------------------------------------------------------------- HUD 用スナップショット

  private project(world: Vector3, out: { x: number; y: number; behind: boolean }): void {
    const camera = this.chase.camera;
    _v3.copy(world).sub(this.origin).project(camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    out.behind = _v3.z > 1;
    let nx = _v3.x;
    let ny = _v3.y;
    if (out.behind) {
      nx = -nx;
      ny = -ny;
    }
    out.x = (nx * 0.5 + 0.5) * w;
    out.y = (-ny * 0.5 + 0.5) * h;
  }

  private marker(kind: 'target' | 'guide', id: string): MarkerInfo | null {
    const def = BODY_BY_ID[id];
    if (!def) return null;
    const s = this.state;
    const target = _v2;
    if (def.kind === 'belt' && def.belt) {
      const r = Math.hypot(s.pos.x, s.pos.z) || 1;
      const mid = (def.belt.inner + def.belt.outer) / 2;
      target.set((s.pos.x / r) * mid, 0, (s.pos.z / r) * mid);
    } else {
      target.copy(this.positions[id]);
    }
    const tmp = { x: 0, y: 0, behind: false };
    this.project(target, tmp);
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 画面端のマーカーが HUD(上部・下部)と重ならないよう、上下に余白を多めに取る
    const mx = 70;
    const mt = 90;
    const mb = 150;
    const onScreen = !tmp.behind && tmp.x > mx && tmp.x < w - mx && tmp.y > mt && tmp.y < h - mb;
    const cx = w / 2;
    const cy = h / 2;
    const angle = Math.atan2(tmp.y - cy, tmp.x - cx);
    let x = tmp.x;
    let y = tmp.y;
    if (!onScreen) {
      // 画面端にクランプ(中心から外向きに)
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const ky = dy > 0 ? h / 2 - mb : h / 2 - mt;
      const k = Math.min((w / 2 - mx) / Math.max(Math.abs(dx), 1e-4), ky / Math.max(Math.abs(dy), 1e-4));
      x = cx + dx * k;
      y = cy + dy * k;
    }
    const dist = Math.max(0, this.surfaceDistance(def));
    const detected = s.detected.has(id);
    return {
      kind,
      id,
      label: detected ? def.nameJa : '未知の信号',
      dist,
      x,
      y,
      onScreen,
      angle,
      unknown: !detected,
      scanned: s.scanned.has(id),
    };
  }

  /** 太陽の画面位置とグレアの強さ(遮蔽物があれば消す) */
  private sunGlare(): { x: number; y: number; opacity: number } | null {
    if (!this.profile.glare) return null;
    const cam = this.camWorld;
    const sunW = this.positions[STAR_ID];
    const tmp = { x: 0, y: 0, behind: false };
    this.project(sunW, tmp);
    if (tmp.behind) return null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (tmp.x < -w * 0.3 || tmp.x > w * 1.3 || tmp.y < -h * 0.3 || tmp.y > h * 1.3) return null;
    // 遮蔽判定(惑星・衛星が太陽との間にあるか)
    _v1.copy(sunW).sub(cam);
    const len = _v1.length();
    _v1.multiplyScalar(1 / len);
    for (const d of BODY_DEFS) {
      if (d.kind !== 'planet' && d.kind !== 'moon') continue;
      _v2.copy(this.positions[d.id]).sub(cam);
      const t = _v2.dot(_v1);
      if (t <= 0 || t >= len) continue;
      const perp2 = _v2.lengthSq() - t * t;
      if (perp2 < d.radius * d.radius * 1.02) return null;
    }
    const edge = Math.max(Math.abs(tmp.x / w - 0.5), Math.abs(tmp.y / h - 0.5)) * 2; // 0 中心 〜 1 端
    const near = Math.min(1, Math.max(0.35, 6500 / Math.max(len, 1)));
    return { x: tmp.x, y: tmp.y, opacity: Math.max(0, 1 - edge * 0.8) * near };
  }

  snapshot(): HudSnapshot {
    const s = this.state;
    const mission = currentMission(s.missionIndex);
    const def = this.targetId ? BODY_BY_ID[this.targetId] : null;
    const markers: MarkerInfo[] = [];
    let target: HudSnapshot['target'] = null;

    if (def && this.phase !== 'menu') {
      const m = this.marker('target', def.id);
      if (m) markers.push(m);
      const dist = this.surfaceDistance(def);
      const range = scanRangeFor(def, this.stats.scanRange);
      target = {
        def,
        dist: Math.max(0, dist),
        range,
        inRange: dist <= range,
        scanned: s.scanned.has(def.id),
        scanning: this.scan.id === def.id,
        progress: this.scan.id === def.id ? this.scan.progress : 0,
      };
    }
    if (mission && this.phase !== 'menu') {
      const gid = missionTarget(this.missionCtx());
      if (gid && gid !== this.targetId) {
        const m = this.marker('guide', gid);
        if (m) markers.push(m);
      }
    }

    // 方位(黄道面での向き)とピッチ
    _fwd.set(0, 0, -1).applyQuaternion(s.quat);
    const heading = ((Math.atan2(_fwd.x, -_fwd.z) * 180) / Math.PI + 360) % 360;
    const pitch = (Math.asin(Math.max(-1, Math.min(1, _fwd.y))) * 180) / Math.PI;

    return {
      speed: this.relSpeed,
      speedFrac: this.relSpeed / this.stats.maxSpeed,
      boosting: this.boost01 > 0.5,
      hull: s.hull,
      hullMax: HULL_MAX,
      energy: s.energy,
      energyMax: this.stats.energyMax,
      data: s.data,
      assist: s.assist,
      camera: s.cameraMode,
      locked: this.input.locked || this.input.touchMode,
      mission: mission
        ? { title: mission.title, objective: mission.objective, hint: mission.hint, index: s.missionIndex, total: MISSIONS.length }
        : null,
      target,
      markers,
      sun: this.phase === 'playing' ? this.sunGlare() : null,
      heading,
      pitch,
      fps: this.fps,
      qualityLabel: this.qualityLabel,
      nearest: this.nearest,
      warning: this.warning,
    };
  }

  // ---------------------------------------------------------------- 破棄・デバッグ

  /** デバッグ・検証用: 天体の近くへ移動する(通常プレイでは使わない) */
  debugTeleport(id: string, surfaceDistance: number): void {
    resetAttitude(this.attitude);
    const d = BODY_BY_ID[id];
    if (!d) return;
    this.updateBodies(this.state.time);
    if (d.kind === 'belt' && d.belt) {
      this.state.pos.set((d.belt.inner + d.belt.outer) / 2, d.belt.halfThickness + surfaceDistance, 0);
      this.state.vel.set(0, 0, 0);
      this.state.quat.setFromUnitVectors(_fwd.set(0, 0, -1), _v1.set(0, -1, 0));
      this.origin.copy(this.state.pos);
      this.chase.snap();
      return;
    }
    const c = this.positions[id];
    _v1.copy(c).negate();
    if (_v1.lengthSq() < 1) _v1.set(1, 0, 0);
    _v1.normalize(); // 恒星方向
    // 恒星と天体の間(昼側)に、やや斜めから配置
    _v2.set(-_v1.z, 0.25, _v1.x).normalize();
    this.state.pos.copy(c).addScaledVector(_v1, d.radius + surfaceDistance).addScaledVector(_v2, (d.radius + surfaceDistance) * 0.35);
    this.state.vel.copy(this.velocities[id]);
    this.state.quat.setFromUnitVectors(_fwd.set(0, 0, -1), _v3.copy(c).sub(this.state.pos).normalize());
    this.origin.copy(this.state.pos);
    this.chase.snap();
  }

  get rendererInfo() {
    return this.renderer.info;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bakeRevision++;
    this.stop();
    void this.textureTask.then(() => this.disposeResources());
  }

  private disposeResources(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
    this.input.dispose();
    this.audio.dispose();
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.sun.dispose();
    this.belt.dispose();
    this.sky.dispose();
    this.dust.dispose();
    this.shipModel.dispose();
    this.baker.dispose();
    pruneSphereGeos([]);
    this.renderer.dispose();
  }
}
