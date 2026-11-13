import {describe,it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {LEGACY_BODY_DEFS as BODY_DEFS} from '../src/data/starSystem';
import {CELESTIAL_SCALE,bodyRotation,formatDistance,horizonDistance,metricBodies,migrateCompactPose} from '../src/physics/worldScale';
import {createPositionTable,updateBodyPositions,updateBodyVelocities} from '../src/physics/orbits';

describe('Metre-scale celestial contract',()=>{
 it('scales radii/orbits/rings together without scaling hardware or mutating source data',()=>{
  const old=JSON.stringify(BODY_DEFS),defs=metricBodies(BODY_DEFS),prime=defs.find(d=>d.homeworld)!;
  expect(prime.radius).toBe(3_100_000);expect(prime.orbit!.radius).toBe(111_000_000);
  expect(defs.find(d=>d.id==='wayfarer')!.radius).toBe(5);
  expect(defs.find(d=>d.ring)!.ring!.outer).toBe(BODY_DEFS.find(d=>d.ring)!.ring!.outer*CELESTIAL_SCALE);
  expect(prime.clouds!.height*prime.radius).toBeLessThanOrEqual(12_000);expect(JSON.stringify(BODY_DEFS)).toBe(old);
 });
 it('gives a physical kilometre-scale horizon and stable metre labels',()=>{
  expect(horizonDistance(3_100_000,1.72)).toBeGreaterThan(3_200);expect(horizonDistance(3_100_000,0)).toBe(0);
  expect(formatDistance(12)).toBe('12 m');expect(formatDistance(1_234)).toBe('1.2 km');expect(formatDistance(Infinity)).toBe('—');
 });
 it('uses the same tilted rotating surface frame on every update',()=>{
  const def=BODY_DEFS.find(d=>d.homeworld)!,q=new Quaternion(),n=new Vector3(0,1,0);
  bodyRotation(def,0,q);n.applyQuaternion(q);expect(n.x).toBeCloseTo(-Math.sin(def.axialTilt));
  const saved=bodyRotation(def,42,q).clone();bodyRotation(def,9000,q);bodyRotation(def,42,q);expect(q.angleTo(saved)).toBeLessThan(1e-7);
 });
 it('keeps near-surface clearance and relative velocity outside the larger sphere',()=>{
  const defs=metricBodies(BODY_DEFS),old=createPositionTable(BODY_DEFS),vel=createPositionTable(BODY_DEFS),now=createPositionTable(defs),nv=createPositionTable(defs),time=42;
  updateBodyPositions(BODY_DEFS,time,old);updateBodyPositions(defs,time,now);updateBodyVelocities(BODY_DEFS,time,old,createPositionTable(BODY_DEFS),vel);updateBodyVelocities(defs,time,now,createPositionTable(defs),nv);
  const body=BODY_DEFS.find(d=>d.id==='cindra')!,p=old.cindra.clone().add(new Vector3(0,body.radius+80,0)),v=vel.cindra.clone().add(new Vector3(3,0,-2));
  const r=migrateCompactPose(p,v,time,BODY_DEFS,defs);
  expect(r.reference).toBe('cindra');expect(r.position.distanceTo(now.cindra)-defs.find(d=>d.id==='cindra')!.radius).toBeCloseTo(80,6);
  expect(r.velocity.sub(nv.cindra).toArray()).toEqual([3,0,-2]);
 });
 it('keeps a nearby station hatch offset in metres rather than expanding it',()=>{
  const a={id:'asterion',oldPosition:new Vector3(1e6,0,0),position:new Vector3(1e10,0,0),oldVelocity:new Vector3(3,0,0),velocity:new Vector3(30_000,0,0),range:1_100};
  const r=migrateCompactPose(new Vector3(1e6+12,7,0),new Vector3(5,0,0),0,BODY_DEFS,metricBodies(BODY_DEFS),[a]);
  expect(r.reference).toBe('asterion');expect(r.position.clone().sub(a.position).toArray()).toEqual([12,7,0]);expect(r.velocity.toArray()).toEqual([30_002,0,0]);
 });
});
