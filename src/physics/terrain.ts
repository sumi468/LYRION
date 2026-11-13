import {Quaternion,Vector3} from 'three';
import type {BodyDef} from '../data/types';
import {bodyRotation} from './worldScale';
import {SETTLEMENT_FLAT_RADIUS} from '../data/settlement';

export const PRIME_BASE_NORMAL=new Vector3(-.71,.28,-.645).normalize();
export const BASE_ELEVATION=28;
export const TERRAIN_MAX_HEIGHT=5400;
const local=new Vector3(),rotation=new Quaternion();
const normalEast=new Vector3(),normalNorth=new Vector3(),normalSample=new Vector3();
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const hash=(x:number,y:number,z:number,seed:number)=>{
 let h=Math.imul(x+Math.imul(y,374761393)+Math.imul(z,668265263),1274126177)^seed;
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
};
export function terrainNoise(x:number,y:number,z:number,seed:number):number{
 const a=Math.floor(x),b=Math.floor(y),c=Math.floor(z),u=smooth(x-a),v=smooth(y-b),w=smooth(z-c);
 const mix=(p:number,q:number,t:number)=>p+(q-p)*t;
 return mix(mix(mix(hash(a,b,c,seed),hash(a+1,b,c,seed),u),mix(hash(a,b+1,c,seed),hash(a+1,b+1,c,seed),u),v),mix(mix(hash(a,b,c+1,seed),hash(a+1,b,c+1,seed),u),mix(hash(a,b+1,c+1,seed),hash(a+1,b+1,c+1,seed),u),v),w);
}
/** Seamless body-local 3D field, shared by collision, landing, walking and meshes. */
export function terrainHeight(body:BodyDef,direction:Vector3):number{
 if(body.radius<10000||!body.surface||body.kind==='star'||body.surface.program==='gas'||body.kind==='anomaly')return 0;
 const {x,y,z}=direction,seed=body.surface.seed;
 const continental=terrainNoise(x*3.7+4,y*3.7+2,z*3.7+7,seed);
 let height=(continental-.51)*9500;
 height+=(terrainNoise(x*37,y*37,z*37,seed+3)-.5)*440;
 height+=(terrainNoise(x*310,y*310,z*310,seed+5)-.5)*65;
 height+=(terrainNoise(x*2800,y*2800,z*2800,seed+7)-.5)*5;
 if(body.homeworld){
  const distance=Math.acos(Math.max(-1,Math.min(1,direction.dot(PRIME_BASE_NORMAL))))*body.radius;
  if(distance<10000){
   const island=BASE_ELEVATION+125*Math.sin(Math.min(distance/1500,Math.PI)) - Math.max(0,distance-1100)*.22;
   const ridge=(terrainNoise(x*2000,y*2000,z*2000,seed+9)-.5)*80*smooth((distance-180)/500);
   const land=island+ridge,flat=smooth((distance-SETTLEMENT_FLAT_RADIUS)/370);
   const coastal=BASE_ELEVATION+(land-BASE_ELEVATION)*flat;
   const blend=smooth((distance-6500)/3500);height=coastal+(height-coastal)*blend;
  }
 }
 return Math.max(-4800,Math.min(TERRAIN_MAX_HEIGHT,height));
}
export function solidHeight(body:BodyDef,direction:Vector3):number{
 const height=terrainHeight(body,direction);return body.surface?.program==='terran'?Math.max(0,height):height;
}
/** Body-local terrain normal at a fixed metre stencil, independent of patch
 * resolution and skirts. Shared edge vertices therefore receive equal light. */
export function terrainNormal(body:BodyDef,direction:Vector3,out:Vector3):Vector3{
 normalEast.set(-direction.z,0,direction.x);if(normalEast.lengthSq()<.001)normalEast.set(1,0,0);normalEast.normalize();normalNorth.crossVectors(direction,normalEast).normalize();
 const step=2,offset=step/body.radius;
 normalSample.copy(direction).addScaledVector(normalEast,offset).normalize();const eastPlus=terrainHeight(body,normalSample);
 normalSample.copy(direction).addScaledVector(normalEast,-offset).normalize();const eastMinus=terrainHeight(body,normalSample);
 normalSample.copy(direction).addScaledVector(normalNorth,offset).normalize();const northPlus=terrainHeight(body,normalSample);
 normalSample.copy(direction).addScaledVector(normalNorth,-offset).normalize();const northMinus=terrainHeight(body,normalSample);
 return out.copy(direction).addScaledVector(normalEast,-(eastPlus-eastMinus)/(step*2)).addScaledVector(normalNorth,-(northPlus-northMinus)/(step*2)).normalize();
}
export function surfaceAltitude(body:BodyDef,world:Vector3,center:Vector3,time:number):number{
 local.copy(world).sub(center);const distance=local.length();
 bodyRotation(body,time,rotation).invert();local.multiplyScalar(1/Math.max(distance,1)).applyQuaternion(rotation);
 return distance-body.radius-solidHeight(body,local);
}
export function terrainColor(body:BodyDef,direction:Vector3,height:number,out:Vector3):Vector3{
 const detail=terrainNoise(direction.x*12000,direction.y*12000,direction.z*12000,body.surface!.seed);
 const shade=.83+detail*.25;
 if(body.surface?.program==='terran'){
  if(height<0)return out.set(.025,.075,.10);
  if(height<7)return out.set(.49,.42,.28).multiplyScalar(shade);
  if(height>1800)return out.set(.48,.48,.45).multiplyScalar(shade);
  return out.set(.16,.24,.105).multiplyScalar(shade);
 }
 if(body.surface?.program==='ice')return out.set(.56,.66,.7).multiplyScalar(shade);
 return out.set(.31,.23,.17).multiplyScalar(shade);
}
