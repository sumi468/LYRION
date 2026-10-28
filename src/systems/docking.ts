import { Quaternion, Vector3 } from 'three';
import { DOCK_SHIP } from '../data/homeworld';
import type { ShipBody } from '../physics/flight';
import type { ReferenceFrame } from '../physics/frames';

export type DockingMode = 'flight' | 'aligning' | 'docked' | 'undocking';
const local = new Vector3(), target = new Vector3().fromArray(DOCK_SHIP), step = new Vector3(), velocity = new Vector3();
const inverse = new Quaternion();

/** Forgiving approach corridor and a station-local attachment. No world-coordinate interpolation. */
export class DockingSystem {
  mode: DockingMode = 'flight';
  readonly localPosition = new Vector3();
  distance = Infinity;
  relativeSpeed = 0;

  measure(ship: ShipBody, frame: ReferenceFrame): void {
    frame.toLocal(ship.pos, local);
    this.distance = local.distanceTo(target);
    frame.pointVelocity(local, velocity);
    this.relativeSpeed = velocity.sub(ship.vel).length();
  }

  availability(ship: ShipBody, frame: ReferenceFrame): string | null {
    this.measure(ship, frame);
    if (this.distance > 150) return 'ドッキング誘導灯から150u以内へ接近してください';
    if (this.relativeSpeed > 18) return 'Xで基地との相対速度18u/s以下へ減速してください';
    frame.toLocal(ship.pos, local);
    if (local.z < 25 || Math.hypot(local.x, local.y) > 110) return '惑星と反対側のドッキング誘導灯へ回り込んでください';
    return null;
  }

  request(ship: ShipBody, frame: ReferenceFrame): string {
    if (this.mode === 'docked') { this.mode = 'undocking'; return '係留を解除。基地の外側へ自動離脱します'; }
    if (this.mode === 'aligning') {
      this.mode = 'flight'; frame.toLocal(ship.pos, local); frame.pointVelocity(local, ship.vel);
      return 'ドッキング支援を中止しました';
    }
    if (this.mode === 'undocking') return '離脱通路を通過中です';
    const unavailable = this.availability(ship, frame);
    if (unavailable) return unavailable;
    frame.toLocal(ship.pos, this.localPosition);
    this.mode = 'aligning';
    return '基地の誘導を受信。姿勢と相対速度を合わせています';
  }

  restore(docked: boolean, ship: ShipBody, frame: ReferenceFrame): void {
    this.mode = docked ? 'docked' : 'flight';
    if (docked) { this.localPosition.copy(target); this.update(0, ship, frame); }
    this.measure(ship, frame);
  }

  /** Returns a transition event; callers persist/reward these once, outside the render loop. */
  update(dt: number, ship: ShipBody, frame: ReferenceFrame): 'docked' | 'departed' | null {
    let event: 'docked' | 'departed' | null = null;
    if (this.mode === 'flight') { this.measure(ship, frame); return null; }
    step.set(0, 0, 0);
    if (this.mode === 'aligning') {
      step.copy(target).sub(this.localPosition);
      const distance = step.length();
      if (distance > 0) step.multiplyScalar(Math.min(distance, Math.min(22, distance * 2.2 + .08) * dt) / distance);
      this.localPosition.add(step);
      ship.quat.slerp(frame.rotation, 1 - Math.exp(-dt * 3));
      if (this.localPosition.distanceTo(target) < .09 && ship.quat.angleTo(frame.rotation) < .03) {
        this.localPosition.copy(target); ship.quat.copy(frame.rotation); this.mode = 'docked'; event = 'docked';
      }
    } else if (this.mode === 'undocking') {
      step.z = Math.min(18 * dt, 85 - this.localPosition.z);
      this.localPosition.z += step.z; ship.quat.copy(frame.rotation);
      if (this.localPosition.z >= 85 - 1e-6) { this.mode = 'flight'; event = 'departed'; }
    } else ship.quat.copy(frame.rotation);
    frame.toWorld(this.localPosition, ship.pos);
    frame.pointVelocity(this.localPosition, ship.vel);
    if (dt > 0 && this.mode !== 'docked') ship.vel.add(velocity.copy(step).applyQuaternion(frame.rotation).multiplyScalar(1 / dt));
    this.measure(ship, frame);
    return event;
  }
}

/** Preserve an inertial orientation relative to an attaching frame. */
export function relativeRotation(world: Quaternion, frame: Quaternion, out: Quaternion): Quaternion {
  return out.copy(inverse.copy(frame).invert()).multiply(world);
}
