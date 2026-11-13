import {it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {LandingSystem} from '../src/systems/landing';
import {createNewState} from '../src/core/state';
import {BODY_BY_ID,BODY_DEFS} from '../src/data/starSystem';
import {createPositionTable,updateBodyPositions,updateBodyVelocities} from '../src/physics/orbits';
import {ReferenceFrame} from '../src/physics/frames';
import {updateSurfaceFrame} from '../src/physics/surfaceFrame';
import {PRIME_BASE_NORMAL} from '../src/physics/terrain';
import {bodyPointVelocity,bodyRotation} from '../src/physics/worldScale';
import {BASE_SOLIDS} from '../src/data/surfaceCampaign';
import {collideEvaCapsule} from '../src/physics/localCollision';
const setup=(x=0,z=0,altitude=100)=>{
 const state=createNewState(),positions=createPositionTable(BODY_DEFS),velocities=createPositionTable(BODY_DEFS),body=BODY_BY_ID['lyrion-prime'],frame=new ReferenceFrame();
 state.time=835;updateBodyPositions(BODY_DEFS,state.time,positions);updateBodyVelocities(BODY_DEFS,state.time,positions,createPositionTable(BODY_DEFS),velocities);
 updateSurfaceFrame(body,PRIME_BASE_NORMAL,state.time,positions[body.id],velocities[body.id],frame);
 frame.toWorld(new Vector3(x,altitude,z),state.pos);bodyPointVelocity(body,state.pos,positions[body.id],velocities[body.id],state.vel);
 return{state,positions,velocities,frame,landing:new LandingSystem()};
};
it('shows PAD 01 readiness in the same rotating frame and uses it for the landing action',()=>{
 const {state,positions,velocities,landing}=setup(4,3);const a=landing.assess(state,positions,velocities);
 expect(a.padDistance).toBeCloseTo(5,5);expect(a.onPad).toBe(true);expect(a.relativeSpeed).toBeLessThan(.00001);expect(a.ready).toBe(true);
 const before=state.pos.clone();landing.request(state,positions,velocities);expect(landing.mode).toBe('approach');expect(state.pos.distanceTo(before)).toBe(0);
});
it.each([[-43,24],[-50,-332],[211,-335],[-317,-324]])('rejects a descent through buildings or utilities at %s,%s without changing pose', (x,z)=>{
 const {state,positions,velocities,landing}=setup(x,z,250),before=state.pos.clone();
 expect(landing.assess(state,positions,velocities).terrain).toBe('obstacle');expect(landing.request(state,positions,velocities)).toContain('建物');
 expect(landing.mode).toBe('flight');expect(state.pos.equals(before)).toBe(true);
});
it('permits open fields while distinguishing altitude, speed and sea rejection',()=>{
 const {state,positions,velocities,landing,frame}=setup(400,50);
 expect(landing.assess(state,positions,velocities).ready).toBe(true);expect(landing.assess(state,positions,velocities).onPad).toBe(false);
 state.vel.x+=101;expect(landing.request(state,positions,velocities)).toContain('100 m/s');
 frame.toWorld(new Vector3(0,600,0),state.pos);bodyPointVelocity(BODY_BY_ID['lyrion-prime'],state.pos,positions['lyrion-prime'],velocities['lyrion-prime'],state.vel);
 expect(landing.request(state,positions,velocities)).toContain('450');
 frame.toWorld(new Vector3(2500,150,0),state.pos);expect(landing.assess(state,positions,velocities).terrain).toBe('water');expect(landing.request(state,positions,velocities)).toContain('海面');
});
it('provides real exterior collisions in the town while keeping its boulevard clear',()=>{
 const {frame}=setup(),velocity=new Vector3(),position=new Vector3(),rotation=frame.rotation;
 frame.toWorld(new Vector3(-50,1.025,-332),position);expect(collideEvaCapsule(frame,position,velocity,rotation,BASE_SOLIDS)).toBe(true);
 frame.toWorld(new Vector3(0,1.025,-280),position);expect(collideEvaCapsule(frame,position,velocity,rotation,BASE_SOLIDS)).toBe(false);
});
it('recovers an old landed save under a new building without changing its progress or lateral location',()=>{
 const {state,positions,velocities,landing,frame}=setup(-50,-332,100),body=BODY_BY_ID['lyrion-prime'];
 const normal=state.pos.clone().sub(positions[body.id]).normalize().applyQuaternion(bodyRotation(body,state.time,new Quaternion()).invert());
 state.landed={bodyId:body.id,normal:[normal.x,normal.y,normal.z]};state.landings.add(body.id);state.data=237;state.hull=88;state.surfaceProgress.active=true;state.surfaceProgress.step=3;
 const progress=JSON.stringify(state.surfaceProgress);landing.restore(state.landed);landing.update(0,state,positions,velocities);const parked=frame.toLocal(state.pos,new Vector3());
 expect(landing.recoverObstructedSave(state,positions,velocities)).toBe(true);
 const local=frame.toLocal(state.pos,new Vector3());expect(local.y).toBeGreaterThan(60);expect(local.x).toBeCloseTo(parked.x,5);expect(local.z).toBeCloseTo(parked.z,5);
 expect(state.landed).toBeNull();expect(state.data).toBe(237);expect(state.hull).toBe(88);expect(JSON.stringify(state.surfaceProgress)).toBe(progress);expect(state.landings.has(body.id)).toBe(true);
});
it('leaves an unobstructed saved pad landing parked and repeat recovery is idempotent',()=>{
 const {state,positions,velocities,landing}=setup();landing.request(state,positions,velocities);for(let i=0;i<300;i++)landing.update(.05,state,positions,velocities);
 const before=state.pos.clone();expect(landing.recoverObstructedSave(state,positions,velocities)).toBe(false);expect(landing.recoverObstructedSave(state,positions,velocities)).toBe(false);
 expect(landing.mode).toBe('landed');expect(state.pos.distanceTo(before)).toBeLessThan(1e-6);
});
