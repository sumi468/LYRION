import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createAttitude, stepAttitude, bankedQuaternion } from '../src/physics/attitude';
import { emptyInput, stepFlight } from '../src/physics/flight';
import { computeShipStats, createUpgradeLevels } from '../src/systems/upgrades';
import { Input } from '../src/input/Input';
const stats=computeShipStats(createUpgradeLevels());
const reference=new Vector3();
const body=()=>({pos:new Vector3(),vel:new Vector3(),quat:new Quaternion()});

describe('バンク旋回と前後推力',()=>{
  it('A/Dは横推力ではなく機首の旋回を指示する',()=>{
    const keyboard=new Input();keyboard.enabled=true;keyboard.keys.add('KeyA');
    const input=keyboard.poll(1/60);
    expect(input.yaw).toBeGreaterThan(0);expect(input.thrust).toBe(0);
    expect('strafe' in input).toBe(false);expect('lift' in input).toBe(false);
    const ship=body(),attitude=createAttitude();
    for(let i=0;i<60;i++)stepFlight(ship,input,stats,true,reference,false,1/60,attitude);
    expect(ship.pos.length()).toBe(0);expect(ship.vel.length()).toBe(0);
    expect(attitude.bank).toBeGreaterThan(.4);
    expect(new Vector3(0,0,-1).applyQuaternion(ship.quat).x).toBeLessThan(-.5);
  });
  it('左右の旋回で逆方向に傾き、入力を離すとバンクが戻る',()=>{
    for(const sign of [-1,1]){
      const q=new Quaternion(),state=createAttitude();
      for(let i=0;i<90;i++)stepAttitude(q,state,sign,0,0,1/60);
      expect(state.bank*sign).toBeGreaterThan(.5);expect(Math.abs(state.bank)).toBeLessThanOrEqual(.72);
      const display=bankedQuaternion(q,state.bank,new Quaternion());
      const right=new Vector3(1,0,0).applyQuaternion(display).applyQuaternion(q.clone().invert());
      expect(right.y*sign).toBeGreaterThan(.4);
      for(let i=0;i<120;i++)stepAttitude(q,state,0,0,0,1/60);
      expect(Math.abs(state.bank)).toBeLessThan(.005);
    }
  });
  it('旋回の応答が30/60/144Hzでほぼ一致し、瞬時に最大角速度へ飛ばない',()=>{
    const states=[30,60,144].map((hz)=>{
      const q=new Quaternion(),state=createAttitude();
      stepAttitude(q,state,1,0,0,1/hz);expect(state.yawRate).toBeLessThan(.2);
      for(let i=1;i<hz*2;i++)stepAttitude(q,state,1,0,0,1/hz);
      return {q,state};
    });
    for(const result of states.slice(1)){
      expect(result.q.angleTo(states[0].q)).toBeLessThan(1e-6);
      expect(Math.abs(result.state.bank-states[0].state.bank)).toBeLessThan(.012);
    }
  });
  it('推進しながら旋回すると進路が曲がり、アシストOFFで速度の慣性を保つ',()=>{
    const ship=body(),attitude=createAttitude(),input={...emptyInput(),thrust:1,yaw:1};
    for(let i=0;i<90;i++)stepFlight(ship,input,stats,false,reference,false,1/60,attitude);
    expect(ship.pos.x).toBeLessThan(-20);expect(ship.pos.z).toBeLessThan(-20);
    const velocity=ship.vel.clone();input.thrust=0;input.yaw=0;
    for(let i=0;i<90;i++)stepFlight(ship,input,stats,false,reference,false,1/60,attitude);
    expect(ship.vel.distanceTo(velocity)).toBeLessThan(1e-7);
  });
});
