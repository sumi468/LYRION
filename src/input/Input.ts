import { emptyInput, type FlightInput } from '../physics/flight';
import type { EvaInput } from '../systems/eva';

/** 1回押すごとに発火する操作 */
export type ActionName = 'scan' | 'target' | 'camera' | 'assist' | 'upgrades' | 'log' | 'pause' | 'land' | 'dodge' | 'dock' | 'eva' | 'investigate' | 'return' | 'operations';

const ACTION_KEYS: Record<string, ActionName> = {
  KeyT: 'dock', KeyH: 'eva', KeyY: 'return', KeyB: 'operations',
  KeyR: 'scan',
  KeyG: 'land',
  KeyV: 'dodge',
  Tab: 'target',
  KeyC: 'camera',
  KeyZ: 'assist',
  KeyU: 'upgrades',
  KeyL: 'log',
  KeyP: 'pause',
  Escape: 'pause',
};

/** ブラウザ標準動作と競合するキー(プレイ中のみ preventDefault) */
const PREVENT = new Set([
  'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyX', 'KeyR', 'KeyC', 'KeyZ',
  'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyG', 'KeyV', 'KeyT', 'KeyH', 'KeyY', 'KeyB',
]);

export interface InputSettings {
  sensitivity: number;
  invertY: boolean;
}

/**
 * キーボード・マウス入力。Pointer Lock が使えない/拒否された場合は矢印キーで視点操作できる。
 * DOM イベントはここだけで扱い、ゲーム側は poll() と onAction だけを見る。
 */
export class Input {
  readonly keys = new Set<string>();
  /** プレイ中のみ true。false の間はゲーム入力を無視し、ブラウザ標準動作を妨げない */
  enabled = false;
  mode: 'flight' | 'eva' = 'flight';
  locked = false;
  onAction: (a: ActionName) => void = () => {};
  onLockChange: (locked: boolean) => void = () => {};
  settings: InputSettings = { sensitivity: 1, invertY: false };
  /** タッチUI(画面上のスティック/ボタン)からの入力。キーボード入力と合成される */
  readonly virtual = { thrust: 0, turn: 0, pitch: 0, boost: false, brake: false, fire: false };
  /** true の間は Pointer Lock を使わず、視点はタッチドラッグで操作する */
  touchMode = false;

  private dx = 0;
  private dy = 0;
  private rightDown = false;
  private leftDown = false;
  get firing(): boolean {return this.enabled&&this.mode==='flight'&&(this.keys.has('KeyJ')||this.leftDown||this.virtual.fire);}
  private cleanup: (() => void)[] = [];

