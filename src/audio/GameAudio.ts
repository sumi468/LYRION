import type { Settings } from '../systems/settings';

/** 外部アセット不要の静かなシンセ音。ユーザー操作後にだけ AudioContext を作る。 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private music!: GainNode;
  private engine!: OscillatorNode;
  private engineGain!: GainNode;
  private scan!: OscillatorNode;
  private scanGain!: GainNode;
  private analyser!: AnalyserNode;
  private sources: AudioScheduledSourceNode[] = [];
  private pads: OscillatorNode[] = [];
  private transients = new Set<OscillatorNode>();
  private settings: Settings | null = null;
  private active = false;
  private disposed = false;
  private chord = -1;
  private elapsed = 0;
  private damageAt = -Infinity;

  configure(settings: Settings): void {
    this.settings = settings;
    this.applyGains();
    this.sync();
  }

  /** pointerdown / keydown から呼ぶ。非対応・拒否時もゲームは続行できる。 */
  unlock(): void {
    if (this.disposed || !this.settings?.audioEnabled) return;
    try {
      if (!this.context) this.create();
      this.sync();
    } catch {
      // 音声デバイスが利用できない環境では無音でプレイする。
    }
  }

  private oscillator(type: OscillatorType, frequency: number, gain: number, dest: AudioNode): [OscillatorNode, GainNode] {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.value = gain;
    osc.connect(amp).connect(dest);
    osc.start();
    this.sources.push(osc);
    return [osc, amp];
  }

  private create(): void {
    const ctx = this.context = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.effects = ctx.createGain();
    this.music = ctx.createGain();
    this.effects.connect(this.master);
    this.music.connect(this.master);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 8;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(limiter).connect(this.analyser).connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.connect(this.effects);
    [this.engine, this.engineGain] = this.oscillator('sawtooth', 42, 0, filter);
    [this.scan, this.scanGain] = this.oscillator('sine', 540, 0, this.effects);
    for (const frequency of [110, 164.81, 220]) {
      const [pad] = this.oscillator('sine', frequency, 0.045, this.music);
      this.pads.push(pad);
    }
    this.applyGains();
  }

  private applyGains(): void {
    const ctx = this.context;
    const settings = this.settings;
    if (!ctx || !settings) return;
    const at = ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.audioEnabled && this.active ? settings.masterVolume : 0, at, 0.04);
    this.music.gain.setTargetAtTime(settings.musicVolume, at, 0.08);
    this.effects.gain.setTargetAtTime(settings.effectsVolume, at, 0.04);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.applyGains();
    this.sync();
  }

  private sync(): void {
    const ctx = this.context;
    if (!ctx || ctx.state === 'closed') return;
    const shouldRun = this.active && this.settings?.audioEnabled && !document.hidden;
    // resume/suspend を順にキューへ入れ、クリック直前の suspend との競合を避ける。
    if (shouldRun) void ctx.resume().catch(() => {});
    else void ctx.suspend().catch(() => {});
  }

  update(dt: number, thrust: number, boost: number, scanning: boolean): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.active || !this.settings?.audioEnabled) return;
    const at = ctx.currentTime;
    this.elapsed += dt;
    this.engine.frequency.setTargetAtTime(42 + thrust * 42 + boost * 32, at, 0.08);
    this.engineGain.gain.setTargetAtTime(0.012 + thrust * 0.05 + boost * 0.035, at, 0.06);
    this.scan.frequency.setTargetAtTime(540 + Math.sin(this.elapsed * 8) * 100, at, 0.025);
    this.scanGain.gain.setTargetAtTime(scanning ? 0.035 : 0, at, 0.03);
    const chord = Math.floor(this.elapsed / 12) % 4;
    if (chord !== this.chord) {
      this.chord = chord;
      const root = [110, 130.81, 98, 87.31][chord];
      for (let i = 0; i < this.pads.length; i++) {
        this.pads[i].frequency.setTargetAtTime(root * [1, 1.5, 2][i], at, 2);
      }
    }
  }

  cue(kind: 'scan' | 'upgrade' | 'mission' | 'damage'): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.active || !this.settings?.audioEnabled) return;
    if (kind === 'damage') {
      if (ctx.currentTime - this.damageAt < 0.6) return;
      this.damageAt = ctx.currentTime;
    }
    const notes = kind === 'damage' ? [90, 65] : kind === 'mission' ? [440, 554.37, 659.25, 880] : kind === 'upgrade' ? [330, 440, 660] : [523.25, 659.25, 783.99];
    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const start = ctx.currentTime + i * 0.12;
      osc.type = kind === 'damage' ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(0.07, start + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(amp).connect(this.effects);
      this.transients.add(osc);
      osc.onended = () => { osc.disconnect(); amp.disconnect(); this.transients.delete(osc); };
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  /** 検証用。実際にミキサーから非ゼロの波形が出ることも確認できる。 */
  diagnostics() {
    const data = new Float32Array(256);
    this.analyser?.getFloatTimeDomainData(data);
    return {
      state: this.disposed ? 'closed' : this.context?.state ?? 'locked',
      active: this.active,
      rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length),
      sources: this.sources.length + this.transients.size,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    for (const source of this.transients) { source.stop(); source.disconnect(); }
    this.sources = [];
    this.transients.clear();
    if (this.context) void this.context.close().catch(() => {});
  }
}
