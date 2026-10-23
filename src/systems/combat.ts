import { Quaternion, Vector3 } from 'three';
import { DIFFICULTIES, WEAPON_RANGE, type Difficulty } from '../data/combat';

export interface Enemy { active: boolean; pos: Vector3; vel: Vector3; quat: Quaternion; hp: number; maxHp: number; cooldown: number; flash: number }
export interface Bolt { active: boolean; pos: Vector3; previous: Vector3; vel: Vector3; life: number; hostile: boolean; damage: number }
export interface WorldCollider { pos: Vector3; radius: number }
interface Pilot { pos: Vector3; vel: Vector3; quat: Quaternion; energy: number }
const direction = new Vector3(), offset = new Vector3(), forward = new Vector3(), right = new Vector3(), target = new Vector3();
const UP = new Vector3(0, 1, 0), FRONT = new Vector3(0, 0, -1);

/** Swept collision prevents fast bolts from tunnelling through a ship. */
export function segmentHitsSphere(a: Vector3, b: Vector3, center: Vector3, radius: number): boolean {
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z, length=x*x+y*y+z*z;
  const t=length>0?Math.max(0,Math.min(1,((center.x-a.x)*x+(center.y-a.y)*y+(center.z-a.z)*z)/length)):0;
  return (a.x+x*t-center.x)**2+(a.y+y*t-center.y)**2+(a.z+z*t-center.z)**2<=radius*radius;
}

/** Bounded enemy and projectile pools; positions stay in double precision world coordinates. */
export class CombatSystem {
  readonly enemies: Enemy[] = Array.from({length:3},()=>({active:false,pos:new Vector3(),vel:new Vector3(),quat:new Quaternion(),hp:0,maxHp:0,cooldown:0,flash:0}));
  readonly bolts: Bolt[] = Array.from({length:96},()=>({active:false,pos:new Vector3(),previous:new Vector3(),vel:new Vector3(),life:0,hostile:false,damage:0}));
  heat=0; overheated=false; hitFlash=0; shotPulse=false;
  private cooldown=0;
  private spawnTimer=12;
  private wave=0;
  private result={damage:0,reward:0,kills:0};
  reset(grace=12): void {
    for(const enemy of this.enemies)enemy.active=false;
    for(const bolt of this.bolts)bolt.active=false;
    this.heat=0;this.overheated=false;this.cooldown=0;this.spawnTimer=grace;this.hitFlash=0;
  }
  get count(): number { let count=0;for(const enemy of this.enemies)if(enemy.active)count++;return count; }

  spawn(ship: Pilot, difficulty: Difficulty, worlds: readonly WorldCollider[]): void {
    const def=DIFFICULTIES[difficulty];
    forward.copy(FRONT).applyQuaternion(ship.quat);right.set(1,0,0).applyQuaternion(ship.quat);
    for(let i=0;i<def.count;i++) {
      const enemy=this.enemies[i];
      enemy.pos.copy(ship.pos).addScaledVector(forward,300+i*65).addScaledVector(right,(i-(def.count-1)/2)*90);
      for(const body of worlds) {
        offset.copy(enemy.pos).sub(body.pos);
        if(offset.length()<body.radius+80)enemy.pos.copy(body.pos).addScaledVector(offset.normalize(),body.radius+90);
      }
      enemy.active=true;enemy.hp=enemy.maxHp=def.hp;enemy.cooldown=4+i*.8;enemy.flash=0;enemy.vel.copy(ship.vel);
      enemy.quat.setFromUnitVectors(FRONT,direction.copy(ship.pos).sub(enemy.pos).normalize());
    }
    this.wave++;
  }

  private bolt(pos: Vector3, aim: Vector3, inherited: Vector3, hostile: boolean, damage: number): void {
    const bolt=this.bolts.find(item=>!item.active);if(!bolt)return;
    bolt.active=true;bolt.pos.copy(pos);bolt.previous.copy(pos);bolt.vel.copy(aim).multiplyScalar(hostile?360:1000).add(inherited);
    bolt.life=hostile?4:1.4;bolt.hostile=hostile;bolt.damage=damage;
  }

