import { Quaternion, Vector3 } from 'three';
import { DIFFICULTIES, DODGE_COOLDOWN, DODGE_DURATION, DODGE_ENERGY, MAX_BOLTS, MAX_ENEMIES, WEAPON_RANGE, type Difficulty, type EnemyRole } from '../data/combat';

export type EnemyMode = 'pursuit' | 'attack' | 'break' | 'evade';
export interface Enemy {
  active:boolean; pos:Vector3; vel:Vector3; quat:Quaternion;
  hp:number; maxHp:number; shield:number; maxShield:number;
  cooldown:number; flash:number; role:EnemyRole; mode:EnemyMode;
  modeTime:number; dodgeCooldown:number; windup:number; burst:number; shotTimer:number;
  sinceHit:number; boosting:boolean; evades:number;
}
export interface Bolt { active:boolean; pos:Vector3; previous:Vector3; vel:Vector3; life:number; hostile:boolean; damage:number }
export interface Impact { pos:Vector3; life:number; duration:number; radius:number }
export interface WorldCollider { pos:Vector3; radius:number }
interface Pilot { pos:Vector3; vel:Vector3; quat:Quaternion; energy:number }
const direction=new Vector3(),offset=new Vector3(),forward=new Vector3(),right=new Vector3(),target=new Vector3();
const side=new Vector3(),vertical=new Vector3(),desired=new Vector3(),change=new Vector3(),enemyForward=new Vector3();
const rotation=new Quaternion(),bank=new Quaternion();
const UP=new Vector3(0,1,0),FRONT=new Vector3(0,0,-1),ROLL=new Vector3(0,0,1);

/** Earliest positive interception time, accounting for projectile inherited velocity. */
export function interceptTime(relative:Vector3,velocity:Vector3,speed:number):number {
  const a=velocity.lengthSq()-speed*speed,b=2*relative.dot(velocity),c=relative.lengthSq();
  if(Math.abs(a)<1e-8)return b<0?Math.min(3,-c/b):Math.min(3,Math.sqrt(c)/speed);
  const discriminant=b*b-4*a*c;
  if(discriminant>=0){
    const root=Math.sqrt(discriminant),first=(-b-root)/(2*a),second=(-b+root)/(2*a);
    const value=first>0?first:second>0?second:0;
    if(value>0)return Math.min(3,value);
  }
  return Math.min(3,Math.sqrt(c)/speed);
}

/** Swept collision prevents fast bolts from tunnelling through a ship. */
export function segmentHitsSphere(a:Vector3,b:Vector3,center:Vector3,radius:number):boolean {
  const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,length=x*x+y*y+z*z;
  const t=length>0?Math.max(0,Math.min(1,((center.x-a.x)*x+(center.y-a.y)*y+(center.z-a.z)*z)/length)):0;
  return (a.x+x*t-center.x)**2+(a.y+y*t-center.y)**2+(a.z+z*t-center.z)**2<=radius*radius;
}

