import { Quaternion, Vector3 } from 'three';
import { SHIELD_MAX } from '../data/combat';
import { canLand, type LandingRecord } from './landing';
import { BODY_BY_ID, BODY_DEFS, LEGACY_BODY_DEFS, METRIC_V5_BODY_DEFS, INITIAL_DETECTED } from '../data/starSystem';
import {LEGACY_STATION_ORBIT,STATION_ORBIT,LEGACY_SATELLITE_ORBIT,SATELLITE_ORBIT,LEGACY_DEEP_ORBIT,DEEP_ORBIT} from '../data/homeworld';
import {createPositionTable,updateBodyPositions,updateBodyVelocities} from '../physics/orbits';
import {ReferenceFrame,orbitalFrame} from '../physics/frames';
import {migrateCompactPose,bodyRotation,metricOrbit,GAMEPLAY_SCALE,CELESTIAL_SCALE,type MigrationAnchor} from '../physics/worldScale';
import {surfaceAltitude,terrainHeight,PRIME_BASE_NORMAL} from '../physics/terrain';
import {updateSurfaceFrame} from '../physics/surfaceFrame';
import {BASE_SOLIDS} from '../data/surfaceCampaign';
import {sanitizeSurfaceProgress,type SurfaceProgress} from './surfaceCampaign';
import { MISSIONS } from '../data/missions';
import { UPGRADE_BY_ID, UPGRADE_IDS } from '../data/upgrades';
import { createNewState, HULL_MAX, type GameState } from '../core/state';
import { sanitizeHomecoming, type HomecomingProgress } from './expeditions';

export const SAVE_KEY = 'lyrion.save.v1';
export const SAVE_VERSION = 6;
export const SAVE_BACKUP_KEY='lyrion.save.before-metric-v5';
export const COMPACT_BACKUP_KEY='lyrion.save.before-compact-v6';

/** localStorage 互換の最小インターフェース(テストで差し替え可能) */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveData {
  version: number;
  savedAt: number;
  time: number;
  playSeconds: number;
  pos: [number, number, number];
  vel: [number, number, number];
  quat: [number, number, number, number];
  hull: number;
  shield: number;
  kills: number;
  landed: LandingRecord | null;
  landings: string[];
  energy: number;
  data: number;
  totalData: number;
  upgrades: Record<string, number>;
  upgradesBought: number;
  detected: string[];
  scanned: Record<string, number>;
  missionIndex: number;
  assist: boolean;
  cameraMode: 'third' | 'first';
  homecoming: HomecomingProgress;
  surfaceProgress:SurfaceProgress;
}

