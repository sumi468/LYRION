import { Euler, Quaternion, Vector3 } from 'three';
import { SHIP_HATCH, type FrameId } from '../data/homeworld';
import type { ShipBody } from '../physics/flight';
import type { ReferenceFrame } from '../physics/frames';
import { relativeRotation } from './docking';

export interface EvaInput { forward: number; side: number; up: number; yaw: number; pitch: number; brake: boolean }
export const emptyEvaInput = (): EvaInput => ({ forward: 0, side: 0, up: 0, yaw: 0, pitch: 0, brake: false });
export const EVA_OXYGEN = 360, EVA_MAX_SPEED = 6, EVA_WARNING_RANGE = 350, EVA_MAX_RANGE = 600;
const motion = new Vector3(), hatch = new Vector3(), goal = new Vector3(), inverse = new Quaternion();

/** Local-frame zero gravity. The spacecraft remains a separate, parked simulation body. */
export class EvaSystem {
  active = false;
  frameId: FrameId = 'inertial';
  oxygen = EVA_OXYGEN;
  stabilized = true;
  returning = false;
  emergency = 0;
  thrust = 0;
  distance = 0;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly rotation = new Quaternion();
  readonly localPosition = new Vector3();
  readonly localVelocity = new Vector3();
  readonly localRotation = new Quaternion();
  readonly parkedPosition = new Vector3();
  readonly parkedRotation = new Quaternion();
  readonly hatchPosition = new Vector3();
  private look = new Euler(0, 0, 0, 'YXZ');

  reset(): void { this.active = false; this.returning = false; this.emergency = 0; this.thrust = 0; }

  launch(ship: ShipBody, frameId: FrameId, frame: ReferenceFrame): void {
    this.reset(); this.active = true; this.frameId = frameId; this.oxygen = EVA_OXYGEN; this.stabilized = true;
    frame.toLocal(ship.pos, this.parkedPosition); relativeRotation(ship.quat, frame.rotation, this.parkedRotation);
    this.localPosition.copy(this.parkedPosition).add(hatch.fromArray(SHIP_HATCH).applyQuaternion(this.parkedRotation));
    this.localVelocity.set(0, 0, 0); this.localRotation.copy(this.parkedRotation);
    this.look.setFromQuaternion(this.localRotation, 'YXZ'); this.look.z = 0;
    this.sync(ship, frame);
  }

  sync(ship: ShipBody, frame: ReferenceFrame): void {
    frame.toWorld(this.parkedPosition, ship.pos); frame.pointVelocity(this.parkedPosition, ship.vel);
    ship.quat.copy(frame.rotation).multiply(this.parkedRotation);
    frame.toWorld(this.localPosition, this.position);
    this.rotation.copy(frame.rotation).multiply(this.localRotation);
    frame.pointVelocity(this.localPosition, this.velocity);
    this.velocity.add(motion.copy(this.localVelocity).applyQuaternion(frame.rotation));
    hatch.fromArray(SHIP_HATCH).applyQuaternion(this.parkedRotation).add(this.parkedPosition);
    frame.toWorld(hatch, this.hatchPosition);
    this.distance = this.position.distanceTo(ship.pos);
  }

  canBoard(): boolean { return this.position.distanceTo(this.hatchPosition) <= 4; }
  board(force = false): boolean {
    if (!this.active || (!force && !this.canBoard())) return false;
    this.reset(); return true;
  }
  returnToShip(): void { if (this.active) this.returning = !this.returning; }

  /** True means emergency or assisted retrieval completed; callers switch controls and save. */
  step(dt: number, input: EvaInput, ship: ShipBody, frame: ReferenceFrame): boolean {
    if (!this.active) return false;
    this.oxygen = Math.max(0, this.oxygen - dt);
    this.look.y += input.yaw * dt; this.look.x = Math.max(-1.4, Math.min(1.4, this.look.x + input.pitch * dt));
    this.localRotation.setFromEuler(this.look);
    if ((this.oxygen <= 0 || this.distance > EVA_MAX_RANGE) && this.emergency === 0) { this.emergency = 3; this.returning = true; }
    if (this.emergency > 0) {
      this.emergency = Math.max(0, this.emergency - dt);
      if (this.emergency <= 0) { this.board(true); return true; }
    }
    if (this.returning) {
      goal.fromArray(SHIP_HATCH).applyQuaternion(this.parkedRotation).add(this.parkedPosition);
      // Route around the pressure hull before crossing to the docked ship's hatch.
      if(this.frameId==='asterion'&&this.localPosition.z<27.8){
        goal.set(this.localPosition.x,this.localPosition.y,29);
        if(Math.abs(goal.x)<15&&Math.abs(goal.y)<7)goal.y=this.localPosition.y<0?-7:7;
      }
      motion.copy(goal).sub(this.localPosition);
      const distance = motion.length();
      this.localVelocity.copy(motion).multiplyScalar(distance > .001 ? Math.min(9, distance * 2) / distance : 0);
      this.thrust = .7;
      if (distance < 1.4) { this.board(true); return true; }
    } else {
      motion.set(input.side, input.up, -input.forward);
      const power = Math.min(1, motion.length());
      if (motion.lengthSq() > 1) motion.normalize();
      motion.applyQuaternion(this.localRotation);
      this.localVelocity.addScaledVector(motion, 4.8 * dt);
      if (input.brake || (this.stabilized && power < .02)) this.localVelocity.multiplyScalar(Math.exp(-dt * (input.brake ? 7 : 2.2)));
      if (this.localVelocity.lengthSq() > EVA_MAX_SPEED ** 2) this.localVelocity.setLength(EVA_MAX_SPEED);
      this.thrust = power;
    }
    this.localPosition.addScaledVector(this.localVelocity, dt);
    this.sync(ship, frame);
    return false;
  }

  /** Synchronise a collision correction back into local coordinates. */
  correctPosition(frame: ReferenceFrame): void {
    frame.toLocal(this.position, this.localPosition);
    this.localVelocity.copy(this.velocity).sub(frame.pointVelocity(this.localPosition, motion)).applyQuaternion(inverse.copy(frame.rotation).invert());
  }
}
