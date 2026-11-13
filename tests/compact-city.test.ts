import {describe,it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {BODY_DEFS,BODY_BY_ID,METRIC_V5_BODY_DEFS} from '../src/data/starSystem';
import {CITY_STOPS,SETTLEMENT_BUILDINGS,SETTLEMENT_SOLIDS,SETTLEMENT_ROADS,settlementDeckHeight,cityLandingRestricted,BUILDING_FLOOR_HEIGHT} from '../src/data/settlement';
import {BASE_SOLIDS} from '../src/data/surfaceCampaign';
import {createPositionTable,updateBodyPositions,updateBodyVelocities} from '../src/physics/orbits';
import {ReferenceFrame,orbitalFrame} from '../src/physics/frames';
import {updateSurfaceFrame} from '../src/physics/surfaceFrame';
import {PRIME_BASE_NORMAL,terrainHeight} from '../src/physics/terrain';
import {metricOrbit,bodyRotation,bodyPointVelocity} from '../src/physics/worldScale';
import {LEGACY_STATION_ORBIT,STATION_ORBIT} from '../src/data/homeworld';
import {serialize,deserialize,SaveManager,SAVE_KEY,COMPACT_BACKUP_KEY,SAVE_VERSION} from '../src/systems/save';
import {createNewState} from '../src/core/state';

function frames(defs:typeof BODY_DEFS,time:number){
 const p=createPositionTable(defs),v=createPositionTable(defs);updateBodyPositions(defs,time,p);updateBodyVelocities(defs,time,p,createPositionTable(defs),v);return{p,v};
}
describe('compact exploration world and complete city blocks',()=>{
 it('keeps planets and routes small without scaling ship-sized local metres',()=>{
  expect(BODY_BY_ID['lyrion-prime'].radius).toBe(5000);expect(BODY_BY_ID.cindra.radius).toBe(1200);
  expect(BODY_DEFS.every(b=>!b.orbit||b.orbit.radius<=500000)).toBe(true);expect(BODY_BY_ID.wayfarer.radius).toBe(5);
  expect(STATION_ORBIT.radius-BODY_BY_ID['lyrion-prime'].radius).toBe(5000);
 });
 it('provides more than 220 buildings with unique IDs and clear roads between the blocks',()=>{
  expect(SETTLEMENT_BUILDINGS.length).toBeGreaterThan(220);expect(new Set(SETTLEMENT_BUILDINGS.map(b=>b.id)).size).toBe(SETTLEMENT_BUILDINGS.length);
  for(let i=0;i<SETTLEMENT_BUILDINGS.length;i++){
   const b=SETTLEMENT_BUILDINGS[i];expect(cityLandingRestricted(b.x,b.z)).toBe(true);
   expect(SETTLEMENT_SOLIDS[i].max[1]).toBeGreaterThanOrEqual(b.floors*BUILDING_FLOOR_HEIGHT+(b.floors>22?7.2:1));
   for(const other of SETTLEMENT_BUILDINGS.slice(i+1))expect(Math.abs(b.x-other.x)>=(b.w+other.w)/2||Math.abs(b.z-other.z)>=(b.d+other.d)/2,`${b.id} intersects ${other.id}`).toBe(true);
   for(const r of SETTLEMENT_ROADS)expect(Math.abs(b.x-r.x)>=(b.w+r.w)/2||Math.abs(b.z-r.z)>=(b.d+r.d)/2,`${b.id} blocks a road`).toBe(true);
  }
 });
 it('keeps every shuttle landing clear of walls, with a physical walking surface',()=>{
  for(const stop of CITY_STOPS){
   expect(Number.isFinite(settlementDeckHeight(stop.x,stop.z))).toBe(true);
   for(const box of BASE_SOLIDS)expect(stop.x<box.min[0]-1||stop.x>box.max[0]+1||stop.z<box.min[2]-1||stop.z>box.max[2]+1,`${stop.id} inside a solid`).toBe(true);
  }
 });
 it('supports the whole metropolis on the same tangent ground as the streets',()=>{
  const body=BODY_BY_ID['lyrion-prime'],frame=new ReferenceFrame();updateSurfaceFrame(body,PRIME_BASE_NORMAL,0,new Vector3(),new Vector3(),frame);
  for(const [x,z] of [[0,0],[900,-1400],[-943,-1443],[500,-500]]){
   const direction=frame.toWorld(new Vector3(x,-.35,z),new Vector3()).normalize().applyQuaternion(bodyRotation(body,0,new Quaternion()).invert());
   const point=direction.clone().multiplyScalar(body.radius+terrainHeight(body,direction)).applyQuaternion(bodyRotation(body,0,new Quaternion()));
   expect(frame.toLocal(point,new Vector3()).y).toBeCloseTo(-.35,5);
  }
 });
});

describe('v5 to v6 save migration',()=>{
 it('keeps a flying pilot stationary relative to the new rotating planet',()=>{
  const time=733,old=frames(METRIC_V5_BODY_DEFS,time),now=frames(BODY_DEFS,time),previous=METRIC_V5_BODY_DEFS.find(b=>b.id==='cindra')!,current=BODY_BY_ID.cindra;
  const normal=new Vector3(.4,.7,.2).normalize(),s=createNewState();s.time=time;
  s.pos.copy(normal).applyQuaternion(bodyRotation(previous,time,new Quaternion())).multiplyScalar(previous.radius+1500).add(old.p.cindra);
  bodyPointVelocity(previous,s.pos,old.p.cindra,old.v.cindra,s.vel);
  const restored=deserialize({...serialize(s),version:5})!;
  expect(restored.pos.distanceTo(now.p.cindra)-current.radius).toBeCloseTo(1500,5);
  expect(restored.vel.distanceTo(bodyPointVelocity(current,restored.pos,now.p.cindra,now.v.cindra,new Vector3()))).toBeLessThan(.0001);
 });
 it.each([0,1234,45000])('preserves dock offsets, orientation, research and currency at t=%s',time=>{
  const old=frames(METRIC_V5_BODY_DEFS,time),now=frames(BODY_DEFS,time),previous=new ReferenceFrame(),current=new ReferenceFrame();
  orbitalFrame(previous,metricOrbit(LEGACY_STATION_ORBIT),time,old.p,old.v);orbitalFrame(current,STATION_ORBIT,time,now.p,now.v);
  const local=new Vector3(0,0,32.2),s=createNewState();s.time=time;s.pos.copy(previous.toWorld(local,new Vector3()));s.vel.copy(previous.pointVelocity(local,new Vector3()));s.quat.copy(previous.rotation);
  s.data=321;s.totalData=456;s.missionIndex=3;s.kills=9;s.homecoming.docked=true;s.homecoming.investigated['maintenance-panel']=time;
  const restored=deserialize({...serialize(s),version:5})!;
  expect(current.toLocal(restored.pos,new Vector3()).distanceTo(local)).toBeLessThan(.0001);expect(restored.vel.distanceTo(current.pointVelocity(local,new Vector3()))).toBeLessThan(.001);
  expect(restored.quat.angleTo(current.rotation)).toBeLessThan(1e-7);expect(restored.data).toBe(321);expect(restored.totalData).toBe(456);expect(restored.kills).toBe(9);expect(restored.missionIndex).toBe(3);expect(restored.homecoming.investigated['maintenance-panel']).toBe(time);
  const again=deserialize(serialize(restored))!;expect(again.pos.distanceTo(restored.pos)).toBe(0);expect(again.homecoming.docked).toBe(true);
 });
 it('retains metre-sized port parking offsets rather than shrinking them into the landing pad',()=>{
  const time=1234,old=frames(METRIC_V5_BODY_DEFS,time),now=frames(BODY_DEFS,time),previous=new ReferenceFrame(),current=new ReferenceFrame();
  updateSurfaceFrame(METRIC_V5_BODY_DEFS.find(b=>b.homeworld)!,PRIME_BASE_NORMAL,time,old.p['lyrion-prime'],old.v['lyrion-prime'],previous);
  updateSurfaceFrame(BODY_BY_ID['lyrion-prime'],PRIME_BASE_NORMAL,time,now.p['lyrion-prime'],now.v['lyrion-prime'],current);
  const local=new Vector3(400,50,50),s=createNewState();s.time=time;s.pos.copy(previous.toWorld(local,new Vector3()));s.vel.copy(previous.pointVelocity(local,new Vector3()));
  s.surfaceProgress.inspected=true;s.surfaceProgress.sampled=true;s.surfaceProgress.reported=true;s.surfaceProgress.rewarded=true;s.surfaceProgress.step=9;
  const restored=deserialize({...serialize(s),version:5})!;
  expect(current.toLocal(restored.pos,new Vector3()).distanceTo(local)).toBeLessThan(.001);expect(restored.surfaceProgress.rewarded).toBe(true);expect(restored.surfaceProgress.step).toBe(9);
 });
 it('backs up the exact previous save once before writing compact coordinates',()=>{
  const raw=JSON.stringify({...serialize(createNewState()),version:5}),data=new Map([[SAVE_KEY,raw]]);
  const manager=new SaveManager({getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}});
  const state=manager.load()!;expect(manager.save(state)).toBe(true);expect(data.get(COMPACT_BACKUP_KEY)).toBe(raw);expect(JSON.parse(data.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
  manager.save(state);expect(data.get(COMPACT_BACKUP_KEY)).toBe(raw);
 });
});
