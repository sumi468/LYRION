import {Euler,Quaternion,Vector3} from 'three';
import type {GameState} from '../core/state';
import type {BodyDef} from '../data/types';
import {SHIP_HATCH,SHIP_SOLIDS} from '../data/homeworld';
import {ReferenceFrame} from '../physics/frames';
import {bodyRotation} from '../physics/worldScale';
import {solidHeight,terrainHeight} from '../physics/terrain';
import {collideEvaCapsule} from '../physics/localCollision';
import {EvaSystem,type EvaInput} from './eva';
const p=new Vector3(),candidate=new Vector3(),direction=new Vector3(),old=new Vector3(),movement=new Vector3(),inverse=new Quaternion(),orientation=new Quaternion(),look=new Euler(0,0,0,'YXZ');
export const WALK_SPEED=2.3,FAST_WALK_SPEED=3.5,SUIT_CENTRE_HEIGHT=1.025;
/** Ground locomotion owns local walking velocity; it never repurposes EVA's
 * free-flight state. A read-only-compatible suit pose reuses the existing rig. */
export class SurfaceSystem{
 readonly pose=new EvaSystem();
 readonly localPosition=new Vector3();
 readonly localVelocity=new Vector3();
 readonly frame=new ReferenceFrame();
 readonly bodyRotation=new Quaternion();
 grounded=false;walked=0;blockReason='';
 private yaw=0;private pitch=0;private jumpHeld=false;
 get active(){return this.pose.active;}
 reset(){this.pose.reset();this.localVelocity.set(0,0,0);this.grounded=false;this.blockReason='';}
 face(yaw:number){this.yaw=yaw;this.pitch=0;}
 launch(ship:GameState,frame:ReferenceFrame):void{
  this.reset();this.pose.active=true;this.walked=0;this.yaw=this.pitch=0;this.frame.position.copy(frame.position);this.frame.rotation.copy(frame.rotation);
  p.fromArray(SHIP_HATCH).applyQuaternion(ship.quat).add(ship.pos);frame.toLocal(p,this.localPosition);
  this.localPosition.x-=2.4;this.localPosition.y+=.3;this.sync(ship,frame);
 }
 sync(ship:GameState,frame:ReferenceFrame):void{
  this.frame.position.copy(frame.position);this.frame.rotation.copy(frame.rotation);this.frame.velocity.copy(frame.velocity);this.frame.angularVelocity.copy(frame.angularVelocity);
  frame.toWorld(this.localPosition,this.pose.position);frame.pointVelocity(this.localPosition,this.pose.velocity);
  orientation.setFromEuler(look.set(this.pitch,this.yaw,0));this.pose.localRotation.copy(orientation);this.pose.rotation.copy(frame.rotation).multiply(orientation);
  // Helmet look may pitch; the standing capsule and body must remain upright.
  this.bodyRotation.copy(frame.rotation).multiply(orientation.setFromEuler(look.set(0,this.yaw,0)));
  this.pose.localVelocity.copy(this.localVelocity);this.pose.thrust=0;
  p.fromArray(SHIP_HATCH).applyQuaternion(ship.quat).add(ship.pos);this.pose.hatchPosition.copy(p);this.pose.distance=this.pose.position.distanceTo(ship.pos);
 }
 board():boolean{if(!this.active||this.pose.position.distanceTo(this.pose.hatchPosition)>5)return false;this.pose.reset();return true;}
 update(dt:number,ship:GameState,input:EvaInput,body:BodyDef,center:Vector3,frame:ReferenceFrame,shipFrame:ReferenceFrame):void{
  if(!this.active)return;
  this.yaw+=input.yaw*dt;this.pitch=Math.max(-.65,Math.min(.65,this.pitch+input.pitch*dt));
  old.copy(this.localPosition);const speed=input.up<0?FAST_WALK_SPEED:WALK_SPEED;
  movement.set(input.side,0,-input.forward);if(movement.lengthSq()>1)movement.normalize();movement.applyAxisAngle(yAxis,this.yaw).multiplyScalar(speed);
  const blend=1-Math.exp(-dt*(this.grounded?12:2));this.localVelocity.x+=(movement.x-this.localVelocity.x)*blend;this.localVelocity.z+=(movement.z-this.localVelocity.z)*blend;
  if(input.up>0&&!this.jumpHeld&&this.grounded)this.localVelocity.y=2.5;this.jumpHeld=input.up>0;
  this.localVelocity.y-=Math.min(12,9.81*(body.gravityG??1))*dt;
  this.localPosition.addScaledVector(this.localVelocity,dt);
  frame.toWorld(this.localPosition,candidate);direction.copy(candidate).sub(center).normalize().applyQuaternion(bodyRotation(body,ship.time,inverse).invert());
  const height=solidHeight(body,direction);
  p.copy(direction).multiplyScalar(body.radius+height+SUIT_CENTRE_HEIGHT).applyQuaternion(bodyRotation(body,ship.time,inverse)).add(center);frame.toLocal(p,p);
  const horizontal=Math.hypot(this.localPosition.x-old.x,this.localPosition.z-old.z);
  const slope=(p.y-old.y)/Math.max(.03,horizontal);
  if(body.surface?.program==='terran'&&terrainHeight(body,direction)<0||this.grounded&&slope>1.1){
   this.localPosition.x=old.x;this.localPosition.z=old.z;this.localVelocity.x=this.localVelocity.z=0;this.blockReason='海面または急斜面です。陸地の緩やかな道を進んでください';
   p.y=old.y;
  }else this.blockReason='';
  this.grounded=this.localPosition.y<=p.y+.015;
  if(this.grounded){this.localPosition.y=p.y;this.localVelocity.y=Math.max(0,this.localVelocity.y);}
  this.sync(ship,frame);
  if(collideEvaCapsule(shipFrame,this.pose.position,this.pose.velocity,this.bodyRotation,SHIP_SOLIDS))frame.toLocal(this.pose.position,this.localPosition);
  this.walked+=Math.hypot(this.localPosition.x-old.x,this.localPosition.z-old.z);
 }
}
const yAxis=new Vector3(0,1,0);
