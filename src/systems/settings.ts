import type { StorageLike } from './save';
import type { QualitySetting } from '../render/quality';

export const SETTINGS_KEY = 'lyrion.settings.v1';

export interface Settings {
  quality: QualitySetting;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  showFps: boolean;
  audioEnabled: boolean;
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  sensitivity: 1,
  invertY: false,
  fov: 70,
  showFps: false,
  audioEnabled: true,
  masterVolume: 0.6,
  musicVolume: 0.35,
  effectsVolume: 0.65,
};

const QUALITIES: QualitySetting[] = ['low', 'medium', 'high', 'auto'];

export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.quality === 'string' && (QUALITIES as string[]).includes(r.quality)) out.quality = r.quality as QualitySetting;
  if (typeof r.sensitivity === 'number' && Number.isFinite(r.sensitivity)) out.sensitivity = Math.min(3, Math.max(0.2, r.sensitivity));
  if (typeof r.invertY === 'boolean') out.invertY = r.invertY;
  if (typeof r.fov === 'number' && Number.isFinite(r.fov)) out.fov = Math.min(100, Math.max(55, r.fov));
  if (typeof r.showFps === 'boolean') out.showFps = r.showFps;
  if (typeof r.audioEnabled === 'boolean') out.audioEnabled = r.audioEnabled;
  for (const key of ['masterVolume', 'musicVolume', 'effectsVolume'] as const) {
    const value = r[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.max(0, Math.min(1, value));
  }
  return out;
}

export function loadSettings(storage: StorageLike | null): Settings {
  try {
    const txt = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(txt ? JSON.parse(txt) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike | null, s: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}
