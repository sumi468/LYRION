import type { ExpeditionObjective } from '../data/expeditions';
import { INVESTIGATION_BY_ID } from '../data/homeworld';
import type { HomecomingProgress } from './expeditions';

export interface GuidanceContext {
  mode: string; landing: string; distance: number; relativeSpeed: number;
  dockReason: string | null; investigationId: string | null; workProgress: number; touch: boolean;
}

/** Short, state-aware next action, shared by the HUD and its regression tests. */
export function guidanceAction(objective: ExpeditionObjective | null, progress: HomecomingProgress, ctx: GuidanceContext): string {
  const key=(desktop:string,touch:string)=>ctx.touch?touch:desktop;
  if(!objective)return key('Bで次の遠征を選ぶ / 自由探査も継続できます','基地から次の遠征を選ぶ / 自由探査も継続できます');
  if(objective.kind==='brief')return ctx.mode==='eva'?key(progress.docked?'Yで機内へ帰還 → Bで任務を受注':'Yで機内へ帰還 → Tで接岸 → Bで任務を受注',progress.docked?'帰還で機内へ → 基地で任務を受注':'帰還で機内へ → DOCKで接岸 → 基地で任務を受注'):ctx.mode==='docked'?key('B → MISSION CONTROLで任務を受注','基地 → MISSION CONTROLで任務を受注'):key('Tで接岸。ASTERIONは任務・補給・帰還の拠点です','DOCKで接岸。ASTERIONは任務・補給・帰還の拠点です');
  if(objective.kind==='report')return ctx.mode==='eva'?key('Yで機内へ帰還してから基地で成果を報告','帰還で機内へ戻ってから基地で成果を報告'):ctx.mode==='docked'?key('B →「遠征成果を報告」で報酬を受け取る','基地 →「遠征成果を報告」で報酬を受け取る'):key('ASTERIONに接岸して成果を報告','ASTERIONに接岸して成果を報告');
  if(objective.kind==='depart')return ctx.mode==='docked'?key('Tで離脱。外側の青い航行標へ機首を向ける','DOCKで離脱。外側の青い航行標へ機首を向ける'):ctx.mode==='undocking'?'離脱通路を移動中。完了後に操縦できます':key('Sで基地から後退 / A・Dで航行標へ旋回','スティックを下へ倒して後退し、航行標へ旋回');
  if(objective.kind==='stabilize')return key(`Xで制動 / 相対速度 ${ctx.relativeSpeed.toFixed(1)} → 8u/s以下を2秒保持`,`BRAKEで制動 / 相対速度 ${ctx.relativeSpeed.toFixed(1)} → 8u/s以下を2秒保持`);
  if(objective.kind==='dock')return ctx.mode==='eva'?key('Yで船へ戻ってから接岸','帰還で船へ戻ってから接岸'):ctx.mode==='aligning'?'基地の誘導で接岸中':ctx.mode==='undocking'?'離脱完了後に接岸できます':ctx.dockReason??key('Tでドッキング支援を開始','DOCKでドッキング支援を開始');
  if(objective.kind==='eva')return ctx.landing!=='flight'?key('Gで離陸してから船外活動を開始','LANDで離陸してから船外活動を開始'):key('相対速度10u/s以下でH → 船外へ','相対速度10u/s以下でEVA → 船外へ');
  if(objective.kind==='board')return ctx.distance<=4?key('HでLX-07に搭乗','搭乗でLX-07に戻る'):key('Yでハッチへの帰還支援 / 4u以内でH','帰還でハッチへ移動 / 4u以内で搭乗');
  if(objective.kind==='visit'||objective.kind==='investigate'){
    if(ctx.mode!=='eva')return key('Hで船外へ。宇宙飛行士を操作して調査します','EVAで船外へ。宇宙飛行士を操作して調査します');
    if(ctx.investigationId===objective.target)return key(`作業中 ${Math.round(ctx.workProgress*100)}% / 範囲内で待つ・Eで中断`,`作業中 ${Math.round(ctx.workProgress*100)}% / 範囲内で待つ・調査で中断`);
    const def=objective.target?INVESTIGATION_BY_ID[objective.target]:null;
    if(def?.requires&&progress.investigated[def.requires]===undefined)return '先に関連設備の診断を完了してください';
    return ctx.distance<=3.6?key('Eキーで調査を開始 / 作業中は3.6u以内に留まる','調査ボタンで作業開始 / 3.6u以内に留まる'):key('WASDとSpace / Shiftで設備の3.6u以内へ','スティックと上昇・下降で設備の3.6u以内へ');
  }
  if(objective.kind==='scan-body')return key('対象を選び、範囲内でRを押してスキャン','対象を選び、範囲内でSCANを押す');
  if(objective.kind==='land')return key('高度450u以内・速度100u/s以下でG','高度450u以内・速度100u/s以下でLAND');
  return ctx.mode==='eva'?key('宇宙船での航行目標です。Yで船へ帰還','宇宙船での航行目標です。帰還で船へ戻る'):key('青いマーカーへ旋回してWで推進 / 近づいたらXで制動','青いマーカーへ旋回して推進 / 接近したらBRAKE');
}
