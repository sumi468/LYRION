import { describe,expect,it } from 'vitest';
import { Vector3 } from 'three';
import { createNewState } from '../src/core/state';
import { BODY_BY_ID,BODY_DEFS } from '../src/data/starSystem';
import { INVESTIGATIONS } from '../src/data/homeworld';
import { createPositionTable,updateBodyPositions,updateBodyVelocities } from '../src/physics/orbits';
import { HomecomingSystem } from '../src/systems/homecoming';
import { emptyEvaInput } from '../src/systems/eva';

function fixture(){
  const state=createNewState(),home=new HomecomingSystem();
  const positions=createPositionTable(BODY_DEFS),velocities=createPositionTable(BODY_DEFS),future=createPositionTable(BODY_DEFS);
  const refresh=()=>{updateBodyPositions(BODY_DEFS,state.time,positions);updateBodyVelocities(BODY_DEFS,state.time,positions,future,velocities);home.update(state.time,positions,velocities);};
  refresh();return {state,home,positions,velocities,refresh};
}

describe('EVA collision and investigation integration',()=>{
  it('preserves planetary surface sliding without enabling an unplanned return route',()=>{
    const {state,home,positions,velocities}=fixture(),radius=BODY_BY_ID.cindra.radius;
    state.pos.copy(positions.cindra).add(new Vector3(0,radius+40,0));state.vel.copy(velocities.cindra);home.measure(state);home.toggleEva(state);
    const eva=home.eva,frame=home.frames.get(eva.frameId);
    eva.position.copy(positions.cindra).add(new Vector3(0,radius+.5,0));frame.toLocal(eva.position,eva.localPosition);eva.localVelocity.set(2,-3,1);eva.stabilized=false;eva.sync(state,frame);
    home.step(0,state,emptyEvaInput());
    expect(eva.active).toBe(true);expect(eva.returning).toBe(false);expect(eva.returnRoute.length).toBe(0);
    expect(eva.position.distanceTo(positions.cindra)).toBeGreaterThanOrEqual(radius+1.35);
    const relative=eva.velocity.clone().sub(velocities.cindra);
    expect(relative.y).toBeCloseTo(0,8);expect(relative.x).toBeCloseTo(2,8);expect(relative.z).toBeCloseTo(1,8);
  });
  it('finishes WAYFARER recorder work while following its rotating local frame',()=>{
    const {state,home,refresh}=fixture(),frame=home.frames.wayfarer,parked=new Vector3(0,12,35);
    frame.toWorld(parked,state.pos);frame.pointVelocity(parked,state.vel);state.quat.copy(frame.rotation);home.measure(state);home.toggleEva(state);
    const eva=home.eva;expect(eva.active).toBe(true);expect(eva.frameId).toBe('wayfarer');
    frame.toLocal(home.points['wayfarer-recorder'],eva.localPosition);eva.localVelocity.set(0,0,0);eva.sync(state,frame);home.step(0,state,emptyEvaInput());
    expect(eva.returning).toBe(false);expect(home.investigate(state)).toContain('作業を開始');
    let maximumDistance=0;
    for(let step=0;step<110;step++){state.time+=.05;refresh();home.step(.05,state,emptyEvaInput());maximumDistance=Math.max(maximumDistance,home.distances['wayfarer-recorder']);}
    expect(maximumDistance).toBeLessThan(3.6);expect(state.homecoming.investigated['wayfarer-recorder']).toBeDefined();expect(eva.returning).toBe(false);
  });
  it('keeps all11 investigation work sites reachable with the complete suit envelope',()=>{
    for(const def of INVESTIGATIONS){
      const {state,home,refresh}=fixture(),frame=home.frames.get(def.frame),parked=def.frame==='asterion'?new Vector3(0,0,32.2):new Vector3(0,12,35);
      frame.toWorld(parked,state.pos);frame.pointVelocity(parked,state.vel);state.quat.copy(frame.rotation);home.measure(state);home.toggleEva(state);
      const eva=home.eva;expect(eva.active,def.id).toBe(true);expect(eva.frameId,def.id).toBe(def.frame);
      eva.localPosition.fromArray(def.position);eva.localVelocity.set(0,0,0);eva.sync(state,frame);home.step(0,state,emptyEvaInput());
      expect(home.distances[def.id],def.id).toBeLessThan(3.6);
      for(const other of INVESTIGATIONS)if(other.id!==def.id)state.homecoming.investigated[other.id]=1;
      expect(home.investigate(state),def.id).toContain('作業を開始');
      for(let step=0;step<Math.ceil((def.seconds+.2)/.05);step++){state.time+=.05;refresh();home.step(.05,state,emptyEvaInput());}
      expect(state.homecoming.investigated[def.id],def.id).toBeDefined();expect(eva.returning,def.id).toBe(false);
    }
  });
});
