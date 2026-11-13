import {describe,expect,it} from 'vitest';
import {Quaternion,Vector3} from 'three';
import {CombatSystem,interceptTime,type WorldCollider} from '../src/systems/combat';
import {WEAPON_RANGE} from '../src/data/combat';
import {DEFAULT_SETTINGS,loadSettings,sanitizeSettings,saveSettings,SETTINGS_KEY} from '../src/systems/settings';

const pilot=()=>({pos:new Vector3(),vel:new Vector3(),quat:new Quaternion(),energy:100});
function arena(){
 const combat=new CombatSystem(),ship=pilot();combat.spawn(ship,'normal',[]);
 for(const enemy of combat.enemies)enemy.active=false;
 const place=(index:number,angle:number,distance=500)=>{
  const enemy=combat.enemies[index];enemy.active=true;enemy.hp=enemy.maxHp=160;enemy.shield=enemy.maxShield=0;
  enemy.pos.set(Math.sin(angle*Math.PI/180)*distance,0,-Math.cos(angle*Math.PI/180)*distance);enemy.vel.set(0,0,0);enemy.cooldown=enemy.dodgeCooldown=enemy.modeTime=100;
  enemy.mode='attack';return enemy;
 };
 return{combat,ship,place};
}
describe('predictive auto aim',()=>{
 it('passively locks a forward enemy but does not fire or consume energy for the player',()=>{
  const {combat,ship,place}=arena();place(0,20);combat.step(0,ship,0,false,'normal',[],false,true);
  expect(combat.aimTargetId).toBe(0);expect(combat.aimLocked).toBe(true);expect(combat.aimPoint.distanceTo(combat.enemies[0].pos)).toBeLessThan(1e-8);
  expect(combat.bolts.some(b=>b.active)).toBe(false);expect(ship.energy).toBe(100);
 });
 it.each([[26,500],[180,500],[0,WEAPON_RANGE+1]])('does not acquire an enemy at %s degrees and %s metres',(angle,distance)=>{
  const {combat,ship,place}=arena();place(0,angle,distance);combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimTargetId).toBeNull();
 });
 it('retains one target when a second crosses the reticle and only switches beyond the retention cone',()=>{
  const {combat,ship,place}=arena();place(0,20);place(1,22);combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimTargetId).toBe(0);
  place(1,0);place(0,29);combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimTargetId).toBe(0);
  place(0,31);combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimTargetId).toBe(1);
 });
 it('refuses target and predicted shot paths hidden by a world, but ignores worlds behind the enemy',()=>{
  const {combat,ship,place}=arena();const enemy=place(0,0);
  const blocker:WorldCollider={pos:new Vector3(0,0,-250),radius:35};combat.step(0,ship,0,false,'normal',[blocker],false,true);expect(combat.aimLocked).toBe(false);
  blocker.pos.set(0,0,-700);combat.step(0,ship,0,false,'normal',[blocker],false,true);expect(combat.aimLocked).toBe(true);
  enemy.vel.set(400,0,0);blocker.pos.set(90,0,-250);blocker.radius=20;combat.step(0,ship,0,false,'normal',[blocker],false,true);expect(combat.aimLocked).toBe(false);
 });
 it('computes predictive projectile direction relative to inherited ship velocity, without changing the ship',()=>{
  const {combat,ship,place}=arena(),enemy=place(0,17);enemy.vel.set(100,0,0);ship.vel.set(40,0,0);
  const relative=enemy.pos.clone().sub(ship.pos),change=enemy.vel.clone().sub(ship.vel),time=interceptTime(relative,change,1150),aim=relative.addScaledVector(change,time).normalize(),rotation=ship.quat.clone();
  combat.step(0,ship,0,true,'normal',[],false,true);
  const bolts=combat.bolts.filter(b=>b.active&&!b.hostile);expect(bolts).toHaveLength(2);
  for(const bolt of bolts){expect(bolt.vel.clone().sub(ship.vel).normalize().dot(aim)).toBeCloseTo(1,10);expect(bolt.damage).toBe(12);expect(bolt.life).toBe(1.25);}
  expect(ship.energy).toBe(98);expect(ship.quat.equals(rotation)).toBe(true);expect(ship.pos.length()).toBe(0);
 });
 it('does not advertise an interception beyond projectile lifetime or for an enemy escaping faster than its bolts',()=>{
  for(const velocity of [new Vector3(0,0,-1000),new Vector3(0,0,-1300)]){
   const {combat,ship,place}=arena();place(0,0,1200).vel.copy(velocity);combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimLocked).toBe(false);
  }
 });
 it('clears on disable, death, reset, respawn, safety and lost line of sight',()=>{
  const {combat,ship,place}=arena();const acquire=()=>{place(0,10);combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimLocked).toBe(true);};
  acquire();combat.step(0,ship,0,false,'normal',[],false,false);expect(combat.aimTargetId).toBeNull();
  acquire();combat.clearAimLock();expect(combat.aimTargetId).toBeNull();
  acquire();combat.enemies[0].hp=0;combat.step(0,ship,0,false,'normal',[],false,true);expect(combat.aimTargetId).toBeNull();
  acquire();combat.reset();expect(combat.aimTargetId).toBeNull();
  acquire();combat.spawn(ship,'normal',[]);expect(combat.aimTargetId).toBeNull();for(const e of combat.enemies)e.active=false;
  acquire();combat.step(0,ship,0,false,'normal',[],true,true);expect(combat.aimTargetId).toBeNull();
  acquire();combat.step(0,ship,0,false,'normal',[{pos:combat.enemies[0].pos.clone().multiplyScalar(.5),radius:50}],false,true);expect(combat.aimTargetId).toBeNull();
 });
 it('preserves the legacy narrow assist when disabled and does not turn broad targets into manual hits',()=>{
  const {combat,ship,place}=arena();place(0,20);combat.step(0,ship,0,true,'normal',[],false,false);
  expect(combat.aimTargetId).toBeNull();const bolt=combat.bolts.find(b=>b.active&&!b.hostile)!;expect(bolt.vel.x).toBe(0);expect(bolt.vel.z).toBe(-1150);
 });
 it('uses real projectile collisions for an off-centre target rather than applying immediate damage',()=>{
  const run=(auto:boolean)=>{
   const {combat,ship,place}=arena();const enemy=place(0,20,400);enemy.dodgeCooldown=100;
   let hpAfterFirst=0;for(let i=0;i<60;i++){combat.step(1/60,ship,i/60,true,'normal',[],false,auto);if(i===0)hpAfterFirst=enemy.hp;}
   return{hp:enemy.hp,hpAfterFirst};
  };
  const aided=run(true),manual=run(false);expect(aided.hpAfterFirst).toBe(160);expect(aided.hp).toBeLessThan(160);expect(manual.hp).toBe(160);
 });
});
describe('auto aim preference',()=>{
 it('defaults on for existing settings, sanitizes types, and persists an explicit off selection',()=>{
  expect(DEFAULT_SETTINGS.autoAim).toBe(true);expect(sanitizeSettings({quality:'high'}).autoAim).toBe(true);expect(sanitizeSettings({autoAim:'false'}).autoAim).toBe(true);
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  const settings=sanitizeSettings({autoAim:false,quality:'high'});saveSettings(storage,settings);expect(JSON.parse(values.get(SETTINGS_KEY)!).autoAim).toBe(false);expect(loadSettings(storage).autoAim).toBe(false);
 });
});
