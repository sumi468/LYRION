import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { CombatSystem, segmentHitsSphere } from '../src/systems/combat';
import { LandingSystem, canLand } from '../src/systems/landing';
import { createNewState } from '../src/core/state';
import { deserialize, serialize } from '../src/systems/save';
import { sanitizeSettings } from '../src/systems/settings';
import { BODY_BY_ID, BODY_DEFS } from '../src/data/starSystem';
import { createPositionTable, updateBodyPositions, updateBodyVelocities } from '../src/physics/orbits';

const pilot=()=>({pos:new Vector3(),vel:new Vector3(),quat:new Quaternion(),energy:100});
describe('戦闘',()=>{
  it('高速の弾がフレーム間で機体を飛び越しても命中を検出',()=>{
    expect(segmentHitsSphere(new Vector3(0,0,20),new Vector3(0,0,-20),new Vector3(),3)).toBe(true);
    expect(segmentHitsSphere(new Vector3(10,0,20),new Vector3(10,0,-20),new Vector3(),3)).toBe(false);
  });
  it('難易度で敵数・耐久が変わり、敵なしでは出現しない',()=>{
    for(const [difficulty,count,hp] of [['off',0,0],['easy',1,45],['normal',2,70],['hard',3,100]] as const){
      const combat=new CombatSystem();combat.spawn(pilot(),difficulty,[]);expect(combat.count).toBe(count);
      if(count)expect(combat.enemies[0].hp).toBe(hp);
    }
    expect(sanitizeSettings({difficulty:'impossible'}).difficulty).toBe('normal');
  });
  it('通常の射撃・命中処理で敵を撃破し報酬を得られる',()=>{
    const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'easy',[]);let kills=0,reward=0;
    for(let i=0;i<360;i++){const result=combat.step(1/60,ship,i/60,true,'easy',[]);kills+=result.kills;reward+=result.reward;}
    expect(kills).toBe(1);expect(reward).toBe(15);expect(ship.energy).toBeLessThan(100);
  });
  it('敵弾がパイロットへ届き、停止領域では弾と敵を解除',()=>{
    const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'hard',[]);let damage=0;
    for(let i=0;i<900;i++)damage+=combat.step(1/60,ship,i/60,false,'hard',[]).damage;
    expect(damage).toBeGreaterThan(0);
    combat.step(.1,ship,16,false,'hard',[],true);expect(combat.count).toBe(0);expect(combat.bolts.some(b=>b.active)).toBe(false);
  });
  it('長い連射でもプール上限を超えず、冷却すると射撃が復帰',()=>{
    const combat=new CombatSystem(),ship=pilot();let overheated=false;
    for(let i=0;i<600;i++){ship.energy=100;combat.step(1/60,ship,i/60,true,'easy',[]);overheated ||= combat.overheated;}
    expect(overheated).toBe(true);expect(combat.bolts.filter(b=>b.active).length).toBeLessThanOrEqual(96);
    combat.step(5,ship,16,false,'easy',[]);expect(combat.overheated).toBe(false);
  });
});

const landingSetup=()=>{
  const state=createNewState(),positions=createPositionTable(BODY_DEFS),scratch=createPositionTable(BODY_DEFS),velocities=createPositionTable(BODY_DEFS);
  updateBodyPositions(BODY_DEFS,0,positions);updateBodyVelocities(BODY_DEFS,0,positions,scratch,velocities);
  const def=BODY_BY_ID.cindra;state.pos.copy(positions.cindra).add(new Vector3(def.radius+80,0,0));state.vel.copy(velocities.cindra);
  return {state,positions,velocities,landing:new LandingSystem(),scratch};
};
describe('着陸とセーブ互換',()=>{
  it('固体天体のみ許可し、速度・距離条件で危険な開始を防ぐ',()=>{
    expect(canLand(BODY_BY_ID.aurelion)).toBe(false);expect(canLand(BODY_BY_ID.lyrion)).toBe(false);expect(canLand(BODY_BY_ID.thalassa)).toBe(true);
    const {state,positions,velocities,landing}=landingSetup();state.vel.x+=200;landing.request(state,positions,velocities);expect(landing.mode).toBe('flight');
    state.vel.copy(velocities.cindra);state.pos.x+=1000;landing.request(state,positions,velocities);expect(landing.mode).toBe('flight');
  });
  it('降下・接地・公転中の追従・離陸まで座標が有限で持続',()=>{
    const {state,positions,velocities,landing,scratch}=landingSetup();landing.request(state,positions,velocities);
    for(let i=0;i<1200;i++){state.time+=1/60;updateBodyPositions(BODY_DEFS,state.time,positions);updateBodyVelocities(BODY_DEFS,state.time,positions,scratch,velocities);landing.update(1/60,state,positions,velocities);}
    expect(landing.mode).toBe('landed');expect(state.landings.has('cindra')).toBe(true);
    expect(state.pos.distanceTo(positions.cindra)-BODY_BY_ID.cindra.radius).toBeCloseTo(3.65,5);
    expect(state.pos.toArray().every(Number.isFinite)).toBe(true);expect(state.quat.length()).toBeCloseTo(1);
    const restored=deserialize(serialize(state))!;expect(restored.landed?.bodyId).toBe('cindra');
    landing.request(state,positions,velocities);expect(landing.mode).toBe('flight');expect(state.landed).toBe(null);
    expect(state.pos.distanceTo(positions.cindra)).toBeGreaterThan(BODY_BY_ID.cindra.radius+50);
  });
  it('旧v1セーブの探査を保ち、新規項目を補い、不正な着陸記録を拒否',()=>{
    const raw:Record<string,unknown>={...serialize(createNewState()),version:1,data:123};
    delete raw.shield;delete raw.kills;delete raw.landings;delete raw.landed;
    const restored=deserialize(raw)!;expect(restored.data).toBe(123);expect(restored.shield).toBe(60);expect(restored.landed).toBe(null);
    raw.version=2;raw.landed={bodyId:'lyrion',normal:[1,0,0]};expect(deserialize(raw)!.landed).toBe(null);
    raw.landed={bodyId:'cindra',normal:[0,0,0]};expect(deserialize(raw)!.landed).toBe(null);
  });
  it('着陸可能な全7天体で接地できる',()=>{
    const defs=BODY_DEFS.filter(canLand);expect(defs).toHaveLength(7);
    for(const def of defs){
      const {state,positions,velocities,landing}=landingSetup();
      state.pos.copy(positions[def.id]).add(new Vector3(def.radius+40,0,0));state.vel.copy(velocities[def.id]);
      landing.request(state,positions,velocities);
      for(let i=0;i<600;i++)landing.update(1/60,state,positions,velocities);
      expect(landing.mode).toBe('landed');expect(state.landed?.bodyId).toBe(def.id);
    }
  });
});
