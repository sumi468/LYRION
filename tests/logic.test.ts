import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BODY_BY_ID, BODY_DEFS, CATALOG_IDS } from '../src/data/starSystem';
import { MISSIONS } from '../src/data/missions';
import { UPGRADE_DEFS } from '../src/data/upgrades';
import { computeShipStats, createUpgradeLevels, purchaseUpgrade, upgradeCost } from '../src/systems/upgrades';
import { beginScan, createScanState, stepScan } from '../src/systems/scan';
import { advanceMissions } from '../src/systems/missions';
import { SaveManager, deserialize, serialize, type StorageLike } from '../src/systems/save';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/systems/settings';
import { createPositionTable, updateBodyPositions } from '../src/physics/orbits';
import { maybeRebaseOrigin } from '../src/physics/flight';
import { heatDamagePerSecond, impactDamage, resolveSphereCollision } from '../src/systems/collision';
import { AutoQuality, QUALITY_LADDER, FIXED_LEVEL } from '../src/render/quality';
import { createNewState } from '../src/core/state';

const memStorage = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

describe('星系データ', () => {
  it('ID が一意で、軌道の親が実在する', () => {
    const ids = BODY_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of BODY_DEFS) if (d.orbit) expect(BODY_BY_ID[d.orbit.parent]).toBeDefined();
  });
  it('恒星・岩石・大気・リング付きガス・複数の衛星・小惑星帯が含まれる', () => {
    expect(BODY_DEFS.some((d) => d.kind === 'star')).toBe(true);
    expect(BODY_DEFS.filter((d) => d.orbit && BODY_BY_ID[d.orbit.parent]?.kind === 'planet').length).toBeGreaterThanOrEqual(2);
    expect(BODY_DEFS.some((d) => d.belt)).toBe(true);
    expect(BODY_DEFS.some((d) => d.ring)).toBe(true);
  });
  it('ミッションが参照する天体は全て実在する', () => {
    const p = { scanned: new Set<string>(), upgradesBought: 0 };
    for (const m of MISSIONS) {
      const t = m.resolveTarget(p);
      if (t) expect(BODY_BY_ID[t]).toBeDefined();
    }
  });
});

describe('軌道', () => {
  it('周期ぶん進むと元の位置へ戻る', () => {
    const a = createPositionTable(BODY_DEFS);
    const b = createPositionTable(BODY_DEFS);
    const planet = BODY_DEFS.find((d) => d.orbit && d.orbit.parent === 'lyrion')!;
    updateBodyPositions(BODY_DEFS, 10, a);
    updateBodyPositions(BODY_DEFS, 10 + planet.orbit!.period, b);
    expect(a[planet.id].distanceTo(b[planet.id])).toBeLessThan(1e-6 * planet.orbit!.radius + 1e-6);
  });
});

describe('スキャン', () => {
  const def = BODY_BY_ID['cindra'];
  it('範囲内でターゲットを維持すれば完了する', () => {
    const s = createScanState();
    beginScan(s, def.id);
    let phase = 'scanning';
    for (let i = 0; i < 1000 && phase === 'scanning'; i++) phase = stepScan(s, 0.05, def, true, def.id);
    expect(phase).toBe('done');
  });
  it('範囲外・ターゲット変更で中断する', () => {
    const s = createScanState();
    beginScan(s, def.id);
    expect(stepScan(s, 0.05, def, false, def.id)).toBe('cancelled');
    beginScan(s, def.id);
    expect(stepScan(s, 0.05, def, true, 'thalassa')).toBe('cancelled');
  });
});

describe('アップグレード', () => {
  it('資金不足では購入できず、データは減らない', () => {
    const lv = createUpgradeLevels();
    const r = purchaseUpgrade('engine', lv, 0);
    expect(r.ok).toBe(false);
    expect(r.data).toBe(0);
    expect(lv.engine).toBe(0);
  });
  it('購入でレベルが上がり性能が向上、最大レベルで頭打ち', () => {
    for (const u of UPGRADE_DEFS) {
      const lv = createUpgradeLevels();
      let data = 1e6;
      for (let i = 0; i < u.maxLevel; i++) {
        const r = purchaseUpgrade(u.id, lv, data);
        expect(r.ok).toBe(true);
        data = r.data;
      }
      expect(upgradeCost(u.id, lv[u.id])).toBeNull();
      expect(purchaseUpgrade(u.id, lv, data).ok).toBe(false);
    }
    const base = computeShipStats(createUpgradeLevels());
    const max = computeShipStats({ engine: 4, boost: 4, scan: 4, energy: 4 });
    expect(max.thrust).toBeGreaterThan(base.thrust);
    expect(max.scanRange).toBeGreaterThan(base.scanRange);
    expect(max.energyMax).toBeGreaterThan(base.energyMax);
    expect(max.boostSpeedMul).toBeGreaterThan(base.boostSpeedMul);
  });
});

describe('進行可能性(ソフトロック防止)', () => {
  it('全天体をスキャンすると全ミッションが完了する', () => {
    const scanned = new Set<string>(CATALOG_IDS);
    const r = advanceMissions({ scanned, upgradesBought: 99, missionIndex: 0 });
    expect(r.newIndex).toBe(MISSIONS.length);
  });
  it('スキャン報酬だけで全アップグレードの初期段階を買える', () => {
    const total = CATALOG_IDS.reduce((s, id) => s + BODY_BY_ID[id].scanReward, 0) + MISSIONS.reduce((s, m) => s + m.reward, 0);
    const firstTier = UPGRADE_DEFS.reduce((s, u) => s + (upgradeCost(u.id, 0) ?? 0), 0);
    expect(total).toBeGreaterThan(firstTier);
  });
});

