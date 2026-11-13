import {it,expect} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {createPropulsion,updatePropulsion} from '../src/systems/propulsion';
import {computeShipStats,createUpgradeLevels} from '../src/systems/upgrades';
import {stepFlight,emptyInput} from '../src/physics/flight';
import {createAttitude} from '../src/physics/attitude';
it('distinguishes local boost, noncombat cruise and the continuous distance multiplier',()=>{
 const p=createPropulsion();updatePropulsion(p,100,100,true,false,true,4999,0,16);expect(p.mode).toBe('boost');expect(p.cruise).toBe(1);expect(p.drain).toBe(16);
 updatePropulsion(p,100,100,true,false,true,15000,0,16);expect(p.mode).toBe('cruise');expect(p.cruise).toBe(3);expect(p.drain).toBe(1);
 updatePropulsion(p,100,100,true,false,true,15000,3,16);expect(p.mode).toBe('boost');expect(p.cruise).toBe(1);
 updatePropulsion(p,100,100,true,false,true,1e12,0,16);expect(p.cruise).toBe(1500);
});
it('locks an empty boost until 15 percent energy and cannot activate while parked',()=>{
 const p=createPropulsion();updatePropulsion(p,0,200,true,false,true,0,0,16);expect(p.mode).toBe('charging');
 updatePropulsion(p,29.9,200,true,false,true,0,0,16);expect(p.active).toBe(false);
 updatePropulsion(p,30,200,true,false,true,0,0,16);expect(p.active).toBe(true);
 updatePropulsion(p,100,200,true,false,false,15000,0,16);expect(p.mode).toBe('parked');expect(p.drain).toBe(0);
});
it.each([true,false])('braking cancels thrust and boost, including simultaneous F/W/X (assist=%s)',assist=>{
 const p=createPropulsion();updatePropulsion(p,100,100,true,true,true,10000,0,16);expect(p.mode).toBe('braking');expect(p.active).toBe(false);expect(p.drain).toBe(0);
 const ship={pos:new Vector3(),vel:new Vector3(0,0,-100),quat:new Quaternion()},stats=computeShipStats(createUpgradeLevels()),input=emptyInput();
 input.thrust=1;input.boost=true;input.brake=true;
 const result=stepFlight(ship,input,stats,assist,new Vector3(),true,.1,createAttitude());
 expect(result.boosting).toBe(false);expect(result.relSpeed).toBeLessThan(100);
 ship.vel.set(0,0,0);stepFlight(ship,input,stats,assist,new Vector3(),true,.1,createAttitude());expect(ship.vel.length()).toBe(0);
});