export function serialize(s: GameState, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    time: s.time,
    playSeconds: s.playSeconds,
    pos: [s.pos.x, s.pos.y, s.pos.z],
    vel: [s.vel.x, s.vel.y, s.vel.z],
    quat: [s.quat.x, s.quat.y, s.quat.z, s.quat.w],
    hull: s.hull,
    shield: s.shield,
    kills: s.kills,
    landed: s.landed,
    landings: [...s.landings],
    energy: s.energy,
    data: s.data,
    totalData: s.totalData,
    upgrades: { ...s.upgrades },
    upgradesBought: s.upgradesBought,
    detected: [...s.detected],
    scanned: Object.fromEntries(s.scanned),
    missionIndex: s.missionIndex,
    assist: s.assist,
    cameraMode: s.cameraMode,
    homecoming: sanitizeHomecoming(s.homecoming),
    surfaceProgress:sanitizeSurfaceProgress(s.surfaceProgress),
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(isNum);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 外部入力(localStorage の文字列など)を検証して GameState へ復元する。
 * 壊れたデータ・古いバージョンでも例外を投げず、可能な限り復元し、無理なら null を返す。
 */
export function deserialize(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<SaveData>;
  if (!isNum(d.version) || d.version < 1 || d.version > SAVE_VERSION) return null;
  if (!isVec(d.pos, 3) || !isVec(d.quat, 4) || !isNum(d.time)) return null;

  const base = createNewState();
  const s: GameState = base;
  s.time = Math.max(0, d.time);
  s.playSeconds = isNum(d.playSeconds) ? Math.max(0, d.playSeconds) : 0;
  s.pos.set(d.pos[0], d.pos[1], d.pos[2]);
  if (isVec(d.vel, 3)) s.vel.set(d.vel[0], d.vel[1], d.vel[2]); else s.vel.set(0,0,0);
  s.quat = new Quaternion(d.quat[0], d.quat[1], d.quat[2], d.quat[3]);
  if (s.quat.lengthSq() < 1e-6) return null;
  s.quat.normalize();
  s.hull = isNum(d.hull) ? clamp(d.hull, 1, HULL_MAX) : HULL_MAX;
  s.shield = isNum(d.shield) ? clamp(d.shield,0,SHIELD_MAX) : SHIELD_MAX;
  s.kills = isNum(d.kills) ? Math.max(0,Math.floor(d.kills)) : 0;
  s.landings = new Set(Array.isArray(d.landings) ? d.landings.filter(id=>typeof id==='string'&&BODY_BY_ID[id]&&canLand(BODY_BY_ID[id])) : []);
  if(d.landed&&typeof d.landed==='object') {
    const record=d.landed;
    if(typeof record.bodyId==='string'&&BODY_BY_ID[record.bodyId]&&canLand(BODY_BY_ID[record.bodyId])&&isVec(record.normal,3)) {
      const length=Math.hypot(...record.normal);
      if(length>.5&&length<2)s.landed={bodyId:record.bodyId,normal:record.normal.map(n=>n/length) as [number,number,number]};
    }
  }
  s.energy = isNum(d.energy) ? Math.max(0, d.energy) : 100;
  s.data = isNum(d.data) ? Math.max(0, Math.floor(d.data)) : 0;
  s.totalData = isNum(d.totalData) ? Math.max(s.data, Math.floor(d.totalData)) : s.data;

  const up = d.upgrades && typeof d.upgrades === 'object' ? (d.upgrades as Record<string, unknown>) : {};
  let bought = 0;
  for (const id of UPGRADE_IDS) {
    const v = up[id];
    const lv = isNum(v) ? clamp(Math.floor(v), 0, UPGRADE_BY_ID[id].maxLevel) : 0;
    s.upgrades[id] = lv;
    bought += lv;
  }
  s.upgradesBought = Math.max(isNum(d.upgradesBought) ? Math.floor(d.upgradesBought) : 0, bought);

  const known = new Set(Object.keys(BODY_BY_ID));
  const canonicalId = (id: string) => id === 'prime' ? 'lyrion-prime' : id;
  s.detected = new Set(INITIAL_DETECTED);
  if (Array.isArray(d.detected)) for (const id of d.detected) if (typeof id === 'string' && known.has(canonicalId(id))) s.detected.add(canonicalId(id));

  s.scanned = new Map();
  if (d.scanned && typeof d.scanned === 'object') {
    for (const [id, t] of Object.entries(d.scanned as Record<string, unknown>)) {
      if (known.has(canonicalId(id)) && isNum(t)) {
        s.scanned.set(canonicalId(id), t);
        s.detected.add(canonicalId(id));
      }
    }
  }

  s.missionIndex = isNum(d.missionIndex) ? clamp(Math.floor(d.missionIndex), 0, MISSIONS.length) : 0;
  s.assist = typeof d.assist === 'boolean' ? d.assist : true;
  s.cameraMode = d.cameraMode === 'first' ? 'first' : 'third';
  s.homecoming = sanitizeHomecoming(d.version >= 3 ? d.homecoming : null);
  // EVA saves store the parked spacecraft pose. Recover aboard without losing research.
  s.homecoming.wasEva = false;
  s.surfaceProgress=sanitizeSurfaceProgress(d.surfaceProgress);
  if(d.version<6){
    const oldDefs=d.version<5?LEGACY_BODY_DEFS:METRIC_V5_BODY_DEFS;
    const oldTable=createPositionTable(oldDefs),table=createPositionTable(BODY_DEFS);
    const oldVelocity=createPositionTable(oldDefs),velocity=createPositionTable(BODY_DEFS);
    updateBodyPositions(oldDefs,s.time,oldTable);updateBodyPositions(BODY_DEFS,s.time,table);
    updateBodyVelocities(oldDefs,s.time,oldTable,createPositionTable(oldDefs),oldVelocity);
    updateBodyVelocities(BODY_DEFS,s.time,table,createPositionTable(BODY_DEFS),velocity);
    const anchors:MigrationAnchor[]=[];
    for(const [id,oldOrbit,orbit,range] of [['asterion',LEGACY_STATION_ORBIT,STATION_ORBIT,1100],['satellite',LEGACY_SATELLITE_ORBIT,SATELLITE_ORBIT,250],['deep',LEGACY_DEEP_ORBIT,DEEP_ORBIT,450]] as const){
      const previous=new ReferenceFrame(),current=new ReferenceFrame();orbitalFrame(previous,d.version<5?oldOrbit:metricOrbit(oldOrbit),s.time,oldTable,oldVelocity);orbitalFrame(current,orbit,s.time,table,velocity);
      anchors.push({id,oldPosition:previous.position,position:current.position,oldVelocity:previous.velocity,velocity:current.velocity,oldRotation:previous.rotation,rotation:current.rotation,oldAngularVelocity:previous.angularVelocity,angularVelocity:current.angularVelocity,range});
    }
    const previousBase=new ReferenceFrame(),currentBase=new ReferenceFrame();
    const prime=BODY_BY_ID['lyrion-prime'];
    if(d.version===5){
      updateSurfaceFrame(oldDefs.find(b=>b.homeworld)!,PRIME_BASE_NORMAL,s.time,oldTable[prime.id],oldVelocity[prime.id],previousBase);
      updateSurfaceFrame(prime,PRIME_BASE_NORMAL,s.time,table[prime.id],velocity[prime.id],currentBase);
      anchors.push({id:'prime-base',oldPosition:previousBase.position,position:currentBase.position,oldVelocity:previousBase.velocity,velocity:currentBase.velocity,oldRotation:previousBase.rotation,rotation:currentBase.rotation,oldAngularVelocity:previousBase.angularVelocity,angularVelocity:currentBase.angularVelocity,range:4000});
    }
    const pose=migrateCompactPose(s.pos,s.vel,s.time,oldDefs,BODY_DEFS,anchors,d.version<5?GAMEPLAY_SCALE:GAMEPLAY_SCALE/CELESTIAL_SCALE,d.version<5?450:10000);
    s.pos.copy(pose.position);s.vel.copy(pose.velocity);
    if(pose.orientationDelta)s.quat.premultiply(pose.orientationDelta).normalize();
    if(s.landed){
      const body=BODY_BY_ID[s.landed.bodyId],local=s.pos.clone().sub(table[body.id]).normalize().applyQuaternion(bodyRotation(body,s.time,new Quaternion()).invert());
      s.landed.normal=[local.x,local.y,local.z];
      if(body.surface?.program==='terran'&&terrainHeight(body,local)<1)s.landed=null;
    }
    // Terrain did not exist in compact saves. Lift nearby free ships above it.
    if(pose.reference&&BODY_BY_ID[pose.reference]){
      const body=BODY_BY_ID[pose.reference],clearance=surfaceAltitude(body,s.pos,table[body.id],s.time);
      if(clearance<12)s.pos.addScaledVector(s.pos.clone().sub(table[body.id]).normalize(),12-clearance);
    }
    // Retain a v5 port save's metre-sized walking/parking offset, while lifting
    // a free ship out of newly constructed city roofs. Landed records use the
    // usual LandingSystem recovery path after restoring their new normal.
    if(d.version===5&&pose.reference==='prime-base'&&!s.landed){
      const local=currentBase.toLocal(s.pos,new Vector3());let roof=-Infinity;
      for(const box of BASE_SOLIDS)if(local.x>box.min[0]-9&&local.x<box.max[0]+9&&local.z>box.min[2]-9&&local.z<box.max[2]+9&&local.y<box.max[1]+10)roof=Math.max(roof,box.max[1]);
      if(roof!==-Infinity){local.y=roof+15;currentBase.toWorld(local,s.pos);}
    }
  }
  return s;
}

export class SaveManager {
  constructor(private storage: StorageLike | null) {}

  /** セーブの有無(破損データは「なし」扱い) */
  hasSave(): boolean {
    return this.load() !== null;
  }

  save(s: GameState): boolean {
    if (!this.storage) return false;
    try {
      const existing=this.storage.getItem(SAVE_KEY);
      if(existing&&JSON.parse(existing).version<5&&!this.storage.getItem(SAVE_BACKUP_KEY))this.storage.setItem(SAVE_BACKUP_KEY,existing);
      if(existing&&JSON.parse(existing).version<6&&!this.storage.getItem(COMPACT_BACKUP_KEY))this.storage.setItem(COMPACT_BACKUP_KEY,existing);
      this.storage.setItem(SAVE_KEY, JSON.stringify(serialize(s)));
      return true;
    } catch {
      // 容量超過・プライベートモード等。ゲーム進行は止めない
      return false;
    }
  }

  load(): GameState | null {
    if (!this.storage) return null;
    try {
      const txt = this.storage.getItem(SAVE_KEY);
      if (!txt) return null;
      return deserialize(JSON.parse(txt));
    } catch {
      return null;
    }
  }

  savedAt(): number | null {
    if (!this.storage) return null;
    try {
      const txt = this.storage.getItem(SAVE_KEY);
      if (!txt) return null;
      const o = JSON.parse(txt) as Partial<SaveData>;
      return isNum(o.savedAt) ? o.savedAt : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      /* noop */
    }
  }
}

export function safeLocalStorage(): StorageLike | null {
  try {
    const ls = window.localStorage;
    const k = '__lyrion_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    return null;
  }
}

/** 使用しない import 警告を避けつつ、Vector3 型を再エクスポート(外部利用の利便性) */
export type { Vector3 };