/** Fixed pools and deterministic steering; all coordinates remain world-space doubles. */
export class CombatSystem {
  readonly enemies:Enemy[]=Array.from({length:MAX_ENEMIES},()=>({active:false,pos:new Vector3(),vel:new Vector3(),quat:new Quaternion(),hp:0,maxHp:0,shield:0,maxShield:0,cooldown:0,flash:0,role:'hunter',mode:'pursuit',modeTime:0,dodgeCooldown:0,windup:0,burst:0,shotTimer:0,sinceHit:0,boosting:false,evades:0}));
  readonly bolts:Bolt[]=Array.from({length:MAX_BOLTS},()=>({active:false,pos:new Vector3(),previous:new Vector3(),vel:new Vector3(),life:0,hostile:false,damage:0}));
  readonly impacts:Impact[]=Array.from({length:12},()=>({pos:new Vector3(),life:0,duration:1,radius:1}));
  heat=0; overheated=false; hitFlash=0; shotPulse=false;
  wave=0; pursuers=0; incoming=0; reinforcementsIn=0; dodgeCooldown=0; dodgeTime=0; combo=0;
  private cooldown=0;
  private spawnTimer=12;
  private sinceKill=99;
  private result={damage:0,reward:0,kills:0};
  get count():number {let count=0;for(const enemy of this.enemies)if(enemy.active)count++;return count;}
  get rollAngle():number {const t=1-this.dodgeTime/DODGE_DURATION;return this.dodgeTime>0?Math.PI*2*t*t*(3-2*t):0;}
  reset(grace=12):void {
    for(const enemy of this.enemies)enemy.active=false;
    for(const bolt of this.bolts)bolt.active=false;
    for(const impact of this.impacts)impact.life=0;
    this.heat=0;this.overheated=false;this.cooldown=0;this.spawnTimer=grace;this.hitFlash=0;
    this.wave=0;this.pursuers=this.incoming=0;this.reinforcementsIn=0;this.combo=0;this.sinceKill=99;
    this.dodgeCooldown=this.dodgeTime=0;
  }
  tryDodge(ship:Pilot):boolean {
    if(this.dodgeCooldown>0||ship.energy<DODGE_ENERGY)return false;
    ship.energy-=DODGE_ENERGY;this.dodgeCooldown=DODGE_COOLDOWN;this.dodgeTime=DODGE_DURATION;return true;
  }
  private spawnEnemy(index:number,ship:Pilot,difficulty:Difficulty,worlds:readonly WorldCollider[],reinforcement=false):void {
    const def=DIFFICULTIES[difficulty],enemy=this.enemies[index];
    forward.copy(FRONT).applyQuaternion(ship.quat);right.set(1,0,0).applyQuaternion(ship.quat);
    enemy.role=index%3===1?'interceptor':index%3===2?'gunship':'hunter';
    const rear=difficulty!=='easy'&&(index%3===1||reinforcement);
    enemy.pos.copy(ship.pos).addScaledVector(forward,rear?-520:450+index*45).addScaledVector(right,(index%2?1:-1)*(difficulty==='easy'?0:170+index*25));
    for(const body of worlds){offset.copy(enemy.pos).sub(body.pos);if(offset.lengthSq()<(body.radius+100)**2){if(offset.lengthSq()<1)offset.copy(UP);enemy.pos.copy(body.pos).addScaledVector(offset.normalize(),body.radius+110);}}
    const multiplier=enemy.role==='gunship'?1.25:enemy.role==='interceptor'?.9:1;
    enemy.active=true;enemy.hp=enemy.maxHp=Math.round(def.hp*multiplier);enemy.shield=enemy.maxShield=def.shield;
    enemy.cooldown=1.4+index*.45;enemy.flash=0;enemy.vel.copy(ship.vel);enemy.mode='pursuit';enemy.modeTime=2;
    enemy.dodgeCooldown=1.5+index*.3;enemy.windup=enemy.burst=enemy.shotTimer=0;enemy.sinceHit=99;enemy.evades=0;enemy.boosting=false;
    enemy.quat.setFromUnitVectors(FRONT,direction.copy(ship.pos).sub(enemy.pos).normalize());
  }
  spawn(ship:Pilot,difficulty:Difficulty,worlds:readonly WorldCollider[]):void {
    for(const enemy of this.enemies)enemy.active=false;
    const def=DIFFICULTIES[difficulty];this.wave++;this.reinforcementsIn=def.reinforcement;
    for(let i=0;i<def.count;i++)this.spawnEnemy(i,ship,difficulty,worlds);
  }
  private bolt(pos:Vector3,aim:Vector3,inherited:Vector3,hostile:boolean,damage:number):void {
    const bolt=this.bolts.find(item=>!item.active);if(!bolt)return;
    bolt.active=true;bolt.pos.copy(pos);bolt.previous.copy(pos);bolt.vel.copy(aim).multiplyScalar(hostile?620:1150).add(inherited);
    bolt.life=hostile?3:1.25;bolt.hostile=hostile;bolt.damage=damage;
  }
  private impact(pos:Vector3,destroyed:boolean):void {
    const effect=this.impacts.find(item=>item.life<=0)??this.impacts[0];
    effect.pos.copy(pos);effect.duration=destroyed?.75:.22;effect.life=effect.duration;effect.radius=destroyed?24:5;
  }
  private firePlayer(ship:Pilot,difficulty:Difficulty):void {
    const def=DIFFICULTIES[difficulty];forward.copy(FRONT).applyQuaternion(ship.quat);direction.copy(forward);
    let best:number=def.assist;
    for(const enemy of this.enemies)if(enemy.active){
      offset.copy(enemy.pos).sub(ship.pos);const distance=offset.length();
      change.copy(enemy.vel).sub(ship.vel);const lead=interceptTime(offset,change,1150);
      target.copy(offset).addScaledVector(change,lead).normalize();const cosine=target.dot(forward);
      if(distance<WEAPON_RANGE&&cosine>best){best=cosine;direction.copy(target);}
    }
    right.set(1,0,0).applyQuaternion(ship.quat);
    for(let sign=-1;sign<=1;sign+=2){target.copy(ship.pos).addScaledVector(forward,9).addScaledVector(right,sign*2.8);this.bolt(target,direction,ship.vel,false,12);}
    ship.energy-=2;this.cooldown=.22;this.heat=Math.min(1,this.heat+.12);this.overheated=this.heat>=.98;this.shotPulse=true;
  }
  private updateEnemy(enemy:Enemy,index:number,ship:Pilot,time:number,dt:number,difficulty:Difficulty,fire:boolean,worlds:readonly WorldCollider[]):void {
    const def=DIFFICULTIES[difficulty];offset.copy(ship.pos).sub(enemy.pos);const distance=offset.length();
    if(distance>(difficulty==='easy'?4500:9000)){enemy.active=false;return;}
    direction.copy(offset).normalize();side.crossVectors(direction,UP);if(side.lengthSq()<.01)side.set(1,0,0);side.normalize();vertical.crossVectors(side,direction).normalize();
    enemy.flash=Math.max(0,enemy.flash-dt*4);enemy.cooldown-=dt;enemy.dodgeCooldown-=dt;enemy.modeTime-=dt;enemy.sinceHit+=dt;
    if(enemy.sinceHit>6)enemy.shield=Math.min(enemy.maxShield,enemy.shield+dt*(difficulty==='easy'?4:10));
    const threatened=fire&&forward.dot(offset.copy(enemy.pos).sub(ship.pos).normalize())>.97&&distance<1200;
    let nearBolt=false;
    if(enemy.dodgeCooldown<=0)for(const bolt of this.bolts)if(bolt.active&&!bolt.hostile&&bolt.pos.distanceToSquared(enemy.pos)<150**2){nearBolt=true;break;}
    if(difficulty!=='easy'&&enemy.dodgeCooldown<=0&&(threatened||nearBolt)){
      enemy.mode='evade';enemy.modeTime=1.05;enemy.dodgeCooldown=3.5+index*.23;enemy.windup=enemy.burst=0;enemy.evades++;
    }else if(enemy.modeTime<=0){
      enemy.mode=enemy.mode==='attack'?'break':enemy.mode==='break'||enemy.mode==='evade'?'pursuit':distance<800?'attack':'pursuit';
      enemy.modeTime=enemy.mode==='attack'?3.1:enemy.mode==='break'?1.4:2.3;
      if(enemy.mode==='break')enemy.windup=enemy.burst=0;
    }
    enemy.boosting=distance>600&&enemy.mode==='pursuit';
    desired.copy(ship.vel);
    if(enemy.mode==='evade')desired.addScaledVector(side,(index%2?1:-1)*def.speed*1.7).addScaledVector(vertical,Math.sin(time*3+index)*def.speed).addScaledVector(direction,def.speed*.15);
    else if(enemy.mode==='break')desired.addScaledVector(direction,-def.speed*.7).addScaledVector(side,(index%2?1:-1)*def.speed);
    else {
      const preferred=enemy.role==='gunship'?520:enemy.role==='interceptor'?170:260;
      const closure=Math.max(-def.speed*.5,Math.min(def.speed*(enemy.boosting?2.1:1),(distance-preferred)*1.1));
      desired.addScaledVector(direction,closure).addScaledVector(side,Math.sin(time*.65+index)*def.speed*(enemy.mode==='attack'?.6:.22));
      if(enemy.role==='interceptor')desired.addScaledVector(vertical,Math.cos(time*.8+index)*def.speed*.35);
    }
    change.copy(desired).sub(enemy.vel);const maximumChange=(difficulty==='easy'?160:enemy.mode==='evade'?950:enemy.boosting?800:440)*dt;
    if(change.lengthSq()>maximumChange**2)change.setLength(maximumChange);enemy.vel.add(change);enemy.pos.addScaledVector(enemy.vel,dt);
    for(const body of worlds){offset.copy(enemy.pos).sub(body.pos);if(offset.lengthSq()<(body.radius+35)**2){if(offset.lengthSq()<1)offset.copy(UP);enemy.pos.copy(body.pos).addScaledVector(offset.normalize(),body.radius+35);}}
    direction.copy(ship.pos).sub(enemy.pos).normalize();
    rotation.setFromUnitVectors(FRONT,direction).multiply(bank.setFromAxisAngle(ROLL,enemy.mode==='evade'?(index%2?1:-1)*.95:Math.sin(time+index)*.22));
    enemy.quat.slerp(rotation,1-Math.exp(-dt*3.5));
    enemyForward.copy(FRONT).applyQuaternion(enemy.quat);
    const firingWindow=enemy.mode!=='evade'&&enemy.mode!=='break'&&distance<1350&&enemyForward.dot(direction)>.82;
    if(firingWindow&&enemy.cooldown<=0&&enemy.windup<=0&&enemy.burst===0){enemy.windup=difficulty==='easy'?.85:.65;enemy.burst=def.burst+(enemy.role==='gunship'?1:0);}
    if(enemy.windup>0){enemy.windup=Math.max(0,enemy.windup-dt);this.incoming++;}
    if(enemy.windup===0&&enemy.burst>0){
      enemy.shotTimer-=dt;
      if(enemy.shotTimer<=0&&firingWindow){
        offset.copy(ship.pos).sub(enemy.pos);change.copy(ship.vel).sub(enemy.vel);const lead=interceptTime(offset,change,620);
        target.copy(ship.pos).addScaledVector(change,lead);
        const error=this.dodgeTime>0?70:difficulty==='easy'?16:difficulty==='normal'?5:2.5;
        target.addScaledVector(side,Math.sin(time*4+index*2)*error).addScaledVector(vertical,Math.cos(time*3+index)*error*.5);
        direction.copy(target).sub(enemy.pos).normalize();this.bolt(enemy.pos,direction,enemy.vel,true,def.damage);
        enemy.burst--;enemy.shotTimer=.16;
        if(enemy.burst===0)enemy.cooldown=def.interval+(enemy.role==='gunship'?.4:0);
      }else if(!firingWindow){enemy.burst=0;enemy.cooldown=Math.max(.5,enemy.cooldown);}
    }
    offset.copy(enemy.pos).sub(ship.pos).normalize();if(distance<1800&&offset.dot(forward)<-.2)this.pursuers++;
  }
  step(dt:number,ship:Pilot,time:number,fire:boolean,difficulty:Difficulty,worlds:readonly WorldCollider[],safe=false){
    const result=this.result;result.damage=result.reward=result.kills=0;this.shotPulse=false;this.pursuers=this.incoming=0;
    this.hitFlash=Math.max(0,this.hitFlash-dt*3);this.cooldown=Math.max(0,this.cooldown-dt);this.sinceKill+=dt;
    this.dodgeCooldown=Math.max(0,this.dodgeCooldown-dt);this.dodgeTime=Math.max(0,this.dodgeTime-dt);
    this.heat=Math.max(0,this.heat-dt*.2);if(this.heat<.25)this.overheated=false;
    if(this.sinceKill>6)this.combo=0;
    for(const impact of this.impacts)impact.life=Math.max(0,impact.life-dt);
    if(safe){if(this.count||this.bolts.some(b=>b.active))this.reset(12);return result;}
    if(difficulty==='off'){for(const enemy of this.enemies)enemy.active=false;for(const bolt of this.bolts)if(bolt.hostile)bolt.active=false;}
    const def=DIFFICULTIES[difficulty];
    if(difficulty!=='off'&&this.count===0){this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawn(ship,difficulty,worlds);this.spawnTimer=difficulty==='easy'?16:5;}}
    else if(difficulty!=='off'&&def.reinforcement>0){
      this.reinforcementsIn-=dt;
      if(this.reinforcementsIn<=0){const slot=this.enemies.findIndex(enemy=>!enemy.active);if(slot>=0)this.spawnEnemy(slot,ship,difficulty,worlds,true);this.reinforcementsIn=def.reinforcement;}
    }
    forward.copy(FRONT).applyQuaternion(ship.quat);
    if(fire&&this.cooldown<=0&&!this.overheated&&ship.energy>=2&&this.dodgeTime<=0)this.firePlayer(ship,difficulty);
    for(let i=0;i<this.enemies.length;i++)if(this.enemies[i].active)this.updateEnemy(this.enemies[i],i,ship,time,dt,difficulty,fire,worlds);
    for(const bolt of this.bolts)if(bolt.active){
      bolt.previous.copy(bolt.pos);bolt.pos.addScaledVector(bolt.vel,dt);bolt.life-=dt;
      if(bolt.life<=0){bolt.active=false;continue;}
      for(const body of worlds)if(segmentHitsSphere(bolt.previous,bolt.pos,body.pos,body.radius)){bolt.active=false;break;}
      if(!bolt.active)continue;
      if(bolt.hostile){if(segmentHitsSphere(bolt.previous,bolt.pos,ship.pos,7)){result.damage+=bolt.damage;bolt.active=false;}}
      else for(const enemy of this.enemies)if(enemy.active&&segmentHitsSphere(bolt.previous,bolt.pos,enemy.pos,enemy.role==='gunship'?9:7)){
        const absorbed=Math.min(enemy.shield,bolt.damage);enemy.shield-=absorbed;enemy.hp=Math.max(0,enemy.hp-(bolt.damage-absorbed));enemy.flash=1;enemy.sinceHit=0;this.hitFlash=1;bolt.active=false;
        this.impact(enemy.pos,enemy.hp===0);
        if(enemy.hp===0){enemy.active=false;result.reward+=def.reward;result.kills++;this.combo++;this.sinceKill=0;}
        break;
      }
    }
    return result;
  }
}
