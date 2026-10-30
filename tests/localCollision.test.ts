import { describe,expect,it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { ReferenceFrame } from '../src/physics/frames';
import { collideEvaCapsule, collideLocalBoxes, clipCameraToBoxes, EVA_CAPSULE_SAMPLES } from '../src/physics/localCollision';
import { STATION_SOLIDS, type SolidBox } from '../src/data/homeworld';

const box:readonly SolidBox[]=[{min:[-2,-2,-2],max:[2,2,2]}];
describe('Contact stability regression',()=>{
  it('slides along a moving rotated wall while cancelling only inward normal speed',()=>{
    const f=new ReferenceFrame();f.position.set(500,3,-60);f.rotation.setFromAxisAngle(new Vector3(0,1,0),.7);f.velocity.set(5,-2,3);f.angularVelocity.set(0,.2,0);
    const local=new Vector3(2.1,0,0),p=f.toWorld(local,new Vector3()),v=f.pointVelocity(local,new Vector3()).add(new Vector3(-3,0,2).applyQuaternion(f.rotation));
    const tangent=new Vector3(0,0,1).applyQuaternion(f.rotation),normal=new Vector3(1,0,0).applyQuaternion(f.rotation),before=v.dot(tangent);
    expect(collideLocalBoxes(f,p,v,.4,box)).toBe(true);
    expect(v.dot(tangent)).toBeCloseTo(before,10);
    const corrected=f.toLocal(p,new Vector3()),frameVel=f.pointVelocity(corrected,new Vector3());
    expect(v.clone().sub(frameVel).dot(normal)).toBeCloseTo(0,10);
    expect(corrected.x).toBeCloseTo(2.4,10);
  });
  it('keeps outward velocity when resolving an existing overlap',()=>{
    const f=new ReferenceFrame(),p=new Vector3(2.1,0,0),v=new Vector3(3,1,2);
    collideLocalBoxes(f,p,v,.4,box);expect(v.toArray()).toEqual([3,1,2]);
  });
  it('keeps boots above the station deck instead of testing only the torso',()=>{
    const f=new ReferenceFrame(),p=new Vector3(0,3.6,0),v=new Vector3(0,-2,1),q=new Quaternion();
    expect(collideEvaCapsule(f,p,v,q,STATION_SOLIDS)).toBe(true);
    // Conservative boot sphere also covers its toe corners when the whole suit pitches.
    expect(p.y-1.35).toBeGreaterThanOrEqual(3.1-1e-8);
    expect(v.y).toBeCloseTo(0);expect(v.z).toBeCloseTo(1);
  });
  it('rotates the suit envelope with posture and clears every section of a moving hull',()=>{
    const f=new ReferenceFrame();f.position.set(1000,-300,700);f.rotation.setFromAxisAngle(new Vector3(0,1,0),1.2);
    const localRotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2),q=f.rotation.clone().multiply(localRotation),axis=new Vector3(0,1,0).applyQuaternion(q);
    const p=f.toWorld(new Vector3(3.6,0,8),new Vector3()),v=new Vector3();
    expect(collideEvaCapsule(f,p,v,q,STATION_SOLIDS)).toBe(true);
    for(const s of EVA_CAPSULE_SAMPLES){const sample=p.clone().addScaledVector(axis,s.y);expect(collideLocalBoxes(f,sample,new Vector3(),s.radius,STATION_SOLIDS)).toBe(false);}
  });
  it('does not move a suit in free space',()=>{
    const f=new ReferenceFrame(),p=new Vector3(200,30,70),v=new Vector3(1,2,3),before=p.clone();
    expect(collideEvaCapsule(f,p,v,new Quaternion(),STATION_SOLIDS)).toBe(false);expect(p.equals(before)).toBe(true);expect(v.toArray()).toEqual([1,2,3]);
  });
  it('covers the measured work hand and pitched boot corners at a station sidewall',()=>{
    // Actual model extrema from the animated geometry sweep, expressed relative to hips.
    const witnesses=[new Vector3(.50136,.46176,-.72782),new Vector3(.41796,-1.07129,-.22015)];
    for(const witness of witnesses){
      const f=new ReferenceFrame(),q=new Quaternion().setFromUnitVectors(witness.clone().normalize(),new Vector3(-1,0,0));
      const p=new Vector3(3.52,0,8),v=new Vector3();
      collideEvaCapsule(f,p,v,q,STATION_SOLIDS);
      expect(witness.clone().applyQuaternion(q).add(p).x).toBeGreaterThan(3.1);
    }
  });
});
describe('Close-wall EVA camera regression',()=>{
  it('allows less than ten percent of the desired boom to preserve physical camera clearance',()=>{
    const f=new ReferenceFrame(),focus=new Vector3(3.52,0,8),desired=new Vector3(-.28,.7,8);
    clipCameraToBoxes(focus,desired,f,STATION_SOLIDS,.3);
    expect(desired.x-3.1).toBeGreaterThanOrEqual(.3);
    expect(focus.distanceTo(desired)).toBeLessThan(.2);
  });
  it('preserves the same clearance after frame translation and rotation',()=>{
    const f=new ReferenceFrame();f.position.set(10000,-20,400);f.rotation.setFromAxisAngle(new Vector3(0,1,0),.9);
    const focus=f.toWorld(new Vector3(3.52,0,8),new Vector3()),desired=f.toWorld(new Vector3(-.28,.7,8),new Vector3());
    clipCameraToBoxes(focus,desired,f,STATION_SOLIDS,.3);
    expect(f.toLocal(desired,new Vector3()).x-3.1).toBeGreaterThanOrEqual(.3-1e-8);
  });
  it('leaves an unobstructed camera and a zero-length boom unchanged',()=>{
    const f=new ReferenceFrame(),focus=new Vector3(20,20,20),desired=new Vector3(25,25,25),before=desired.clone();
    clipCameraToBoxes(focus,desired,f,STATION_SOLIDS);expect(desired.equals(before)).toBe(true);
    clipCameraToBoxes(focus,focus,f,STATION_SOLIDS);expect(focus.toArray()).toEqual([20,20,20]);
  });
});
