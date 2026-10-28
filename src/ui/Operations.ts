import type { Game } from '../core/Game';
import { EXPEDITIONS } from '../data/expeditions';
import { INVESTIGATIONS } from '../data/homeworld';
import { currentObjective, expeditionAvailable } from '../systems/expeditions';
import { h } from './dom';

/** A real mission board: acceptance, objective history, research results and dock-only services. */
export function operationsPanel(game: Game, refresh: () => void, resume: () => void, upgrades: () => void): HTMLElement {
  const s=game.state,p=s.homecoming,objective=currentObjective(p),docked=game.home.mode==='docked';
  const action=(label:string,fn:()=>void,disabled=false)=>h('button',{class:'btn',disabled,onclick:fn},label);
  const cards=h('div',{class:'expedition-cards'});
  for(const mission of EXPEDITIONS){
    const done=p.completed[mission.id]!==undefined,available=expeditionAvailable(p,mission),active=p.activeId===mission.id;
    cards.append(h('article',{class:`expedition-card${active?' active':''}`},
      h('div',{class:'label'},`MISSION ${mission.number} / ${mission.codeName} / ${mission.category} / ${done?'報告済み':available?'受注可能':'未解放'}`),
      h('h3',{},mission.title),h('p',{},mission.briefing),h('p',{class:'exp-location'},`${mission.location} / 報酬 ${mission.reward} DATA`),
      h('ol',{},...mission.objectives.map(o=>h('li',{class:p.objectives.includes(o.id)?'done':'','data-target':o.target??''},`${p.objectives.includes(o.id)?'✓ ':''}${o.text}`))),
      done?h('p',{class:'research-result'},mission.conclusion):action(active&&p.accepted.includes(mission.id)?'この遠征を追跡中':'受注して追跡',()=>{game.selectExpedition(mission.id);refresh();},!available||!docked),
    ));
  }
  const research=h('div',{class:'research-log'});
  for(const def of INVESTIGATIONS)if(p.investigated[def.id]!==undefined)research.append(h('article',{},h('h4',{},def.name),h('p',{},def.result)));
  if(!research.children.length)research.append(h('p',{},'船外調査で得た観測・修理・回収の記録がここに残ります。'));
  return h('div',{class:'operations-body'},
    h('div',{class:'operations-intro'},h('h2',{},'ASTERION STATION / MISSION CONTROL'),h('p',{},'故郷の軌道を離れ、観測し、帰還して報告する。6つの遠征が新しい航路を開きます。'),
      h('p',{class:'campaign-name'},'EXPEDITION CAMPAIGN / 6 MISSIONS'),
      h('p',{},`現在の遠征：${p.activeId?EXPEDITIONS.find(m=>m.id===p.activeId)?.title??'未受注':'未受注'} / 次の目標：${objective?.text??'遠征を選択してください'}`),
      h('p',{},`現在：${game.home.mode==='eva'?'船外活動中':docked?'係留中':'航行中'} / ${objective?.text??'遠征を選択してください'}`),
      h('div',{class:'operations-actions'},action(game.phase==='menu'?'メニューへ戻る':'操縦へ戻る',resume),action('基地へ誘導',()=>game.navigateHome(),game.phase==='menu'&&!game.menuHasSave),action('基地で修理・補給',()=>{game.stationService();refresh();},!docked),action('機体アップグレード',upgrades),
        action('遠征成果を報告',()=>{game.reportExpedition();refresh();},!docked||objective?.kind!=='report'),
        action(p.tracked?'従来の探査目標を表示':'遠征の目標を表示',()=>{p.tracked=!p.tracked;game.saveNow();refresh();}))),
    h('p',{class:'operations-controls'},game.input.touchMode?'DOCK：接岸・離脱 / EVA：船外・搭乗 / 調査：設備で作業 / 帰還：機体へ戻る。左スティックで移動、空いた画面をドラッグして向きを変えます。':'T：接岸・離脱 / H：船外・搭乗 / E：船外調査 / Y：帰還支援 / B：遠征ボード。船外はWASD移動、Space / Shift上下、マウス・矢印で向き、X制動。'),
    h('p',{},'接岸は惑星と反対側の誘導灯から150u以内・相対速度18u/s以下。船外に出るときは相対速度10u/s以下。宇宙服の酸素は6分、活動半径は600u。危険時は安全回収します。'),
    h('p',{},docked?'係留中：受注・報告・補給が利用できます。':'遠征の受注と成果報告はASTERIONへの接岸後に行います。「基地へ誘導」で帰還先を選択できます。'),
    cards,h('h2',{},'調査アーカイブ'),research,
  );
}
