import { Matrix4, Quaternion, Vector3 } from 'three';
import { BODY_BY_ID } from '../data/starSystem';
import { DEEP_ORBIT, SATELLITE_ORBIT, STATION_ORBIT, type FrameId } from '../data/homeworld';
import type { OrbitDef } from '../data/types';
import { orbitLocalPosition, type PositionTable } from './orbits';

const up = new Vector3(0, 1, 0), axisZ = new Vector3(0, 0, 1), zero = new Vector3();
const local = new Vector3(), future = new Vector3(), relative = new Vector3(), cross = new Vector3();
const matrix = new Matrix4(), nextRotation = new Quaternion(), inverse = new Quaternion(), delta = new Quaternion();
const H = .02;

/** Simulation-space reference frame. All values are absolute double-precision world coordinates. */
export class ReferenceFrame {
  readonly position = new Vector3();
  readonly rotation = new Quaternion();
  readonly velocity = new Vector3();
  readonly angularVelocity = new Vector3();

  toWorld(point: Vector3, out: Vector3): Vector3 { return out.copy(point).applyQuaternion(this.rotation).add(this.position); }
  toLocal(point: Vector3, out: Vector3): Vector3 { return out.copy(point).sub(this.position).applyQuaternion(inverse.copy(this.rotation).invert()); }
  pointVelocity(point: Vector3, out: Vector3): Vector3 {
    relative.copy(point).applyQuaternion(this.rotation);
    return out.copy(this.velocity).add(cross.crossVectors(this.angularVelocity, relative));
  }
}

function orbitalFrame(frame: ReferenceFrame, orbit: OrbitDef, time: number, positions: PositionTable, velocities: PositionTable): void {
  orbitLocalPosition(orbit, time, local);
  orbitLocalPosition(orbit, time + H, future);
  frame.position.copy(positions[orbit.parent]).add(local);
  frame.velocity.copy(future).sub(local).multiplyScalar(1 / H).add(velocities[orbit.parent]);
  matrix.lookAt(local, zero, up); frame.rotation.setFromRotationMatrix(matrix);
  matrix.lookAt(future, zero, up); nextRotation.setFromRotationMatrix(matrix);
  delta.copy(nextRotation).multiply(inverse.copy(frame.rotation).invert());
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  frame.angularVelocity.set(delta.x, delta.y, delta.z).multiplyScalar(2 / H);
}

export class ExpeditionFrames {
  readonly asterion = new ReferenceFrame();
  readonly wayfarer = new ReferenceFrame();
  readonly satellite = new ReferenceFrame();
  readonly deep = new ReferenceFrame();
  readonly inertial = new ReferenceFrame();

  get(id: FrameId): ReferenceFrame { return this[id]; }

  update(time: number, positions: PositionTable, velocities: PositionTable): void {
    orbitalFrame(this.asterion, STATION_ORBIT, time, positions, velocities);
    orbitalFrame(this.satellite, SATELLITE_ORBIT, time, positions, velocities);
    orbitalFrame(this.deep, DEEP_ORBIT, time, positions, velocities);
    const probe = BODY_BY_ID.wayfarer;
    this.wayfarer.position.copy(positions.wayfarer); this.wayfarer.velocity.copy(velocities.wayfarer);
    this.wayfarer.rotation.setFromAxisAngle(axisZ, probe.axialTilt).multiply(nextRotation.setFromAxisAngle(up, time * Math.PI * 2 / probe.rotationPeriod));
    this.wayfarer.angularVelocity.copy(up).applyAxisAngle(axisZ, probe.axialTilt).multiplyScalar(Math.PI * 2 / probe.rotationPeriod);
  }
}
