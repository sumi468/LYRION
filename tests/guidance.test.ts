import { describe,expect,it } from 'vitest';
import { EXPEDITIONS } from '../src/data/expeditions';
import { guidanceAction, type GuidanceContext } from '../src/systems/guidance';
import { createHomecomingProgress } from '../src/systems/expeditions';
const base: GuidanceContext={mode:'flight',landing:'flight',distance:20,relativeSpeed:3,dockReason:null,investigationId:null,workProgress:0,touch:false};
describe('Next gameplay action',()=>{
  it('teaches docking before mission acceptance and reporting after docking',()=>{
    const p=createHomecomingProgress();expect(guidanceAction(EXPEDITIONS[0].objectives[0],p,base)).toContain('Tで接岸');
    expect(guidanceAction(EXPEDITIONS[0].objectives[0],p,{...base,mode:'docked'})).toContain('MISSION CONTROL');
    expect(guidanceAction(EXPEDITIONS[0].objectives.at(-1)!,p,{...base,mode:'docked'})).toContain('遠征成果を報告');
  });
  it('returns an EVA player to the cabin before briefing or reporting',()=>{
    const p=createHomecomingProgress(),brief=EXPEDITIONS[0].objectives[0],report=EXPEDITIONS[0].objectives.at(-1)!;
    expect(guidanceAction(brief,p,{...base,mode:'eva'})).toContain('Yで機内へ帰還 → Tで接岸');
    p.docked=true;
    const dockedEva=guidanceAction(brief,p,{...base,mode:'eva'});
    expect(dockedEva).toContain('Yで機内へ帰還 → B');expect(dockedEva).not.toContain('Tで接岸');
    expect(guidanceAction(report,p,{...base,mode:'eva'})).toContain('Yで機内へ帰還');
    expect(guidanceAction(brief,p,{...base,mode:'eva',touch:true})).toContain('帰還で機内へ');
  });
  it('shows real investigation range and active work instead of an unusable key',()=>{
    const p=createHomecomingProgress(),o=EXPEDITIONS[1].objectives.find(o=>o.id==='inspection-panel')!;
    expect(guidanceAction(o,p,base)).toContain('船外へ');
    expect(guidanceAction(o,p,{...base,mode:'eva',distance:4})).toContain('3.6u以内へ');
    expect(guidanceAction(o,p,{...base,mode:'eva',distance:3})).toContain('Eキーで調査');
    expect(guidanceAction(o,p,{...base,mode:'eva',investigationId:o.target!,workProgress:.6})).toContain('60%');
    expect(guidanceAction(o,p,{...base,mode:'eva',distance:3,touch:true})).toContain('調査ボタン');
  });
  it('explains dock preconditions and the difference between return assist and boarding',()=>{
    const p=createHomecomingProgress(),dock=EXPEDITIONS[0].objectives.find(o=>o.kind==='dock')!,board=EXPEDITIONS[1].objectives.find(o=>o.kind==='board')!;
    expect(guidanceAction(dock,p,{...base,dockReason:'相対速度を落とす'})).toBe('相対速度を落とす');
    expect(guidanceAction(board,p,{...base,mode:'eva',distance:10})).toContain('Yでハッチ');
    expect(guidanceAction(board,p,{...base,mode:'eva',distance:2})).toContain('HでLX-07');
  });
});
