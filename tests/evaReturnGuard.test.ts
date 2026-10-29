import { describe,it,expect } from 'vitest';
import { Vector3 } from 'three';
import { segmentIntersectsSphere } from '../src/physics/segmentSphere';
import { createNewState } from '../src/core/state';
import { BODY_BY_ID,BODY_DEFS } from '../src/data/starSystem';
import { createPositionTable,updateBodyPositions,updateBodyVelocities } from '../src/physics/orbits';
import { HomecomingSystem } from '../src/systems/homecoming';
import { emptyEvaInput } from '../src/systems/eva';

function fixture(){
  const state=createNewState(),home=new HomecomingSystem(),positions=createPositionTable(BODY_DEFS),velocities=createPositionTable(BODY_DEFS),future=createPositionTable(BODY_DEFS);
  const refresh=()=>{updateBodyPositions(BODY_DEFS,state.time,positions);updateBodyVelocities(BODY_DEFS,state.time,positions,future,velocities);home.update(state.time,positions,velocities);};
  refresh();const radius=BODY_BY_ID.cindra.radius;
  state.pos.copy(positions.cindra).add(new Vector3(0,radius+50,0));state.vel.copy(velocities.cindra);state.quat.identity();home.measure(state);home.toggleEva(state);
  const place=(y:number)=>{const e=home.eva,f=home.frames.get(e.frameId);e.position.copy(positions.cindra).add(new Vector3(0,y,0));f.toLocal(e.position,e.localPosition);e.localVelocity.set(0,0,0);e.sync(state,f);home.measure(state);};
  return {state,home,positions,refresh,radius,place};
}

describe('Planet-obstructed EVA return',()=>{
  it('detects crossing and contained segments while allowing tangents and outward surface departures',()=>{
    const c=new Vector3(100,20,-30),p=(x:number,y=0)=>new Vector3(x,y,0).add(c);
    expect(segmentIntersectsSphere(p(-5),p(5),c,2)).toBe(true);
    expect(segmentIntersectsSphere(p(-5,3),p(5,3),c,2)).toBe(false);
    expect(segmentIntersectsSphere(p(-5,2),p(5,2),c,2)).toBe(false);
    expect(segmentIntersectsSphere(p(2),p(5),c,2)).toBe(false);
    expect(segmentIntersectsSphere(p(2),p(-5),c,2)).toBe(true);
    expect(segmentIntersectsSphere(p(0),p(0),c,2)).toBe(true);
    expect(segmentIntersectsSphere(p(3),p(3),c,2)).toBe(false);
  });
  it('rejects a far-side route with its body name and leaves manual EVA controls available',()=>{
    const {state,home,radius,place}=fixture();place(-(radius+2));const e=home.eva,before=e.position.clone();
    expect(home.requestReturn()).toContain('シンドラが帰還経路を遮っています');expect(e.returning).toBe(false);expect(e.routeBlocked).toBe(true);expect(e.returnRoute.length).toBe(0);expect(e.position.equals(before)).toBe(true);
    const input=emptyEvaInput();input.side=1;for(let i=0;i<10;i++)home.step(.05,state,input);
    expect(e.active).toBe(true);expect(e.localVelocity.x).toBeGreaterThan(.1);
  });
  it('completes an unobstructed near-side route and keeps ordinary Y cancellation',()=>{
    const {state,home,refresh,radius,place}=fixture();place(radius+10);
    expect(home.requestReturn()).toContain('開始');expect(home.requestReturn()).toContain('中止');expect(home.eva.returning).toBe(false);expect(home.eva.routeBlocked).toBe(false);
    expect(home.requestReturn()).toContain('開始');let hatchDistance=Infinity;
    for(let i=0;i<1200&&home.eva.active;i++){hatchDistance=home.eva.position.distanceTo(home.eva.hatchPosition);state.time+=.05;refresh();home.step(.05,state,emptyEvaInput());}
    expect(home.eva.active).toBe(false);expect(hatchDistance).toBeLessThan(1.4);
  });
  it('cancels once if a moving planet or later movement obstructs an active assist',()=>{
    const {state,home,radius,place}=fixture();place(radius+10);expect(home.requestReturn()).toContain('開始');
    place(radius+.5);const first=home.step(0,state,emptyEvaInput());expect(first?.message).toContain('シンドラが帰還経路を遮っています');expect(home.eva.returning).toBe(false);expect(home.eva.routeBlocked).toBe(true);
    expect(home.step(0,state,emptyEvaInput())).toBeNull();expect(home.eva.active).toBe(true);
  });
  it('retains the three-second emergency recovery even behind a planet',()=>{
    const {state,home,radius,place}=fixture();place(-(radius+2));home.eva.oxygen=0;home.step(.05,state,emptyEvaInput());
    expect(home.eva.emergency).toBeGreaterThan(0);expect(home.requestReturn()).toContain('緊急回収中');expect(home.eva.returning).toBe(true);
    for(let i=0;i<62&&home.eva.active;i++)home.step(.05,state,emptyEvaInput());
    expect(home.eva.active).toBe(false);
  });
});
