import { Matrix4, Quaternion, Vector3 } from 'three';
import type { BodyDef } from '../data/types';
import { BODY_BY_ID, BODY_DEFS } from '../data/starSystem';
import type { GameState } from '../core/state';

export interface LandingRecord { bodyId: string; normal: [number,number,number] }
export const canLand = (def: BodyDef): boolean => (def.kind==='planet'||def.kind==='moon')&&!!def.surface&&def.surface.program!=='gas';
const normal=new Vector3(),tangent=new Vector3(),relative=new Vector3(),zero=new Vector3(),up=new Vector3(0,1,0),matrix=new Matrix4();
const spin=(def:BodyDef,time:number)=>time*Math.PI*2/def.rotationPeriod;

export class LandingSystem {
  mode: 'flight'|'approach'|'landed'='flight';
  anchor: LandingRecord|null=null;
  altitude=0;
  readonly surface=new Vector3();
  readonly up=new Vector3(0,1,0);
  readonly quaternion=new Quaternion();
  restore(record:LandingRecord|null): void {this.anchor=record;this.mode=record?'landed':'flight';}
  nearest(s:GameState,positions:Record<string,Vector3>):BodyDef|null {
    let best:BodyDef|null=null,dist=Infinity;
    for(const def of BODY_DEFS)if(canLand(def)) {const d=s.pos.distanceTo(positions[def.id])-def.radius;if(d<dist){dist=d;best=def;}}
    return best;
  }
  request(s:GameState,positions:Record<string,Vector3>,velocities:Record<string,Vector3>):string {
    if(this.anchor&&this.mode!=='flight') {
      const def=BODY_BY_ID[this.anchor.bodyId];this.frame(def,s.time,positions[def.id]);
      s.pos.copy(this.surface).addScaledVector(this.up,55);s.vel.copy(velocities[def.id]).addScaledVector(this.up,30);
      s.quat.copy(this.quaternion);
      s.landed=null;this.anchor=null;this.mode='flight';return '離陸しました';
    }
    const def=this.nearest(s,positions);if(!def)return 'この付近に着陸可能な天体がありません';
    const altitude=s.pos.distanceTo(positions[def.id])-def.radius;
    if(altitude>450)return `${def.nameJa}の高度450u以内で着陸できます`;
    if(relative.copy(s.vel).sub(velocities[def.id]).length()>100)return 'Xで相対速度100u/s以下に減速してください';
    normal.copy(s.pos).sub(positions[def.id]).normalize().applyAxisAngle(up,-spin(def,s.time));
    this.anchor={bodyId:def.id,normal:[normal.x,normal.y,normal.z]};this.altitude=Math.max(4,altitude);this.mode='approach';
    return `${def.nameJa}への着陸降下を開始`;
  }
  private frame(def:BodyDef,time:number,center:Vector3):void {
    normal.fromArray(this.anchor!.normal).applyAxisAngle(up,spin(def,time));this.up.copy(normal);
    this.surface.copy(center).addScaledVector(normal,def.radius+.35);
    tangent.set(0,1,0).addScaledVector(normal,-normal.y);
    if(tangent.lengthSq()<.01)tangent.set(1,0,0).addScaledVector(normal,-normal.x);
    tangent.normalize();matrix.lookAt(zero,tangent,normal);this.quaternion.setFromRotationMatrix(matrix);
  }
  update(dt:number,s:GameState,positions:Record<string,Vector3>,velocities:Record<string,Vector3>):boolean {
    if(!this.anchor)return false;
    const def=BODY_BY_ID[this.anchor.bodyId];this.frame(def,s.time,positions[def.id]);
    if(this.mode==='approach')this.altitude=Math.max(3.3,this.altitude-dt*Math.max(7,Math.min(75,this.altitude*.7)));
    else this.altitude=3.3;
    s.pos.copy(this.surface).addScaledVector(this.up,this.altitude);s.vel.copy(velocities[def.id]);
    s.quat.slerp(this.quaternion,1-Math.exp(-dt*3));
    if(this.mode==='approach'&&this.altitude<=3.3){this.mode='landed';s.landed=this.anchor;s.landings.add(def.id);return true;}
    return false;
  }
}
