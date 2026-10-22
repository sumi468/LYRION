import { Quaternion, Vector3 } from 'three';

/** セーブとは独立した姿勢制御。角速度はrad/s、bankは自動バンク角。 */
export interface AttitudeState { yawRate: number; pitchRate: number; rollRate: number; bank: number }
export const createAttitude = (): AttitudeState => ({ yawRate: 0, pitchRate: 0, rollRate: 0, bank: 0 });
export function resetAttitude(state: AttitudeState): void {
  state.yawRate = state.pitchRate = state.rollRate = state.bank = 0;
}
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const rotation = new Quaternion();
const integratedAngle = (rate: number, target: number, dt: number, decay: number) => target * dt + (rate - target) * (1 - decay) / 5.5;

/** 機首は慣性を持って旋回し、自動バンクは入力を離すと戻る。手動ロールは保持する。 */
export function stepAttitude(quat: Quaternion, state: AttitudeState, yaw: number, pitch: number, roll: number, dt: number): void {
  if (dt <= 0) return;
  const response = 5.5;
  const decay = Math.exp(-response * dt);
  // 指数応答の積分値を使い、30/60/144Hzで旋回量が変わらないようにする。
  const yawTarget = Math.max(-1.1, Math.min(1.1, yaw));
  const pitchTarget = Math.max(-0.9, Math.min(0.9, pitch));
  const rollTarget = Math.max(-1.4, Math.min(1.4, roll));
  quat.multiply(rotation.setFromAxisAngle(Y, integratedAngle(state.yawRate, yawTarget, dt, decay)));
  quat.multiply(rotation.setFromAxisAngle(X, integratedAngle(state.pitchRate, pitchTarget, dt, decay)));
  quat.multiply(rotation.setFromAxisAngle(Z, integratedAngle(state.rollRate, rollTarget, dt, decay))).normalize();
  state.yawRate = yawTarget + (state.yawRate - yawTarget) * decay;
  state.pitchRate = pitchTarget + (state.pitchRate - pitchTarget) * decay;
  state.rollRate = rollTarget + (state.rollRate - rollTarget) * decay;
  const targetBank = Math.max(-0.72, Math.min(0.72, state.yawRate * 0.68));
  state.bank += (targetBank - state.bank) * (1 - Math.exp(-dt * 4));
}

/** 自動バンクは表示姿勢に加える。保存する姿勢には含めず、再開時の傾き残留を防ぐ。 */
export function bankedQuaternion(heading: Quaternion, bank: number, out: Quaternion): Quaternion {
  return out.copy(heading).multiply(rotation.setFromAxisAngle(Z, bank));
}
