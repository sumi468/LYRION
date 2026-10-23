import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { CombatSystem, interceptTime, segmentHitsSphere } from '../src/systems/combat';
import { MAX_BOLTS } from '../src/data/combat';
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
    for(const [difficulty,count,hp] of [['off',0,0],['easy',1,65],['normal',3,160],['hard',5,210]] as const){
      const combat=new CombatSystem();combat.spawn(pilot(),difficulty,[]);expect(combat.count).toBe(count);
      if(count)expect(combat.enemies[0].hp).toBe(hp);
    }
    expect(sanitizeSettings({difficulty:'impossible'}).difficulty).toBe('normal');
  });
  it('通常の射撃・命中処理で敵を撃破し報酬を得られる',()=>{
    const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'easy',[]);let kills=0,reward=0;
    for(let i=0;i<360;i++){const result=combat.step(1/60,ship,i/60,true,'easy',[]);kills+=result.kills;reward+=result.reward;}
    expect(kills).toBe(1);expect(reward).toBe(20);expect(ship.energy).toBeLessThan(100);
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
    expect(overheated).toBe(true);expect(combat.bolts.filter(b=>b.active).length).toBeLessThanOrEqual(MAX_BOLTS);
    combat.step(5,ship,16,false,'easy',[]);expect(combat.overheated).toBe(false);
  });
});

describe('追撃と回避アクション',()=>{
  it('Normalは棒立ち連射で短時間に全滅せず、敵が回避と離脱を行う',()=>{
    const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'normal',[]);let kills=0,evaded=false,breakaway=false;
    for(let i=0;i<600;i++){
      kills+=combat.step(1/60,ship,i/60,true,'normal',[]).kills;
      evaded ||= combat.enemies.some(e=>e.evades>0);breakaway ||= combat.enemies.some(e=>e.mode==='break');
    }
    expect(kills).toBeLessThan(3);expect(combat.count).toBeGreaterThan(0);expect(evaded).toBe(true);expect(breakaway).toBe(true);
  });
  it('高速で逃げる機体を後方から追い続け、すぐ消滅しない',()=>{
    const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'normal',[]);let chased=false,boosted=false;
    for(let i=0;i<1200;i++){
      ship.vel.set(0,0,-Math.min(950,i*2));ship.pos.addScaledVector(ship.vel,1/60);
      combat.step(1/60,ship,i/60,false,'normal',[]);chased ||= combat.pursuers>0;boosted ||= combat.enemies.some(e=>e.boosting);
    }
    expect(chased).toBe(true);expect(boosted).toBe(true);expect(combat.count).toBe(3);
    expect(Math.min(...combat.enemies.filter(e=>e.active).map(e=>e.pos.distanceTo(ship.pos)))).toBeLessThan(1800);
  });
  it('射撃予告の後に連射し、戦闘が続くと後方から増援が来る',()=>{
    const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'normal',[]);let warned=false,shots=0,damage=0;
    for(let i=0;i<1440;i++){
      damage+=combat.step(1/60,ship,i/60,false,'normal',[]).damage;
      warned ||= combat.incoming>0;shots=Math.max(shots,combat.bolts.filter(b=>b.active&&b.hostile).length);
    }
    expect(warned).toBe(true);expect(shots).toBeGreaterThan(3);expect(damage).toBeGreaterThan(60);expect(combat.count).toBe(4);
  });
  it('回避ロールはコストと冷却があり、機体を横移動させない',()=>{
    const combat=new CombatSystem(),ship=pilot();
    expect(combat.tryDodge(ship)).toBe(true);expect(ship.energy).toBe(82);expect(combat.tryDodge(ship)).toBe(false);
    combat.step(.45,ship,0,true,'off',[]);expect(combat.rollAngle).toBeCloseTo(Math.PI);expect(ship.pos.length()).toBe(0);
    expect(combat.bolts.some(b=>b.active&&!b.hostile)).toBe(false);
    combat.step(6,ship,7,false,'off',[]);expect(combat.tryDodge(ship)).toBe(true);
    combat.reset();ship.energy=17;expect(combat.tryDodge(ship)).toBe(false);
  });
  it('相対速度を含む予測射撃で、横に動く標的へ正しい到達時間を求める',()=>{
    const relative=new Vector3(0,0,-500),velocity=new Vector3(100,0,0),t=interceptTime(relative,velocity,620);
    expect(relative.addScaledVector(velocity,t).length()).toBeCloseTo(620*t,5);
    expect(interceptTime(new Vector3(0,0,1),new Vector3(0,0,620),620)).toBeGreaterThan(0);
  });
  it('射撃予告に合わせた回避ロールは棒立ちより被弾を減らす',()=>{
    const run=(evade:boolean)=>{
      const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'normal',[]);let damage=0;
      for(let i=0;i<1200;i++){
        ship.energy=Math.min(100,ship.energy+5/60);
        if(evade&&combat.incoming>0)combat.tryDodge(ship);
        damage+=combat.step(1/60,ship,i/60,false,'normal',[]).damage;
      }
      return damage;
    };
    const stationary=run(false),evasive=run(true);
    expect(stationary).toBeGreaterThan(0);expect(evasive).toBeLessThan(stationary);
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
