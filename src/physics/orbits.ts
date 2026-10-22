import { Vector3 } from 'three';
import type { BodyDef, OrbitDef } from '../data/types';

const AX_X = new Vector3(1, 0, 0);
const AX_Y = new Vector3(0, 1, 0);
const TAU = Math.PI * 2;

/** 親天体を原点とした軌道上の位置を out に書き込む(周期が負なら逆行) */
export function orbitLocalPosition(o: OrbitDef, t: number, out: Vector3): Vector3 {
  const a = o.phase + (TAU * t) / o.period;
  out.set(Math.cos(a) * o.radius, 0, Math.sin(a) * o.radius);
  out.applyAxisAngle(AX_X, o.inclination);
  out.applyAxisAngle(AX_Y, o.node);
  return out;
}

export type PositionTable = Record<string, Vector3>;

export function createPositionTable(defs: readonly BodyDef[]): PositionTable {
  const t: PositionTable = {};
  for (const d of defs) t[d.id] = new Vector3();
  return t;
}

const _tmp = new Vector3();

/**
 * 全天体のワールド位置(倍精度)を更新する。
 * defs は親が子より前に並んでいる必要がある。恒星(orbit なし)はワールド原点。
 */
export function updateBodyPositions(defs: readonly BodyDef[], t: number, table: PositionTable): void {
  for (const d of defs) {
    const p = table[d.id];
    if (!d.orbit) {
      p.set(0, 0, 0);
      continue;
    }
    orbitLocalPosition(d.orbit, t, _tmp);
    p.copy(table[d.orbit.parent]).add(_tmp);
  }
}

/** 数値差分による天体速度 [u/s] */
export function updateBodyVelocities(
  defs: readonly BodyDef[],
  t: number,
  positions: PositionTable,
  scratch: PositionTable,
  out: PositionTable,
  h = 0.25,
): void {
  updateBodyPositions(defs, t + h, scratch);
  for (const d of defs) {
    out[d.id].copy(scratch[d.id]).sub(positions[d.id]).multiplyScalar(1 / h);
  }
}
