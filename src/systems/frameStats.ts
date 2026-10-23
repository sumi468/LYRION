/** Time-weighted frame rate, published at most four times a second. No per-frame allocations. */
export class FrameStats {
  fps = 0;
  frameMs = 0;
  private elapsed = 0;
  private frames = 0;

  sample(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // A background tab / resumed computer is not a useful rendering sample.
    if (dt > 1) { this.elapsed = 0; this.frames = 0; return; }
    this.elapsed += dt;
    this.frames++;
    if (this.elapsed >= .25) {
      this.fps = this.frames / this.elapsed;
      this.frameMs = this.elapsed * 1000 / this.frames;
      this.elapsed = 0;
      this.frames = 0;
    }
  }
}
