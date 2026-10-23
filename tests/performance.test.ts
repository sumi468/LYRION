import { describe, expect, it } from 'vitest';
import { FrameStats } from '../src/systems/frameStats';
import { loadSettings, saveSettings, SETTINGS_KEY } from '../src/systems/settings';

describe('FPS display', () => {
  it('measures frames over elapsed time instead of averaging reciprocal intervals', () => {
    const frames = new FrameStats();
    frames.sample(.05); frames.sample(.05); frames.sample(.2);
    expect(frames.fps).toBeCloseTo(10);
    expect(frames.frameMs).toBeCloseTo(100);
  });
  it('ignores render-only ticks and invalid samples, and resets a background-tab gap', () => {
    const frames = new FrameStats();
    for (const dt of [0, -1, NaN, Infinity]) frames.sample(dt);
    expect(frames.fps).toBe(0);
    frames.sample(.2); frames.sample(30);
    for (let i = 0; i < 16; i++) frames.sample(1 / 60);
    expect(frames.fps).toBeCloseTo(60);
    expect(frames.frameMs).toBeCloseTo(1000 / 60);
  });
  it('enables the overlay for an old installation, then preserves an explicit new choice', () => {
    const data = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ showFps: false, quality: 'high', difficulty: 'easy' })]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    const settings = loadSettings(storage);
    expect(settings.showFps).toBe(true);
    expect(settings.quality).toBe('high');
    expect(settings.difficulty).toBe('easy');
    saveSettings(storage, { ...settings, showFps: false });
    expect(loadSettings(storage).showFps).toBe(false);
    saveSettings(storage, { ...settings, showFps: true });
    expect(loadSettings(storage).showFps).toBe(true);
  });
});
