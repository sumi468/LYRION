import { describe,it,expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createNewState } from '../src/core/state';
import { INVESTIGATIONS, SHIP_SOLIDS, STATION_SOLIDS, SHIP_HATCH } from '../src/data/homeworld';
import { ReferenceFrame } from '../src/physics/frames';
import { EvaSystem, emptyEvaInput } from '../src/systems/eva';
import { collideEvaCapsule } from '../src/physics/localCollision';

function attemptReturn(start:Vector3,parked=new Vector3(0,0,32.2),rotation=new Quaternion()) {
  const ship=createNewState();ship.pos.copy(parked);ship.quat.copy(rotation);ship.vel.set(0,0,0);
  const frame=new ReferenceFrame(),shipFrame=new ReferenceFrame();shipFrame.position.copy(parked);shipFrame.rotation.copy(rotation);
  const eva=new EvaSystem();eva.launch(ship,'asterion',frame);eva.localPosition.copy(start);eva.localVelocity.set(0,0,0);eva.sync(ship,frame);
  collideEvaCapsule(frame,eva.position,eva.velocity,eva.rotation,STATION_SOLIDS);collideEvaCapsule(shipFrame,eva.position,eva.velocity,eva.rotation,SHIP_SOLIDS);eva.correctPosition(frame);
  const accepted=eva.returnToShip();let beforeBoard=Infinity,seconds=0;
  for(let i=0;i<1200&&eva.active&&accepted;i++){
    beforeBoard=eva.position.distanceTo(eva.hatchPosition);eva.step(.05,emptyEvaInput(),ship,frame);seconds+=.05;
    if(eva.active){collideEvaCapsule(frame,eva.position,eva.velocity,eva.rotation,STATION_SOLIDS);collideEvaCapsule(shipFrame,eva.position,eva.velocity,eva.rotation,SHIP_SOLIDS);eva.correctPosition(frame);}
  }
  return {eva,accepted,beforeBoard,seconds};
}

describe('Safe return-assist route regressions',()=>{
  it('does not board at the exterior waypoint while the real hatch is over100u away',()=>{
    const result=attemptReturn(new Vector3(100,9,0));
    expect(result.accepted).toBe(true);expect(result.eva.active).toBe(false);expect(result.beforeBoard).toBeLessThan(1.4);expect(result.seconds).toBeGreaterThan(10);
  });
  it('returns to a flying ship parked behind the station with an arbitrary orientation',()=>{
    const parked=new Vector3(100,9,-80),rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.8);
    const result=attemptReturn(new Vector3(112,9,-78),parked,rotation);
    expect(result.accepted).toBe(true);expect(result.eva.active).toBe(false);expect(result.beforeBoard).toBeLessThan(1.4);
  });
  it('routes around the underside of the pressure hull without stopping in the wall',()=>{
    const result=attemptReturn(new Vector3(0,-9,0));
    expect(result.accepted).toBe(true);expect(result.eva.active).toBe(false);expect(result.beforeBoard).toBeLessThan(1.4);expect(result.seconds).toBeLessThan(40);
  });
  it('returns safely from all six exterior station investigation sites',()=>{
    for(const def of INVESTIGATIONS.filter(d=>d.frame==='asterion')){
      const result=attemptReturn(new Vector3().fromArray(def.position));
      expect(result.accepted,def.id).toBe(true);expect(result.eva.active,def.id).toBe(false);expect(result.beforeBoard,def.id).toBeLessThan(1.4);
    }
  });
  it('only completes ordinary assist near the real hatch and lets Y cancel',()=>{
    const ship=createNewState();ship.pos.set(100,0,0);ship.quat.identity();ship.vel.set(0,0,0);const frame=new ReferenceFrame(),eva=new EvaSystem();
    eva.launch(ship,'inertial',frame);eva.localPosition.add(new Vector3(10,0,0));eva.sync(ship,frame);
    expect(eva.returnToShip()).toBe(true);expect(eva.returning).toBe(true);expect(eva.returnToShip()).toBe(false);expect(eva.active).toBe(true);expect(eva.routeBlocked).toBe(false);
    eva.localPosition.copy(eva.parkedPosition).add(new Vector3().fromArray(SHIP_HATCH));eva.sync(ship,frame);expect(eva.board()).toBe(true);
  });
});
