import {FIRST_STEPS,FIRST_STEPS_REWARD} from '../data/surfaceCampaign';
export interface SurfaceProgress{active:boolean;step:number;walked:number;inspected:boolean;sampled:boolean;reported:boolean;rewarded:boolean}
export const createSurfaceProgress=():SurfaceProgress=>({active:false,step:0,walked:0,inspected:false,sampled:false,reported:false,rewarded:false});
export function sanitizeSurfaceProgress(raw:unknown):SurfaceProgress{
 const s=createSurfaceProgress();if(!raw||typeof raw!=='object')return s;const d=raw as Partial<SurfaceProgress>;
 s.active=d.active===true;s.step=typeof d.step==='number'&&Number.isFinite(d.step)?Math.max(0,Math.min(FIRST_STEPS.length,Math.floor(d.step))):0;
 s.walked=typeof d.walked==='number'&&Number.isFinite(d.walked)?Math.max(0,d.walked):0;
 s.inspected=d.inspected===true;s.sampled=d.sampled===true;s.reported=d.reported===true;s.rewarded=d.rewarded===true;
 // Never let inconsistent imported fields skip the required research/report.
 if(s.step>4&&!s.inspected)s.step=4;if(s.step>5&&!s.sampled)s.step=5;if(s.step>6&&!s.reported)s.step=6;
 return s;
}
export interface SurfaceContext{nearPrime:boolean;altitude:number;landedPrime:boolean;onFoot:boolean;grounded:boolean;walked:number}
export function advanceSurfaceCampaign(s:SurfaceProgress,c:SurfaceContext):number{
 if(!s.active)return 0;s.walked=Math.max(s.walked,c.walked);
 const ready=[c.nearPrime&&c.altitude<30000,c.landedPrime,c.onFoot&&c.grounded,s.walked>=12,s.inspected,s.sampled,s.reported,!c.onFoot&&c.landedPrime,c.nearPrime&&!c.landedPrime&&!c.onFoot&&c.altitude>=120000];
 if(s.step<FIRST_STEPS.length&&ready[s.step])s.step++;
 if(s.step===FIRST_STEPS.length&&!s.rewarded){s.rewarded=true;return FIRST_STEPS_REWARD;}return 0;
}
/** Timed work is transient. Only completed tasks enter the durable mission state. */
export class SurfaceResearch{
 step=-1;elapsed=0;
 get active(){return this.step>=0;}
 get duration(){return this.step===5?5:3;}
 get progress(){return this.active?this.elapsed/this.duration:0;}
 request(s:SurfaceProgress,onFoot:boolean,distance:number):string{
  if(!s.active)return 'BのMISSION CONTROLでFIRST STEPSを選択してください';
  if(!onFoot)return '地上に降りて調査してください';
  if(![4,5,6].includes(s.step))return '現在の目標を先に達成してください';
  if(distance>3.5)return '調査対象の3.5 m以内へ近づいてください';
  if(this.active)return '作業中です。その場でお待ちください';
  this.step=s.step;this.elapsed=0;return s.step===4?'地質観測を開始':s.step===5?'岩石試料の採取を開始':'地上本部へ成果を送信中';
 }
 update(dt:number,s:SurfaceProgress,onFoot:boolean,distance:number):string|null{
  if(!this.active)return null;
  if(!onFoot||distance>4||s.step!==this.step){this.cancel();return '対象から離れたため作業を中断しました';}
  this.elapsed+=dt;if(this.elapsed<this.duration)return null;
  const step=this.step;this.cancel();if(step===4)s.inspected=true;if(step===5)s.sampled=true;if(step===6)s.reported=true;
  return step===4?'地質観測完了。次は試料を採取します':step===5?'岩石試料を密封しました。地上本部へ報告してください':'地上本部へ報告完了。LX-07へ戻り、軌道へ上がりましょう';
 }
 cancel(){this.step=-1;this.elapsed=0;}
}
