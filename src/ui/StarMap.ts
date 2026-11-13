import type {Game} from '../core/Game';
import {BODY_DEFS,BODY_BY_ID} from '../data/starSystem';
import {TRAVEL_DESTINATIONS} from '../systems/travel';
import {CITY_STOPS,SETTLEMENT_BUILDINGS} from '../data/settlement';
import {fmtDist,h} from './dom';

export function starMap(game:Game,selectedId:string,select:(id:string)=>void,arrive:()=>void):HTMLElement{
 const selected=TRAVEL_DESTINATIONS.find(d=>d.id===selectedId)??TRAVEL_DESTINATIONS[0];
 const chart=h('div',{class:'star-chart','aria-label':'リリオン星系の模式図'});
 const planets=BODY_DEFS.filter(d=>d.kind==='planet');
 for(let i=0;i<planets.length;i++)chart.append(h('i',{class:'map-orbit',style:`width:${44+i*16}%;height:${44+i*16}%`}));
 const node=(id:string,label:string,x:number,y:number,kind:string)=>h('button',{class:`map-node ${kind}${id===selectedId||id===selected.bodyId?' selected':''}`,'data-map-node':id,'aria-label':`${label}をマップで選択`,style:`left:${x}%;top:${y}%`,onclick:()=>select(id)},h('i'),h('span',{},label));
 chart.append(node('lyrion','LYRION',50,50,'star'));
 planets.forEach((d,i)=>{const p=game.travelPosition(d.id)!,angle=Math.atan2(p.z,p.x),r=22+i*8;chart.append(node(d.id,d.name,Math.max(16,Math.min(84,50+Math.cos(angle)*r)),Math.max(12,Math.min(84,50+Math.sin(angle)*r)),'planet'));});
 chart.append(h('span',{class:'map-scale'},'航路模式図 / 距離は圧縮・衛星は一覧から選択'));
 const list=h('div',{class:'map-list','aria-label':'移動先一覧'},...TRAVEL_DESTINATIONS.map(d=>h('button',{
  class:`map-destination${d.id===selected.id?' selected':''}`,'data-travel-id':d.id,'aria-pressed':String(d.id===selected.id),onclick:()=>select(d.id),
 },h('span',{},d.name),h('small',{},d.id==='prime-base'?'地上港':d.id==='asterion'?'軌道基地':game.state.scanned.has(d.id)?'調査済み':'未調査'))));
 const reason=game.travelBlockReason(selected.id),p=game.travelPosition(selected.id)!;
 const def=BODY_BY_ID[selected.id];
 return h('div',{class:'map-body'},
  game.surface.active?h('section',{class:'city-transit'},
   h('div',{class:'label'},'PORT LYRA / CITY TRANSIT'),h('h2',{},'市内シャトル・区画案内'),
   h('p',{},`約2 kmに広がる${SETTLEMENT_BUILDINGS.length}棟の街。区画を選ぶと無料で移動します。LX-07は宇宙港に駐機したままです。`),
   h('div',{class:'city-stop-list'},...CITY_STOPS.map((stop,i)=>h('button',{class:'city-stop','data-city-stop':stop.id,disabled:!game.cityTravelAvailable(),onclick:()=>{if(game.cityTravelTo(stop.id))game.resume();}},
    h('strong',{},`${String(i+1).padStart(2,'0')} / ${stop.name}`),h('span',{},stop.detail),h('small',{},'シャトルで移動 →'),
   ))),h('p',{class:'dim small'},'街の外では利用できません。惑星間の移動は宇宙港へ戻り、Hで搭乗・Gで離陸してから。'),
  ):null,
  h('p',{class:'map-intro'},'移動先を選んでテレポート。料金・クールダウンなし。調査・採取・報告は到着後に行います。'),
  h('div',{class:'map-layout'},h('div',{class:'map-overview'},chart,list),h('section',{class:'map-detail'},
   h('div',{class:'label'},'DESTINATION'),h('h2',{},selected.name),h('p',{},selected.detail),
   h('p',{class:'map-distance'},`現在地から ${fmtDist(game.state.pos.distanceTo(p))}`),
   ...(def?[h('p',{class:'dim small'},`${def.name} / ${def.classLabel}`)]:[]),
   h('p',{class:`map-travel-reason${reason?' blocked':''}`,role:'status'},reason??'移動できます。現在の速度を解除して安全な位置へ到着します。'),
   h('button',{class:'btn primary','data-action':'teleport',disabled:!!reason,onclick:arrive},'ここへテレポート'),
   h('p',{class:'dim small'},'機内・通常飛行中のみ使用できます。Mで開閉 / Escで戻る。目的地の選択だけでは移動しません。'),
  )),
 );
}
