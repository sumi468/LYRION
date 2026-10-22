import { Quaternion, Vector3 } from 'three';
import type { ShipStats } from '../systems/upgrades';

/** 1フレーム分の操縦入力(すべて -1〜1、回転はそのフレームの角度[rad]) */
export interface FlightInput {
  thrust: number;
  strafe: number;
  lift: number;
  roll: number;
  boost: boolean;
  brake: boolean;
  yaw: number;
  pitch: number;
}

export interface ShipBody {
  pos: Vector3;
  vel: Vector3;
  quat: Quaternion;
}

export interface FlightResult {
  boosting: boolean;
  /** 基準系に対する相対速度 [u/s] */
  relSpeed: number;
}

export function emptyInput(): FlightInput {
  return { thrust: 0, strafe: 0, lift: 0, roll: 0, boost: false, brake: false, yaw: 0, pitch: 0 };
}

const AX_X = new Vector3(1, 0, 0);
const AX_Y = new Vector3(0, 1, 0);
const AX_Z = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _qi = new Quaternion();
const _a = new Vector3();
const _v = new Vector3();

/** 入力が無い軸は減衰させる(フライトアシスト) */
function assistDamp(v: number, input: number, rate: number, dt: number): number {
  if (Math.abs(input) < 0.01) return v * Math.exp(-rate * dt);
  // 進行方向と逆に入力している場合は制動を助ける
  if (Math.sign(input) !== Math.sign(v)) return v * Math.exp(-rate * 0.6 * dt);
  return v;
}

/**
 * 慣性飛行の1ステップ。
 * - 宇宙には空気抵抗が無いので、アシスト OFF では入力しない限り速度は保たれる。
 * - アシスト ON は、入力の無い軸の相対速度を減衰させ、巡航速度を超えた分は徐々に落とす。
 * - refVel は「基準系」(近くの天体の速度)。アシストは基準系に対する相対速度を減衰させるため、
 *   公転する天体のそばで停止すると天体と共に移動する。
 *
 * ship を直接更新する。boostAllowed が false ならブーストは無効。
 */
export function stepFlight(
  ship: ShipBody,
  input: FlightInput,
  stats: ShipStats,
  assist: boolean,
  refVel: Vector3,
  boostAllowed: boolean,
  dt: number,
): FlightResult {
  // --- 姿勢(ローカル軸まわりに回す) ---
  if (input.pitch !== 0) ship.quat.multiply(_q.setFromAxisAngle(AX_X, input.pitch));
  if (input.yaw !== 0) ship.quat.multiply(_q.setFromAxisAngle(AX_Y, input.yaw));
  if (input.roll !== 0) ship.quat.multiply(_q.setFromAxisAngle(AX_Z, input.roll * dt));
  ship.quat.normalize();

  const boosting = input.boost && boostAllowed;
  const fwdIn = boosting ? 1 : input.thrust;

  // --- 推力 ---
  const lateral = stats.thrust * 0.65;
  const fwdAccel = fwdIn >= 0 ? stats.thrust * (boosting ? stats.boostAccelMul : 1) : stats.thrust * 0.6;
  _a.set(input.strafe * lateral, input.lift * lateral, -fwdIn * fwdAccel).applyQuaternion(ship.quat);

  // 基準系に対する相対速度で計算する
  _v.copy(ship.vel).sub(refVel).addScaledVector(_a, dt);

  const cap = stats.maxSpeed * (boosting ? stats.boostSpeedMul : 1);

  if (assist) {
    _qi.copy(ship.quat).invert();
    _v.applyQuaternion(_qi);
    const rate = input.brake ? 4.5 : 0.9;
    _v.x = assistDamp(_v.x, input.strafe, rate, dt);
    _v.y = assistDamp(_v.y, input.lift, rate, dt);
    _v.z = assistDamp(_v.z, -fwdIn, rate, dt);
    _v.applyQuaternion(ship.quat);

    const sp = _v.length();
    if (sp > cap) {
      // 巡航上限を超えた分(ブースト後など)はゆっくり滑らかに落とす
      const target = cap + (sp - cap) * Math.exp(-1.6 * dt);
      _v.multiplyScalar(target / sp);
    }
  } else {
    if (input.brake) _v.multiplyScalar(Math.exp(-1.8 * dt));
    // 暴走防止の絶対上限
    const hard = stats.maxSpeed * stats.boostSpeedMul * 1.6;
    const sp = _v.length();
    if (sp > hard) _v.multiplyScalar(hard / sp);
  }

  const relSpeed = _v.length();
  ship.vel.copy(_v).add(refVel);
  ship.pos.addScaledVector(ship.vel, dt);
  return { boosting, relSpeed };
}

/** 一定距離ごとに原点を移し替える(Floating Origin)。移し替えたら true */
export function maybeRebaseOrigin(origin: Vector3, shipPos: Vector3, threshold = 1500): boolean {
  if (origin.distanceToSquared(shipPos) > threshold * threshold) {
    origin.copy(shipPos);
    return true;
  }
  return false;
}
