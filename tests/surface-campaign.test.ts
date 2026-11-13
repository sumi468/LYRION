import {it,expect} from 'vitest';
import {Vector3} from 'three';
import {createSurfaceProgress,advanceSurfaceCampaign,SurfaceResearch,sanitizeSurfaceProgress} from '../src/systems/surfaceCampaign';
import {FIRST_STEPS_REWARD,ORBIT_RETURN_ALTITUDE} from '../src/data/surfaceCampaign';
import {SAVE_KEY,SAVE_BACKUP_KEY,SAVE_VERSION,SaveManager,serialize,deserialize} from '../src/systems/save';
import {createNewState} from '../src/core/state';
import {BODY_BY_ID} from '../src/data/starSystem';
import {ReferenceFrame} from '../src/physics/frames';
import {PRIME_BASE_NORMAL} from '../src/physics/terrain';
import {updateSurfaceFrame} from '../src/physics/surfaceFrame';
import {SurfaceSystem} from '../src/systems/surface';
import {emptyEvaInput} from '../src/systems/eva';
import {LEGACY_BODY_DEFS,BODY_DEFS} from '../src/data/starSystem';
import {LEGACY_STATION_ORBIT,STATION_ORBIT,LEGACY_SATELLITE_ORBIT,SATELLITE_ORBIT,LEGACY_DEEP_ORBIT,DEEP_ORBIT} from '../src/data/homeworld';
import {createPositionTable,updateBodyPositions,updateBodyVelocities} from '../src/physics/orbits';
import {orbitalFrame} from '../src/physics/frames';
import {BASE_SOLIDS} from '../src/data/surfaceCampaign';
import {collideEvaCapsule} from '../src/physics/localCollision';
import {Quaternion} from 'three';
it('requires physical landing, walking, timed research, report, boarding and orbit; pays once',()=>{
 const p=createSurfaceProgress(),research=new SurfaceResearch();p.active=true;
 const c={nearPrime:true,altitude:1000,landedPrime:false,onFoot:false,grounded:false,walked:0};
 advanceSurfaceCampaign(p,c);expect(p.step).toBe(1);advanceSurfaceCampaign(p,c);expect(p.step).toBe(1);
 c.landedPrime=true;c.altitude=3.65;advanceSurfaceCampaign(p,c);c.onFoot=c.grounded=true;advanceSurfaceCampaign(p,c);c.walked=15;advanceSurfaceCampaign(p,c);expect(p.step).toBe(4);
 expect(research.request(p,true,8)).toContain('3.5');expect(research.active).toBe(false);
 research.request(p,true,2);research.update(1,p,true,2);expect(p.inspected).toBe(false);research.update(1,p,true,9);expect(research.active).toBe(false);
 for(const step of [4,5,6]){expect(p.step).toBe(step);research.request(p,true,2);research.update(6,p,true,2);advanceSurfaceCampaign(p,c);}
 expect(p.reported).toBe(true);c.onFoot=false;advanceSurfaceCampaign(p,c);expect(p.step).toBe(8);c.landedPrime=false;c.altitude=ORBIT_RETURN_ALTITUDE-1;expect(advanceSurfaceCampaign(p,c)).toBe(0);c.altitude=ORBIT_RETURN_ALTITUDE+1;
 expect(advanceSurfaceCampaign(p,c)).toBe(FIRST_STEPS_REWARD);expect(advanceSurfaceCampaign(p,c)).toBe(0);
 const state=createNewState();state.surfaceProgress=p;expect(advanceSurfaceCampaign(deserialize(serialize(state))!.surfaceProgress,c)).toBe(0);
 expect(sanitizeSurfaceProgress({step:9,reported:false}).step).toBe(4);
});
it('preserves the original compact save byte for byte before its first metric overwrite',()=>{
 const raw=JSON.stringify({...serialize(createNewState()),version:4,pos:[1000,2000,3000]});const data=new Map<string,string>([[SAVE_KEY,raw]]);
 const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
 const manager=new SaveManager(storage),state=manager.load()!;expect(state).not.toBeNull();expect(manager.save(state)).toBe(true);expect(data.get(SAVE_BACKUP_KEY)).toBe(raw);
 manager.save(state);expect(data.get(SAVE_BACKUP_KEY)).toBe(raw);expect(JSON.parse(data.get(SAVE_KEY)!).version).toBe(SAVE_VERSION);
});
it('settles the suit under gravity, walks in a rotating surface frame and reboards repeatedly',()=>{
 const state=createNewState(),body=BODY_BY_ID['lyrion-prime'],frame=new ReferenceFrame(),shipFrame=new ReferenceFrame(),ground=new SurfaceSystem();
 updateSurfaceFrame(body,PRIME_BASE_NORMAL,0,new Vector3(1e8,0,0),new Vector3(5,0,0),frame);
 state.pos.copy(frame.position).add(new Vector3(0,3.3,0).applyQuaternion(frame.rotation));state.quat.copy(frame.rotation);shipFrame.position.copy(state.pos);shipFrame.rotation.copy(state.quat);
 for(let cycle=0;cycle<10;cycle++){
  ground.launch(state,frame);for(let i=0;i<80;i++)ground.update(.05,state,emptyEvaInput(),body,new Vector3(1e8,0,0),frame,shipFrame);
  expect(ground.grounded).toBe(true);expect(ground.localVelocity.y).toBe(0);expect(ground.pose.position.toArray().every(Number.isFinite)).toBe(true);
  const input=emptyEvaInput();input.pitch=1;
  for(let i=0;i<20;i++)ground.update(.05,state,input,body,new Vector3(1e8,0,0),frame,shipFrame);
  const up=new Vector3(0,1,0).applyQuaternion(ground.bodyRotation),normal=new Vector3(0,1,0).applyQuaternion(frame.rotation);
  expect(up.dot(normal)).toBeCloseTo(1,10);expect(ground.pose.rotation.angleTo(ground.bodyRotation)).toBeGreaterThan(.6);
  // The hatch is reachable on foot: spawn lies just inside its boarding radius.
  expect(ground.board()).toBe(true);expect(ground.active).toBe(false);
 }
});
it('keeps station, satellite and deep-space local poses at nonzero save times',()=>{
 const time=1234,old=createPositionTable(LEGACY_BODY_DEFS),now=createPositionTable(BODY_DEFS),ov=createPositionTable(LEGACY_BODY_DEFS),nv=createPositionTable(BODY_DEFS);
 updateBodyPositions(LEGACY_BODY_DEFS,time,old);updateBodyPositions(BODY_DEFS,time,now);updateBodyVelocities(LEGACY_BODY_DEFS,time,old,createPositionTable(LEGACY_BODY_DEFS),ov);updateBodyVelocities(BODY_DEFS,time,now,createPositionTable(BODY_DEFS),nv);
 for(const [legacy,metric] of [[LEGACY_STATION_ORBIT,STATION_ORBIT],[LEGACY_SATELLITE_ORBIT,SATELLITE_ORBIT],[LEGACY_DEEP_ORBIT,DEEP_ORBIT]]){
  const previous=new ReferenceFrame(),current=new ReferenceFrame();orbitalFrame(previous,legacy,time,old,ov);orbitalFrame(current,metric,time,now,nv);
  const local=new Vector3(12,7,80),pose=previous.toWorld(local,new Vector3()),velocity=previous.pointVelocity(local,new Vector3());
  const state=deserialize({...serialize(createNewState()),version:4,time,pos:pose.toArray(),vel:velocity.toArray(),quat:previous.rotation.toArray()})!;
  expect(current.toLocal(state.pos,new Vector3()).distanceTo(local)).toBeLessThan(.00001);expect(state.quat.angleTo(current.rotation)).toBeLessThan(.00001);
 }
});
it('blocks the hangar side walls while leaving its central entrance walkable',()=>{
 const frame=new ReferenceFrame(),velocity=new Vector3(),rotation=new Quaternion();
 for(const x of [-21,0]){
  const position=new Vector3(x,1.025,54),before=position.clone();
  expect(collideEvaCapsule(frame,position,velocity,rotation,BASE_SOLIDS)).toBe(true);expect(position.distanceTo(before)).toBeGreaterThan(1);
  expect(position.y).toBeCloseTo(1.025,8);
 }
 expect(collideEvaCapsule(frame,new Vector3(-10.5,1.025,43),velocity,rotation,BASE_SOLIDS)).toBe(false);
});
