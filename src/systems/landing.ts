import { Quaternion, Vector3 } from 'three';
import type { BodyDef } from '../data/types';
import { BODY_BY_ID, BODY_DEFS } from '../data/starSystem';
import type { GameState } from '../core/state';
import {bodyRotation,bodyPointVelocity} from '../physics/worldScale';
import {terrainHeight,surfaceAltitude} from '../physics/terrain';
import {ReferenceFrame} from '../physics/frames';
import {updateSurfaceFrame} from '../physics/surfaceFrame';
import {BASE_SOLIDS} from '../data/surfaceCampaign';
import {PAD_LANDING_RADIUS,cityLandingRestricted} from '../data/settlement';
import {PRIME_BASE_NORMAL} from '../physics/terrain';

export interface LandingRecord { bodyId: string; normal: [number,number,number] }
export const canLand = (def: BodyDef): boolean => (def.kind==='planet'||def.kind==='moon')&&!!def.surface&&def.surface.program!=='gas';
const normal=new Vector3(),relative=new Vector3(),zero=new Vector3();
const rotation=new Quaternion();
const east=new Vector3(),north=new Vector3(),sample=new Vector3(),local=new Vector3(),yAxis=new Vector3(0,1,0);
export const LANDING_ALTITUDE=450,LANDING_SPEED=100,LANDING_FOOTPRINT=9;
export interface LandingAssessment {
  body:BodyDef|null; altitude:number; relativeSpeed:number; ready:boolean;
  terrain:'clear'|'water'|'slope'|'obstacle'; slope:number;
  padDistance:number; onPad:boolean; reason:string;
}