  step(dt: number, ship: Pilot, time: number, fire: boolean, difficulty: Difficulty, worlds: readonly WorldCollider[], safe=false) {
    const result=this.result;result.damage=result.reward=result.kills=0;this.shotPulse=false;
    this.hitFlash=Math.max(0,this.hitFlash-dt*3);this.cooldown=Math.max(0,this.cooldown-dt);
    this.heat=Math.max(0,this.heat-dt*.20);if(this.heat<.25)this.overheated=false;
    if(safe) { if(this.count||this.bolts.some(b=>b.active))this.reset(12);return result; }
    if(difficulty==='off'&&this.count){for(const enemy of this.enemies)enemy.active=false;for(const bolt of this.bolts)if(bolt.hostile)bolt.active=false;}
    const def=DIFFICULTIES[difficulty];
    if(difficulty!=='off'&&this.count===0){this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawn(ship,difficulty,worlds);this.spawnTimer=24;}}
    if(fire&&this.cooldown<=0&&!this.overheated&&ship.energy>=2) {
      forward.copy(FRONT).applyQuaternion(ship.quat);direction.copy(forward);
      let best=.9848;
      for(const enemy of this.enemies)if(enemy.active) {
        offset.copy(enemy.pos).sub(ship.pos);const distance=offset.length();const cosine=offset.normalize().dot(forward);
        if(distance<WEAPON_RANGE&&cosine>best){best=cosine;direction.copy(offset);}
      }
      right.set(1,0,0).applyQuaternion(ship.quat);
      for(const side of [-1,1]) {target.copy(ship.pos).addScaledVector(forward,9).addScaledVector(right,side*2.8);this.bolt(target,direction,ship.vel,false,12);}
      ship.energy-=2;this.cooldown=.22;this.heat=Math.min(1,this.heat+.12);this.overheated=this.heat>=.98;this.shotPulse=true;
    }
    for(let i=0;i<this.enemies.length;i++) {
      const enemy=this.enemies[i];if(!enemy.active)continue;
      enemy.flash=Math.max(0,enemy.flash-dt*4);direction.copy(ship.pos).sub(enemy.pos);const distance=direction.length();
      if(distance>2500){enemy.active=false;continue;}
      direction.normalize();offset.crossVectors(direction,UP);if(offset.lengthSq()<.01)offset.set(1,0,0);offset.normalize();
      target.copy(ship.vel).addScaledVector(direction,Math.max(-def.speed,Math.min(def.speed,(distance-230)*.65))).addScaledVector(offset,Math.sin(time*.35+i+this.wave)*def.speed*.7);
      enemy.vel.lerp(target,1-Math.exp(-dt*1.8));enemy.pos.addScaledVector(enemy.vel,dt);
      for(const body of worlds){offset.copy(enemy.pos).sub(body.pos);if(offset.lengthSq()<(body.radius+35)**2)enemy.pos.copy(body.pos).addScaledVector(offset.normalize(),body.radius+35);}
      direction.copy(ship.pos).sub(enemy.pos).normalize();enemy.quat.setFromUnitVectors(FRONT,direction);
      enemy.cooldown-=dt;
      if(enemy.cooldown<=0&&distance<1000){
        target.copy(ship.pos).addScaledVector(ship.vel,Math.min(1,distance/360));
        target.x+=Math.sin(time*1.7+i)* (difficulty==='easy'?18: difficulty==='hard'?3:9);
        direction.copy(target).sub(enemy.pos).normalize();this.bolt(enemy.pos,direction,enemy.vel,true,def.damage);enemy.cooldown=def.interval;
      }
    }
    for(const bolt of this.bolts)if(bolt.active) {
      bolt.previous.copy(bolt.pos);bolt.pos.addScaledVector(bolt.vel,dt);bolt.life-=dt;
      if(bolt.life<=0){bolt.active=false;continue;}
      for(const body of worlds)if(segmentHitsSphere(bolt.previous,bolt.pos,body.pos,body.radius)){bolt.active=false;break;}
      if(!bolt.active)continue;
      if(bolt.hostile){if(segmentHitsSphere(bolt.previous,bolt.pos,ship.pos,7)){result.damage+=bolt.damage;bolt.active=false;}}
      else for(const enemy of this.enemies)if(enemy.active&&segmentHitsSphere(bolt.previous,bolt.pos,enemy.pos,10)){
        enemy.hp=Math.max(0,enemy.hp-bolt.damage);enemy.flash=1;this.hitFlash=1;bolt.active=false;
        if(enemy.hp===0){enemy.active=false;result.reward+=def.reward;result.kills++;}
        break;
      }
    }
    return result;
  }
}