  attach(canvas: HTMLCanvasElement): void {
    const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, fn as EventListener);
      this.cleanup.push(() => window.removeEventListener(t, fn as EventListener));
    };

    on('keydown', (e) => {
      if (isTextTarget(e.target)) return;
      if (this.enabled && PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = this.mode==='eva'&&e.code==='KeyE' ? 'investigate' : ACTION_KEYS[e.code];
      // 一時停止系(Esc/P)は無効時も通知する(メニューを閉じる用途)
      if (a && (this.enabled || a === 'pause' || a === 'upgrades' || a === 'log' || a === 'operations')) this.onAction(a);
    });
    on('keyup', (e) => this.keys.delete(e.code));
    on('blur', () => {
      this.reset();
    });
    on('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    on('mousedown', (e) => {
      if(e.button===0&&this.enabled&&this.locked&&e.target===canvas)this.leftDown=true;
      if (e.button === 2 && this.enabled) this.rightDown = true;
    });
    on('mouseup', (e) => {
      if (e.button === 2) this.rightDown = false;
      if(e.button===0)this.leftDown=false;
    });
    const ctx = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', ctx);
    this.cleanup.push(() => canvas.removeEventListener('contextmenu', ctx));

    const lockChange = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was !== this.locked) this.onLockChange(this.locked);
    };
    document.addEventListener('pointerlockchange', lockChange);
    this.cleanup.push(() => document.removeEventListener('pointerlockchange', lockChange));
    // プレイ中にキャンバスをクリックしたら視点操作を(再)有効化
    const click = () => {
      if (this.enabled && !this.locked && !this.touchMode) this.requestLock(canvas);
    };
    canvas.addEventListener('click', click);
    this.cleanup.push(() => canvas.removeEventListener('click', click));
  }

  /** タッチUI用: 視点の回転量を(マウス移動量と同じ px 単位で)加える */
  addLook(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.dx += dx;
    this.dy += dy;
  }

  /** タッチUIの押下状態を全て解除する(画面遷移・中断時の押しっぱなし防止) */
  resetVirtual(): void {
    const v = this.virtual;
    v.thrust = v.turn = v.pitch = 0;
    v.boost = v.brake = v.fire = false;
  }

  reset(): void {
    this.keys.clear();
    this.rightDown = this.leftDown = false;
    this.dx = this.dy = 0;
    this.resetVirtual();
  }

  requestLock(canvas: HTMLCanvasElement): void {
    if (this.touchMode) return;
    try {
      const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* 非対応環境: 矢印キー操作にフォールバック */
    }
  }

  releaseLock(): void {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* noop */
    }
  }

  /** 旋回・ピッチの目標角速度を作る。慣性とバンクは姿勢制御側が扱う。 */
  poll(dt: number, out: FlightInput = emptyInput()): FlightInput {
    const k = this.keys;
    const has = (c: string) => k.has(c);
    if (!this.enabled) {
      this.dx = this.dy = 0;
      return Object.assign(out, emptyInput());
    }
    const v = this.virtual;
    const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
    out.thrust = clamp1((has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0) + v.thrust);
    out.roll = ((has('KeyQ') ? 1 : 0) - (has('KeyE') ? 1 : 0)) * 1.6;
    out.boost = has('KeyF') || this.rightDown || v.boost;
    out.brake = has('KeyX') || v.brake;

    const sens = 0.0021 * this.settings.sensitivity;
    const ySign = this.settings.invertY ? -1 : 1;
    const frameSec = Math.max(dt, 1 / 240);
    let yaw = -this.dx * sens / frameSec;
    let pitch = -this.dy * sens * ySign / frameSec;
    this.dx = this.dy = 0;
    yaw += clamp1((has('KeyA') || has('ArrowLeft') ? 1 : 0) - (has('KeyD') || has('ArrowRight') ? 1 : 0) - v.turn) * 1.1;
    pitch += clamp1((has('Space') || has('ArrowUp') ? 1 : 0) - (has('ShiftLeft') || has('ShiftRight') || has('ArrowDown') ? 1 : 0) + v.pitch) * 0.9 * ySign;

    // 軽い平滑化で機体の「重さ」を出す(入力遅れは 40ms 程度)
    out.yaw = Math.max(-1.1, Math.min(1.1, yaw));
    out.pitch = Math.max(-0.9, Math.min(0.9, pitch));
    return out;
  }

  dispose(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }

  pollEva(dt: number, out: EvaInput): EvaInput {
    const k=this.keys,v=this.virtual;
    out.forward=this.enabled ? Math.max(-1,Math.min(1,Number(k.has('KeyW'))-Number(k.has('KeyS'))+v.thrust)) : 0;
    out.side=this.enabled ? Math.max(-1,Math.min(1,Number(k.has('KeyD'))-Number(k.has('KeyA'))+v.turn)) : 0;
    out.up=this.enabled ? Math.max(-1,Math.min(1,Number(k.has('Space'))-Number(k.has('ShiftLeft')||k.has('ShiftRight'))+v.pitch)) : 0;
    const sec=Math.max(dt,1/240),sens=.0021*this.settings.sensitivity;
    out.yaw=this.enabled ? Math.max(-2,Math.min(2,-this.dx*sens/sec+Number(k.has('ArrowLeft'))-Number(k.has('ArrowRight')))) : 0;
    out.pitch=this.enabled ? Math.max(-1.5,Math.min(1.5,(-this.dy*sens/sec+Number(k.has('ArrowUp'))-Number(k.has('ArrowDown')))*(this.settings.invertY?-1:1))) : 0;
    out.brake=k.has('KeyX')||v.brake;this.dx=this.dy=0;return out;
  }
}

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox'
    ? true
    : tag === 'TEXTAREA' || tag === 'SELECT';
}
