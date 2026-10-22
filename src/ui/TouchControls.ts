import type { Game } from '../core/Game';
import type { ActionName } from '../input/Input';
import { h } from './dom';

const DEADZONE = 0.14;
const LOOK_GAIN = 1.4; // ドラッグ量(px) → マウス移動量(px) 換算

/** 捕捉に失敗しても(合成イベント・非対応環境)操作自体は続ける */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* noop */
  }
}

/**
 * タッチ操作UI。左: 仮想スティック(前後/左右)、画面の空き部分のドラッグ: 視点、右: ボタン。
 * 入力は Input.virtual / Input.addLook に書き込むだけで、ゲームロジックは知らない。
 * タッチ端末(detectMobile)か、最初のタッチを検出したときだけ有効になる。
 */
export class TouchControls {
  private root: HTMLElement;
  private knob = h('div', { class: 'tc-knob' });
  private stick = h('div', { class: 'tc-stick' }, this.knob);
  private cleanup: (() => void)[] = [];
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private holds = new Map<number, () => void>(); // pointerId → 解除処理

  constructor(parent: HTMLElement, private game: Game, private canvas: HTMLCanvasElement, private fire: (a: ActionName) => void) {
    const input = game.input;
    const hold = (label: string, cls: string, down: () => void, up: () => void) => {
      const b = h('button', { class: `tc-btn ${cls}`, type: 'button', 'aria-label': label }, label);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        capture(b, e.pointerId);
        b.classList.add('down');
        down();
        this.holds.set(e.pointerId, () => { b.classList.remove('down'); up(); });
      });
      const end = (e: PointerEvent) => { this.holds.get(e.pointerId)?.(); this.holds.delete(e.pointerId); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('lostpointercapture', end);
      return b;
    };
    const tap = (label: string, cls: string, a: ActionName) => {
      const b = h('button', { class: `tc-btn ${cls}`, type: 'button', 'aria-label': label }, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); this.fire(a); });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };

    this.root = h(
      'div',
      { class: 'tc', hidden: true },
      this.stick,
      h('div', { class: 'tc-top' }, tap('CAM', 'small', 'camera'), tap('II', 'small', 'pause')),
      h(
        'div',
        { class: 'tc-right' },
        h('div', { class: 'tc-col' }, hold('▲', 'small', () => (input.virtual.lift = 1), () => (input.virtual.lift = 0)), hold('▼', 'small', () => (input.virtual.lift = -1), () => (input.virtual.lift = 0))),
        h(
          'div',
          { class: 'tc-cluster' },
          tap('SCAN', 'scan', 'scan'),
          tap('TGT', 'tgt', 'target'),
          hold('BRAKE', 'brake', () => (input.virtual.brake = true), () => (input.virtual.brake = false)),
          hold('BOOST', 'boost', () => (input.virtual.boost = true), () => (input.virtual.boost = false)),
        ),
      ),
    );
    parent.append(this.root);

    this.bindStick();
    this.bindLook();

    // 端末判定: タッチ端末なら最初から有効。それ以外でも最初のタッチで有効化(ハイブリッド端末)
    if (game.isMobile) this.setEnabled(true);
    this.cleanup.push(game.ev.on('phase', () => this.sync()));
    const blur = () => this.releaseAll();
    window.addEventListener('blur', blur);
    this.cleanup.push(() => window.removeEventListener('blur', blur));
    this.sync();
  }

  private setEnabled(on: boolean): void {
    this.game.input.touchMode = on;
    document.body.classList.toggle('touch', on);
    this.sync();
  }

  private sync(): void {
    const show = this.game.input.touchMode && this.game.phase === 'playing';
    this.root.hidden = !show;
    if (!show) this.releaseAll();
  }

  private releaseAll(): void {
    for (const f of this.holds.values()) f();
    this.holds.clear();
    this.stickId = this.lookId = null;
    this.knob.style.transform = '';
    this.game.input.resetVirtual();
  }

  private bindStick(): void {
    const input = this.game.input;
    const move = (e: PointerEvent) => {
      const r = this.stick.getBoundingClientRect();
      const radius = r.width * 0.40625;
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / radius;
      const ny = dy / radius;
      const dz = (v: number) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));
      input.virtual.strafe = dz(nx);
      input.virtual.thrust = -dz(ny);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.knob.style.transform = '';
      input.virtual.strafe = 0;
      input.virtual.thrust = 0;
    };
    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      capture(this.stick, e.pointerId);
      move(e);
    });
    this.stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) move(e); });
    this.stick.addEventListener('pointerup', end);
    this.stick.addEventListener('pointercancel', end);
    this.stick.addEventListener('lostpointercapture', end);
  }

  /** キャンバス(HUDは pointer-events:none なので、空き部分のタッチが届く)のドラッグで視点を回す */
  private bindLook(): void {
    const c = this.canvas;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (!this.game.input.touchMode) this.setEnabled(true);
      if (this.lookId !== null || this.game.phase !== 'playing') return;
      this.lookId = e.pointerId;
      capture(c, e.pointerId);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      this.game.input.addLook((e.clientX - this.lastX) * LOOK_GAIN, (e.clientY - this.lastY) * LOOK_GAIN);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const up = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    this.cleanup.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('lostpointercapture', up);
    });
  }

  dispose(): void {
    this.releaseAll();
    for (const f of this.cleanup) f();
    this.cleanup = [];
    this.root.remove();
  }
}
