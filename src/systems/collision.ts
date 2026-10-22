import { Vector3 } from 'three';

export interface CollisionResult {
  hit: boolean;
  /** 衝突面に垂直な接近速度 [u/s](衝突しなければ 0) */
  impact: number;
}

const _n = new Vector3();
const _rv = new Vector3();

/**
 * 船(球)と天体(球)の衝突を解決する。pos/vel を直接更新する。
 * - 食い込みは法線方向へ押し戻す
 * - 接近速度成分を反発係数 e で反転(天体の速度を基準にした相対速度で計算)
 */
export function resolveSphereCollision(
  pos: Vector3,
  vel: Vector3,
  center: Vector3,
  centerVel: Vector3,
  radius: number,
  shipRadius: number,
  restitution = 0.35,
): CollisionResult {
  const min = radius + shipRadius;
  _n.copy(pos).sub(center);
  const d2 = _n.lengthSq();
  if (d2 >= min * min) return { hit: false, impact: 0 };
  const d = Math.sqrt(d2);
  if (d < 1e-6) _n.set(0, 1, 0);
  else _n.multiplyScalar(1 / d);
  pos.copy(center).addScaledVector(_n, min);
  _rv.copy(vel).sub(centerVel);
  const vn = _rv.dot(_n);
  if (vn >= 0) return { hit: true, impact: 0 };
  _rv.addScaledVector(_n, -(1 + restitution) * vn);
  vel.copy(_rv).add(centerVel);
  return { hit: true, impact: -vn };
}

/** 衝突速度から船体ダメージを求める(低速の接触では傷つかない) */
export function impactDamage(impact: number): number {
  return Math.max(0, impact - 22) * 0.32;
}

/** 恒星の熱ダメージ [hull/s]。表面からの距離 h が zone 以内で、近いほど強い */
export function heatDamagePerSecond(surfaceDistance: number, zone: number): number {
  if (surfaceDistance >= zone) return 0;
  const f = 1 - Math.max(0, surfaceDistance) / zone;
  return 4 + 40 * f * f;
}
