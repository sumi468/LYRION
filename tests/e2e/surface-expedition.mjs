import {chromium,serve,launchOptions} from './harness.mjs';
import {writeFileSync} from 'node:fs';
const server=await serve(4197),browser=await chromium.launch(launchOptions()),results=[],errors=[];
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(ok?'PASS':'FAIL',name,JSON.stringify(data??''));};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>{errors.push(String(e));console.log('ERROR',String(e).slice(0,1200));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('ERROR',m.text().slice(0,1200));}});
 const backend=process.env.RENDERER==='webgpu'?'webgpu':'webgl2';
 await page.addInitScript(renderer=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer,difficulty:'off'})),backend);
 await page.goto(server.url.replace('renderer=webgl2',`renderer=${backend}`));await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 check('指定した実レンダラーで起動',await page.evaluate(backend=>window.__lyrion.rendererStatus.backend===backend,backend));
 await page.evaluate(()=>{const g=window.__lyrion;g.startNew();g.stop();g.startFirstSteps();});
 const step=(n,dt=.05)=>page.evaluate(([n,dt])=>{for(let i=0;i<n;i++)window.__lyrion.tick(dt);},[n,dt]);
 await step(3);await page.screenshot({path:'docs/screenshots/nextgen-orbit.png'});
 await page.evaluate(()=>window.__lyrion.debugSurface(18000));await step(3);await page.screenshot({path:'docs/screenshots/nextgen-entry.png'});
 await page.evaluate(()=>window.__lyrion.debugSurface(400));await step(3);await page.screenshot({path:'docs/screenshots/nextgen-approach.png'});
 await page.evaluate(()=>window.__lyrion.handlePlayAction('land'));await step(230);
 check('PRIMEの実地形に着陸',await page.evaluate(()=>window.__lyrion.landing.mode==='landed'),await page.evaluate(()=>({mode:window.__lyrion.landing.mode,altitude:window.__lyrion.landing.altitude,info:window.__lyrion.rendererInfo.render})));
 await page.screenshot({path:'docs/screenshots/nextgen-landed.png'});
  await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await step(30);
  check('地上に降りて重力で接地',await page.evaluate(()=>window.__lyrion.surface.active&&window.__lyrion.surface.grounded),await page.evaluate(()=>({local:window.__lyrion.surface.localPosition.toArray(),velocity:window.__lyrion.surface.localVelocity.toArray()})));
  const foot=await page.evaluate(()=>window.__lyrion.surface.pose.position.toArray());await page.keyboard.down('KeyW');await step(40);await page.keyboard.up('KeyW');await step(10);
  check('宇宙服で実地形を歩ける',await page.evaluate(()=>window.__lyrion.surface.walked>3),foot);
  await page.screenshot({path:'docs/screenshots/nextgen-walking.png'});
  await page.keyboard.down('KeyS');await step(40);await page.keyboard.up('KeyS');await step(20);
  const walkTo=async(target)=>{
    const result=await page.evaluate(target=>{
      const g=window.__lyrion,destination=g.surface.localPosition.clone();
      if(typeof target==='string')g.surface.frame.toLocal(g.basePoints[target],destination);else destination.set(target[0],0,target[1]);
      let travelled=0;
      for(let i=0;i<1800;i++){
        const p=g.surface.localPosition,dx=destination.x-p.x,dz=destination.z-p.z,d=Math.hypot(dx,dz);if(d<1.5)break;
        const speed=Math.min(1,d/3);g.input.virtual.turn=dx/d*speed;g.input.virtual.thrust=-dz/d*speed;g.tick(.05);travelled++;
      }
      g.input.virtual.turn=g.input.virtual.thrust=0;for(let i=0;i<15;i++)g.tick(.05);
      return {distance:Math.hypot(destination.x-g.surface.localPosition.x,destination.z-g.surface.localPosition.z),ticks:travelled,step:g.state.surfaceProgress.step};
    },target);check(`実歩行で移動 ${JSON.stringify(target)}`,result.distance<2.5,result);
  };
  await walkTo([-8,-16]);await walkTo('geology');
  check('地質調査の目標まで進行',await page.evaluate(()=>window.__lyrion.state.surfaceProgress.step===4));
  await page.evaluate(()=>window.__lyrion.handlePlayAction('investigate'));await step(70);
  check('実作業で地質調査を完了',await page.evaluate(()=>window.__lyrion.state.surfaceProgress.inspected&&window.__lyrion.state.surfaceProgress.step===5));
  await page.evaluate(()=>window.__lyrion.saveNow());await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
  await page.evaluate(()=>{const g=window.__lyrion;g.continueGame();g.stop();});await step(3);
  check('途中の調査・着陸状態を保存復帰',await page.evaluate(()=>window.__lyrion.state.surfaceProgress.step===5&&window.__lyrion.landing.mode==='landed'&&!window.__lyrion.surface.active));
  check('再開後も地上基地を追跡',await page.evaluate(()=>window.__lyrion.targetId==='prime-base'));
  await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await step(30);await walkTo([-8,-16]);await walkTo('geology');
  await page.evaluate(()=>window.__lyrion.handlePlayAction('investigate'));await step(110);
  check('実作業で試料を採取',await page.evaluate(()=>window.__lyrion.state.surfaceProgress.sampled));
  await walkTo([-8,-16]);await walkTo([-12,20]);await walkTo('control');
  await page.evaluate(()=>window.__lyrion.handlePlayAction('investigate'));await step(70);
  check('地上本部で成果を報告',await page.evaluate(()=>window.__lyrion.state.surfaceProgress.reported));
  await page.screenshot({path:'docs/screenshots/nextgen-base.png'});
  await walkTo([-12,16]);await walkTo([-6,-2.2]);
  await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await step(3);
  check('ハッチに歩いて戻り再搭乗',await page.evaluate(()=>!window.__lyrion.surface.active));
  check('軌道帰還の誘導先が地表でなく上空を指す',await page.evaluate(()=>window.__lyrion.state.surfaceProgress.step===8&&window.__lyrion.surfaceGoalDistance()>100000));
 const before=await page.evaluate(()=>window.__lyrion.state.pos.toArray());await page.evaluate(()=>window.__lyrion.handlePlayAction('land'));
 const after=await page.evaluate(()=>window.__lyrion.state.pos.toArray());check('離陸時に位置を瞬間移動しない',before.every((v,i)=>Math.abs(v-after[i])<1e-6));await step(30);
 check('離陸して操縦に復帰',await page.evaluate(()=>window.__lyrion.landing.mode==='flight'&&window.__lyrion.state.landed===null));
 await page.evaluate(()=>{const g=window.__lyrion;g.state.quat.setFromUnitVectors(g.state.pos.clone().set(0,0,-1),g.landing.up);});
 const ascent=await page.evaluate(()=>{const g=window.__lyrion,start=g.state.data;let ticks=0;for(;ticks<10000&&!g.state.surfaceProgress.rewarded;ticks++){g.input.virtual.thrust=1;g.input.virtual.boost=g.state.energy>12;g.tick(.05);}g.input.virtual.thrust=0;g.input.virtual.boost=false;return{ticks,rewarded:g.state.surfaceProgress.rewarded,data:g.state.data-start,step:g.state.surfaceProgress.step,info:g.rendererInfo.render};});
 check('実推進で高度120 kmへ戻り報酬を受け取る',ascent.rewarded&&ascent.data===150,ascent);
 const data=await page.evaluate(()=>window.__lyrion.state.data);await step(20);check('報酬が重複しない',await page.evaluate(data=>window.__lyrion.state.data===data,data));
 await page.keyboard.press('KeyB');await page.getByRole('button',{name:'遠征の目標を表示',exact:true}).click();
 check('地上任務後に既存の遠征へ追跡を切り替えられる',await page.evaluate(()=>!window.__lyrion.state.surfaceProgress.active&&!window.__lyrion.snapshot().mission?.code?.includes('SURFACE')&&window.__lyrion.targetId==='asterion'));
 check('描画・ページエラーなし',errors.length===0,errors);
}catch(e){check('テスト完遂',false,String(e));}finally{await browser.close();server.close();writeFileSync('docs/validation/surface-expedition.json',JSON.stringify({results,errors},null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
