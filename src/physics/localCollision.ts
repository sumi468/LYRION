import { Vector3, type Quaternion } from 'three';
import type { SolidBox } from '../data/homeworld';
import type { ReferenceFrame } from './frames';

const point = new Vector3(), velocity = new Vector3(), start = new Vector3(), end = new Vector3();
const candidate = new Vector3(), bestPoint = new Vector3();
const contactNormal = new Vector3(), capsuleAxis = new Vector3(), capsulePoint = new Vector3(), capsuleBefore = new Vector3();
/** Hips-centred suit envelope: boots, torso, and helmet, rotated with the astronaut. */
export const EVA_CAPSULE_SAMPLES = [
  { y: -.70, radius: .65 }, { y: 0, radius: 1.02 }, { y: .72, radius: .38 },
] as const;
function inside(p: Vector3, box: SolidBox, radius: number): boolean {
  return p.x>box.min[0]-radius+1e-7&&p.x<box.max[0]+radius-1e-7&&p.y>box.min[1]-radius+1e-7&&p.y<box.max[1]+radius-1e-7&&p.z>box.min[2]-radius+1e-7&&p.z<box.max[2]+radius-1e-7;
}

/** Resolve a sphere against moving local boxes, removing only inward contact velocity. */
export function collideLocalBoxes(frame: ReferenceFrame, worldPos: Vector3, worldVel: Vector3, radius: number, boxes: readonly SolidBox[]): boolean {
  frame.toLocal(worldPos, point);
  let hit = false, best = Infinity;
  for(const box of boxes)if(inside(point,box,radius)){hit=true;break;}
  if(!hit)return false;
  for (const box of boxes) {
    if(inside(point,box,radius))hit=true;
    for(let axis=0;axis<3;axis++)for(let side=0;side<2;side++){
      candidate.copy(point).setComponent(axis,side?box.max[axis]+radius:box.min[axis]-radius);
      const distance=candidate.distanceToSquared(point);if(distance>=best)continue;
      let clear=true;for(const other of boxes)if(inside(candidate,other,radius)){clear=false;break;}
      if(clear){best=distance;bestPoint.copy(candidate);}
    }
  }
  if(hit&&best<Infinity){
    contactNormal.copy(bestPoint).sub(point).normalize().applyQuaternion(frame.rotation);
    frame.toWorld(bestPoint,worldPos);frame.pointVelocity(bestPoint,velocity);
    const inward=(worldVel.x-velocity.x)*contactNormal.x+(worldVel.y-velocity.y)*contactNormal.y+(worldVel.z-velocity.z)*contactNormal.z;
    if(inward<0)worldVel.addScaledVector(contactNormal,-inward);
  }
  return hit;
}

/** Lightweight oriented capsule. Repeated passes keep all three suit sections outside joined hulls. */
export function collideEvaCapsule(frame: ReferenceFrame, worldPos: Vector3, worldVel: Vector3, worldRotation: Quaternion, boxes: readonly SolidBox[]): boolean {
  capsuleAxis.set(0,1,0).applyQuaternion(worldRotation);
  let hit=false;
  for(let pass=0;pass<4;pass++){
    let corrected=false;
    for(const sample of EVA_CAPSULE_SAMPLES){
      capsuleBefore.copy(worldPos).addScaledVector(capsuleAxis,sample.y);capsulePoint.copy(capsuleBefore);
      if(collideLocalBoxes(frame,capsulePoint,worldVel,sample.radius,boxes)){
        worldPos.add(capsulePoint.sub(capsuleBefore));corrected=true;hit=true;
      }
    }
    if(!corrected)break;
  }
  return hit;
}

/** Clip the desired camera along its sight segment against inflated local boxes. */
export function clipCameraToBoxes(focus: Vector3, desired: Vector3, frame: ReferenceFrame, boxes: readonly SolidBox[], radius = .3): void {
  frame.toLocal(focus, start); frame.toLocal(desired, end);
  const segmentLength=start.distanceTo(end);
  if(segmentLength<1e-8)return;
  let nearest = 1;
  for (const box of boxes) {
    let enter = 0, exit = 1;
    for (let axis = 0; axis < 3; axis++) {
      const a = start.getComponent(axis), delta = end.getComponent(axis) - a;
      const min = box.min[axis] - radius, max = box.max[axis] + radius;
      if (Math.abs(delta) < 1e-8) { if (a < min || a > max) { enter = 2; break; } }
      else {
        const t1 = (min - a) / delta, t2 = (max - a) / delta;
        enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2));
      }
    }
    if (enter > 0 && enter <= exit && enter < nearest) nearest = Math.max(0, enter - .03/segmentLength);
  }
  if (nearest < 1) desired.lerpVectors(focus, desired, nearest);
}
