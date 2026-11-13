import {Quaternion,Vector3} from 'three';
import {BODY_DEFS} from '../data/starSystem';
import type {BodyDef} from '../data/types';
import {PRIME_BASE_ID} from '../data/surfaceCampaign';
import {STATION_ID} from '../data/homeworld';
import {bodyPointVelocity,bodyRotation} from '../physics/worldScale';
import {PRIME_BASE_NORMAL,solidHeight} from '../physics/terrain';
import type {ReferenceFrame} from '../physics/frames';

export const TRAVEL_DESTINATIONS=[
 {id:PRIME_BASE_ID,name:'PORT LYRA / PAD 01',detail:'母星の着陸パッド上空400 m。到着後Gで着陸できます。',bodyId:'lyrion-prime'},
 {id:STATION_ID,name:'ASTERION STATION',detail:'接岸誘導灯の手前へ移動。到着後Tで接岸できます。',bodyId:'lyrion-prime'},
 ...BODY_DEFS.map(d=>({id:d.id,name:d.nameJa,bodyId:d.id,detail:d.homeworld?'母星の基地上空5 kmへ移動。地上へはPAD 01も選べます。':d.kind==='star'?'熱の危険域より外へ移動。スキャンはRで行います。':d.kind==='belt'?'小惑星帯の上側の安全空間へ移動します。':d.kind==='anomaly'?'探査機の近くへ移動。調査はEVAで行います。':'地形とリングを避けた上空1.5 kmへ移動。着陸・調査は到着後に行います。'})),
];
export interface TravelContext {phase:string;onFoot:boolean;eva:boolean;landing:string;docking:string;enemies:number}
export function travelBlockReason(id:string,c:TravelContext):string|null{
 if(!TRAVEL_DESTINATIONS.some(d=>d.id===id))return '移動先が見つかりません';
 if(c.phase!=='playing'&&c.phase!=='paused')return 'ゲームを開始してからテレポートできます';
 if(c.onFoot||c.eva)return '船外活動中です。Hで宇宙船へ搭乗してから移動してください';
 if(c.landing!=='flight')return 'Gで離陸、または着陸降下を中止してから移動してください';
 if(c.docking!=='flight')return 'Tでステーションから離脱し、離脱が完了してから移動してください';
 if(c.enemies>0)return '交戦中はテレポートできません。敵を倒すか戦闘から離脱してください';
 return null;
}
export class TravelPose {readonly position=new Vector3();readonly velocity=new Vector3();readonly rotation=new Quaternion();}
const direction=new Vector3(),local=new Vector3(),forward=new Vector3(0,0,-1),rotation=new Quaternion();
/** Metre-scale arrivals use the shared terrain and rotating reference frames. */
export function bodyArrival(d:BodyDef,time:number,center:Vector3,velocity:Vector3,out:TravelPose):void{
 if(d.kind==='belt'&&d.belt){out.position.set((d.belt.inner+d.belt.outer)/2,d.belt.halfThickness+300,0);out.velocity.set(0,0,0);out.rotation.setFromUnitVectors(forward,direction.set(0,-1,0));return;}
 local.copy(d.homeworld?PRIME_BASE_NORMAL:direction.set(.32,.88,.35).normalize());
 const altitude=d.kind==='star'?900:d.kind==='anomaly'?120:d.homeworld?5000:1500;
 direction.copy(local).applyQuaternion(bodyRotation(d,time,rotation));
 out.position.copy(center).addScaledVector(direction,d.radius+solidHeight(d,local)+altitude);
 if(d.kind==='star')out.velocity.copy(velocity);else bodyPointVelocity(d,out.position,center,velocity,out.velocity);
 out.rotation.setFromUnitVectors(forward,direction.negate());
}
export function baseArrival(frame:ReferenceFrame,out:TravelPose):void{
 local.set(0,399.65,0);frame.toWorld(local,out.position);frame.pointVelocity(local,out.velocity);
 out.rotation.setFromUnitVectors(forward,direction.set(0,-1,0).applyQuaternion(frame.rotation));
}
export function stationArrival(frame:ReferenceFrame,out:TravelPose):void{
 local.set(0,12,110);frame.toWorld(local,out.position);frame.pointVelocity(local,out.velocity);out.rotation.copy(frame.rotation);
}