export class LandingSystem {
  mode: 'flight'|'approach'|'landed'='flight';
  anchor: LandingRecord|null=null;
  altitude=0;
  readonly surface=new Vector3();
  readonly up=new Vector3(0,1,0);
  readonly quaternion=new Quaternion();
  readonly referenceFrame=new ReferenceFrame();
  private readonly baseFrame=new ReferenceFrame();
  private readonly assessment:LandingAssessment={body:null,altitude:Infinity,relativeSpeed:0,ready:false,terrain:'clear',slope:0,padDistance:Infinity,onPad:false,reason:''};
  restore(record:LandingRecord|null): void {this.anchor=record;this.mode=record?'landed':'flight';}
  /** Town expansion must not strand a valid v5 save inside a new building.
   * Keep its radial location and progress, and resume hovering above the roof. */
  recoverObstructedSave(s:GameState,positions:Record<string,Vector3>,velocities:Record<string,Vector3>):boolean{
    if(this.mode!=='landed'||!this.anchor)return false;
    const def=BODY_BY_ID[this.anchor.bodyId];if(!def?.homeworld)return false;
    this.update(0,s,positions,velocities);
    updateSurfaceFrame(def,PRIME_BASE_NORMAL,s.time,positions[def.id],velocities[def.id],this.baseFrame);this.baseFrame.toLocal(s.pos,local);
    let roof=-Infinity;
    for(const box of BASE_SOLIDS){
      const dx=Math.max(box.min[0]-local.x,0,local.x-box.max[0]),dz=Math.max(box.min[2]-local.z,0,local.z-box.max[2]);
      if(dx*dx+dz*dz<LANDING_FOOTPRINT**2&&local.y<box.max[1]+8)roof=Math.max(roof,box.max[1]);
    }
    if(roof===-Infinity)return false;
    local.y=Math.max(local.y,roof+15);this.baseFrame.toWorld(local,s.pos);bodyPointVelocity(def,s.pos,positions[def.id],velocities[def.id],s.vel);
    s.quat.copy(this.quaternion);s.landed=null;this.anchor=null;this.mode='flight';return true;
  }
  nearest(s:GameState,positions:Record<string,Vector3>):BodyDef|null {
    let best:BodyDef|null=null,dist=Infinity;
    for(const def of BODY_DEFS)if(canLand(def)) {const d=s.pos.distanceTo(positions[def.id])-def.radius;if(d<dist){dist=d;best=def;}}
    return best;
  }
  /** This is the single source of truth for HUD readiness and the G action.
   * Sample a ship-sized footprint, not merely the radial point below the pilot. */
  assess(s:GameState,positions:Record<string,Vector3>,velocities:Record<string,Vector3>):Readonly<LandingAssessment>{
    const a=this.assessment,def=this.nearest(s,positions);
    a.body=def;a.ready=false;a.terrain='clear';a.slope=0;a.padDistance=Infinity;a.onPad=false;a.altitude=Infinity;a.relativeSpeed=0;
    if(!def){a.reason='この付近に着陸可能な固体天体がありません';return a;}
    a.altitude=surfaceAltitude(def,s.pos,positions[def.id],s.time);
    bodyPointVelocity(def,s.pos,positions[def.id],velocities[def.id],relative);a.relativeSpeed=relative.sub(s.vel).length();
    normal.copy(s.pos).sub(positions[def.id]).normalize().applyQuaternion(bodyRotation(def,s.time,rotation).invert());
    east.crossVectors(yAxis,normal);if(east.lengthSq()<.001)east.set(1,0,0);east.normalize();north.crossVectors(normal,east).normalize();
    let min=terrainHeight(def,normal),max=min;
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4;sample.copy(normal).addScaledVector(east,Math.cos(angle)*LANDING_FOOTPRINT/def.radius).addScaledVector(north,Math.sin(angle)*LANDING_FOOTPRINT/def.radius).normalize();
      const height=terrainHeight(def,sample);min=Math.min(min,height);max=Math.max(max,height);
    }
    a.slope=Math.atan((max-min)/(LANDING_FOOTPRINT*2))*180/Math.PI;
    if(def.surface?.program==='terran'&&min<1)a.terrain='water';
    else if(a.slope>10)a.terrain='slope';
    let inCity=false;
    if(def.homeworld){
      updateSurfaceFrame(def,PRIME_BASE_NORMAL,s.time,positions[def.id],velocities[def.id],this.baseFrame);
      this.baseFrame.toLocal(s.pos,local);a.padDistance=Math.hypot(local.x,local.z);a.onPad=a.padDistance<=PAD_LANDING_RADIUS;
      inCity=cityLandingRestricted(local.x,local.z);if(inCity)a.terrain='obstacle';
      if(a.padDistance<800)for(const solid of BASE_SOLIDS){
        const dx=Math.max(solid.min[0]-local.x,0,local.x-solid.max[0]),dz=Math.max(solid.min[2]-local.z,0,local.z-solid.max[2]);
        if(dx*dx+dz*dz<LANDING_FOOTPRINT**2){a.terrain='obstacle';break;}
      }
    }
    a.reason=a.terrain==='water'?'海面には着陸できません。PAD 01または陸地へ移動してください':
      a.terrain==='obstacle'?(inCity?'市街地・建物の上には着陸できません。港のPAD 01へ移動してください':'建物・設備に近すぎます。PAD 01または開けた場所へ移動してください'):
      a.terrain==='slope'?'斜面が急すぎます。平坦な陸地へ移動してください':
      a.altitude>LANDING_ALTITUDE?`地表高度${LANDING_ALTITUDE} m以下へ降下してください`:
      a.relativeSpeed>LANDING_SPEED?`Fを離し、Xで地表との相対速度${LANDING_SPEED} m/s以下に減速してください`:
      a.onPad?'PAD 01に着陸できます':'障害物のない陸地に着陸できます';
    a.ready=a.terrain==='clear'&&a.altitude<=LANDING_ALTITUDE&&a.relativeSpeed<=LANDING_SPEED;
    return a;
  }
  request(s:GameState,positions:Record<string,Vector3>,velocities:Record<string,Vector3>):string {
    if(this.anchor&&this.mode!=='flight') {
      const def=BODY_BY_ID[this.anchor.bodyId];this.frame(def,s.time,positions[def.id]);
      // Leave from the actual parked pose. No teleport or altitude discontinuity.
      bodyPointVelocity(def,s.pos,positions[def.id],velocities[def.id],s.vel).addScaledVector(this.up,30);
      s.quat.copy(this.quaternion);
      s.landed=null;this.anchor=null;this.mode='flight';return '離陸しました';
    }
    const assessment=this.assess(s,positions,velocities),def=assessment.body;
    if(!assessment.ready||!def)return assessment.reason;
    const altitude=assessment.altitude;
    normal.copy(s.pos).sub(positions[def.id]).normalize().applyQuaternion(bodyRotation(def,s.time,rotation).invert());
    this.anchor={bodyId:def.id,normal:[normal.x,normal.y,normal.z]};this.altitude=Math.max(4,altitude);this.mode='approach';
    return `${def.nameJa}への着陸降下を開始`;
  }
  private frame(def:BodyDef,time:number,center:Vector3):void {
    normal.fromArray(this.anchor!.normal);updateSurfaceFrame(def,normal,time,center,zero,this.referenceFrame);
    this.up.set(0,1,0).applyQuaternion(this.referenceFrame.rotation);this.surface.copy(this.referenceFrame.position);this.quaternion.copy(this.referenceFrame.rotation);
  }
  update(dt:number,s:GameState,positions:Record<string,Vector3>,velocities:Record<string,Vector3>):boolean {
    if(!this.anchor)return false;
    const def=BODY_BY_ID[this.anchor.bodyId];this.frame(def,s.time,positions[def.id]);
    this.referenceFrame.velocity.add(velocities[def.id]);
    if(this.mode==='approach')this.altitude=Math.max(3.3,this.altitude-dt*Math.max(7,Math.min(75,this.altitude*.7)));
    else this.altitude=3.3;
    s.pos.copy(this.surface).addScaledVector(this.up,this.altitude);bodyPointVelocity(def,s.pos,positions[def.id],velocities[def.id],s.vel);
    s.quat.slerp(this.quaternion,1-Math.exp(-dt*3));
    if(this.mode==='approach'&&this.altitude<=3.3){this.mode='landed';s.landed=this.anchor;s.landings.add(def.id);return true;}
    return false;
  }
}
