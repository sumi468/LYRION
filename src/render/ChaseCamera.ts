import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { CameraMode } from '../core/state';

const THIRD_OFFSET = new Vector3(0, 5.6, 23);
const FIRST_OFFSET = new Vector3(0, 0.85, -2.4);
const THIRD_PITCH = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.1);

const _tgt = new Vector3();
const _off = new Vector3();
const _q = new Quaternion();
const _qp = new Quaternion();
const _qi = new Quaternion();

/**
 * 三人称(追従)/一人称(コックピット)カメラ。
 * 計算はすべてワールド座標(倍精度)で行い、描画座標への変換(- origin)は呼び出し側が行う。
 * - 三人称: 船の後方オフセットをワールド空間で追従させ、旋回時に少し遅れて振られる。
 * - 速度に応じて後退距離と FOV が変化し、加速感を出す。
 */
export class ChaseCamera {
  readonly camera: PerspectiveCamera;
  baseFov = 70;
  private blend = 0;
  private offWorld = new Vector3();
  private quat = new Quaternion();
  private fov = 70;
  private ready = false;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(70, aspect, 0.6, 160000);
  }

  /** 次の update でスムージングなしに目標へ瞬間移動する(開始・ロード・テレポート時) */
  snap(): void {
    this.ready = false;
  }

  /**
   * @param speedFrac 巡航最高速度に対する速度比(0〜)
   * @param boost01 ブースト強度(0〜1、滑らか)
   * @param outWorld カメラのワールド位置が書き込まれる
   */
  update(
    dt: number,
    shipPos: Vector3,
    shipQuat: Quaternion,
    mode: CameraMode,
    speedFrac: number,
    boost01: number,
    outWorld: Vector3,
  ): void {
    const wantFirst = mode === 'first' ? 1 : 0;
    if (!this.ready) this.blend = wantFirst;
    else this.blend += (wantFirst - this.blend) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.blend - wantFirst) < 0.002) this.blend = wantFirst;

    // 三人称の目標オフセット(速度が上がるほど少し引く)
    _off.copy(THIRD_OFFSET);
    _off.z += Math.min(speedFrac, 3) * 3.5;
    _off.y += Math.min(speedFrac, 3) * 0.25;
    _tgt.copy(_off).applyQuaternion(shipQuat);
    if (!this.ready) this.offWorld.copy(_tgt);
    else this.offWorld.lerp(_tgt, 1 - Math.exp(-dt * 8));

    // 一人称の位置
    _off.copy(FIRST_OFFSET).applyQuaternion(shipQuat);

    // 位置合成
    outWorld.copy(this.offWorld).lerp(_off, this.blend).add(shipPos);

    // 姿勢
    _q.copy(shipQuat);
    if (this.blend < 1) _q.multiply(_qp.copy(THIRD_PITCH).slerp(_qi, this.blend));
    if (!this.ready) this.quat.copy(_q);
    else this.quat.slerp(_q, 1 - Math.exp(-dt * (this.blend > 0.5 ? 30 : 10)));
    this.camera.quaternion.copy(this.quat);

    // FOV: ブースト・高速で広がる
    const targetFov = this.baseFov + boost01 * 14 + Math.min(speedFrac, 2) * 3;
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.ready = true;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** 一人称にほぼ切り替わったか(船体の表示切替に使う) */
  get firstPersonAmount(): number {
    return this.blend;
  }
}
