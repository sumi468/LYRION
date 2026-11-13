import {it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {ReferenceFrame} from '../src/physics/frames';
import {sweepLocalBoxes} from '../src/physics/localCollision';
import {BASE_SOLIDS} from '../src/data/surfaceCampaign';
import {settlementDeckHeight} from '../src/data/settlement';
it('stops a full-frame high speed ship crossing in a rotated, moving town frame',()=>{
 const frame=new ReferenceFrame();frame.position.set(1e8,-2e7,3e8);frame.rotation.setFromAxisAngle(new Vector3(1,2,3).normalize(),.7);frame.velocity.set(7,8,9);
 const from=frame.toWorld(new Vector3(-43,8,60),new Vector3()),to=frame.toWorld(new Vector3(-43,8,-60),new Vector3()),vel=new Vector3(0,0,-2400).applyQuaternion(frame.rotation).add(frame.velocity);
 const impact=sweepLocalBoxes(frame,from,to,vel,5,BASE_SOLIDS),local=frame.toLocal(to,new Vector3());
 expect(impact).toBeCloseTo(2400,5);expect(local.z).toBeGreaterThan(36);expect(local.z).toBeLessThan(36.1);expect(vel.distanceTo(frame.velocity)).toBeLessThan(.00001);
});
it('permits flight above the town and safely resolves old poses inside a wall',()=>{
 const frame=new ReferenceFrame(),from=new Vector3(-43,70,60),to=new Vector3(-43,70,-60),vel=new Vector3(0,0,-100);
 expect(sweepLocalBoxes(frame,from,to,vel,5,BASE_SOLIDS)).toBe(-1);expect(to.z).toBe(-60);
 from.set(-43,3,24);to.copy(from);expect(sweepLocalBoxes(frame,from,to,vel,5,BASE_SOLIDS)).toBeGreaterThanOrEqual(0);expect(to.distanceTo(from)).toBeGreaterThan(0);
});
it('keeps suit contact on the pad, apron, boulevard and unpaved terrain distinct',()=>{
 expect(settlementDeckHeight(0,0)).toBe(.365);expect(settlementDeckHeight(-10,-25)).toBe(-.12);
 expect(settlementDeckHeight(0,-250)).toBe(-.06);expect(settlementDeckHeight(400,40)).toBe(-.35);expect(settlementDeckHeight(3000,40)).toBe(-Infinity);
 // Rotation is owned by the shared reference frame, not a local world-Y plane.
 const frame=new ReferenceFrame();frame.rotation.copy(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),1));const p=new Vector3(0,.965,-250);
 expect(frame.toLocal(frame.toWorld(p,new Vector3()),new Vector3()).distanceTo(p)).toBeLessThan(1e-10);
});