describe('セーブ/ロード', () => {
  it('往復で状態が保たれる', () => {
    const s = createNewState();
    s.data = 77; s.hull = 63; s.upgrades.engine = 2; s.scanned.set('cindra', 12.5); s.missionIndex = 1;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s))));
    expect(back).not.toBeNull();
    expect(back!.data).toBe(77);
    expect(back!.upgrades.engine).toBe(2);
    expect(back!.scanned.get('cindra')).toBe(12.5);
    expect(back!.pos.distanceTo(s.pos)).toBeLessThan(1e-6);
  });
  it('破損・不正データは null で落ちない', () => {
    for (const bad of [null, 1, 'x', {}, { version: 999 }, { version: 1, pos: 'x' }]) expect(() => deserialize(bad)).not.toThrow();
    const st = memStorage();
    st.setItem('lyrion.save.v1', '{broken');
    expect(new SaveManager(st).load()).toBeNull();
    expect(new SaveManager(null).save(createNewState())).toBe(false);
  });
  it('容量超過など保存失敗でも例外を出さない', () => {
    const st: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(new SaveManager(st).save(createNewState())).toBe(false);
  });
  it('NaN を含むセーブは安全に扱われる', () => {
    const s = createNewState();
    s.pos.set(NaN, 0, 0);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s))));
    if (back) expect(Number.isFinite(back.pos.x)).toBe(true);
  });
});

describe('設定', () => {
  it('不正値は既定値/範囲内へ丸める', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ quality: 'ultra', sensitivity: 999, fov: -5 });
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.sensitivity).toBeLessThanOrEqual(3);
    expect(s.fov).toBeGreaterThan(0);
  });
  it('旧設定の読込み時も音量の既定値を補完し、不正な音量を拒否する', () => {
    const legacy = sanitizeSettings({ quality: 'high', sensitivity: 1 });
    expect(legacy.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    const settings = sanitizeSettings({ masterVolume: -5, musicVolume: Infinity, effectsVolume: 12, audioEnabled: false });
    expect(settings.masterVolume).toBe(0);
    expect(settings.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(settings.effectsVolume).toBe(1);
    expect(settings.audioEnabled).toBe(false);
  });
});

describe('物理', () => {
  it('Floating Origin: 閾値を超えたときだけ原点を移し替える', () => {
    const origin = new Vector3();
    expect(maybeRebaseOrigin(origin, new Vector3(100, 0, 0))).toBe(false);
    expect(maybeRebaseOrigin(origin, new Vector3(5000, 0, 0))).toBe(true);
    expect(origin.x).toBe(5000);
  });
  it('衝突: めり込まず、法線方向の速度が反転する', () => {
    const pos = new Vector3(0, 0, 90), vel = new Vector3(0, 0, -50);
    const r = resolveSphereCollision(pos, vel, new Vector3(), new Vector3(), 100, 5);
    expect(r.hit).toBe(true);
    expect(pos.length()).toBeGreaterThanOrEqual(105 - 1e-6);
    expect(vel.z).toBeGreaterThan(0);
  });
  it('低速接触ではダメージなし、熱は近いほど強い', () => {
    expect(impactDamage(10)).toBe(0);
    expect(impactDamage(100)).toBeGreaterThan(0);
    expect(heatDamagePerSecond(10, 650)).toBeGreaterThan(heatDamagePerSecond(500, 650));
    expect(heatDamagePerSecond(700, 650)).toBe(0);
  });
});

describe('画質', () => {
  it('段階が上がるほど負荷設定が単調に増える', () => {
    for (let i = 1; i < QUALITY_LADDER.length; i++) {
      expect(QUALITY_LADDER[i].stars).toBeGreaterThanOrEqual(QUALITY_LADDER[i - 1].stars);
      expect(QUALITY_LADDER[i].renderScale).toBeGreaterThanOrEqual(QUALITY_LADDER[i - 1].renderScale);
    }
    expect(FIXED_LEVEL.low).toBeLessThan(FIXED_LEVEL.medium);
    expect(FIXED_LEVEL.medium).toBeLessThan(FIXED_LEVEL.high);
  });
  it('Auto: 低FPSが続くと段階を下げる', () => {
    const a = new AutoQuality(4, 58);
    let changed: number | null = null;
    for (let i = 0; i < 400 && changed === null; i++) changed = a.update(1 / 20);
    expect(changed).toBe(3);
  });
  it('Auto: 異常に長いフレーム(タブ復帰)は無視する', () => {
    const a = new AutoQuality(4, 58);
    for (let i = 0; i < 50; i++) expect(a.update(2)).toBeNull();
    expect(a.level).toBe(4);
  });
  it('Auto: 良好なFPSでも一度下げた段の上限を超えて戻らない', () => {
    const a = new AutoQuality(4, 58);
    for (let i = 0; i < 400; i++) a.update(1 / 20);
    const low = a.level;
    for (let i = 0; i < 20000; i++) a.update(1 / 144);
    expect(a.level).toBeLessThanOrEqual(low + 1);
  });
});
