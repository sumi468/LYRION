import { Vector3 } from 'three';
import type { SolidBox } from '../data/homeworld';
import type { ReferenceFrame } from './frames';

const point = new Vector3(), velocity = new Vector3(), start = new Vector3(), end = new Vector3();
const candidate = new Vector3(), bestPoint = new Vector3();
function inside(p: Vector3, box: SolidBox, radius: number): boolean {
  return p.x>box.min[0]-radius+1e-7&&p.x<box.max[0]+radius-1e-7&&p.y>box.min[1]-radius+1e-7&&p.y<box.max[1]+radius-1e-7&&p.z>box.min[2]-radius+1e-7&&p.z<box.max[2]+radius-1e-7;
}

/** Resolve a moving sphere against simple local boxes, preserving the reference-frame velocity. */
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
  if(hit&&best<Infinity){frame.toWorld(bestPoint,worldPos);frame.pointVelocity(bestPoint,velocity);worldVel.copy(velocity);}
  return hit;
}

/** Clip the desired camera along its sight segment against inflated local boxes. */
export function clipCameraToBoxes(focus: Vector3, desired: Vector3, frame: ReferenceFrame, boxes: readonly SolidBox[], radius = .3): void {
  frame.toLocal(focus, start); frame.toLocal(desired, end);
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
    if (enter > 0 && enter <= exit && enter < nearest) nearest = Math.max(.1, enter - .04);
  }
  if (nearest < 1) desired.lerpVectors(focus, desired, nearest);
}
