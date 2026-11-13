import {chromium,serve,launchOptions} from './harness.mjs';
import {readFileSync,writeFileSync} from 'node:fs';

const server=process.env.BASE_URL?{url:process.env.BASE_URL.split('?')[0]+'?debug&renderer=webgl2',close(){}}:await serve(4221),browser=await chromium.launch(launchOptions()),results=[],errors=[];
const shots=process.env.ARTIFACT_PREFIX??'docs/screenshots/map-aim',reportPath=process.env.REPORT_PATH??'docs/validation/map-aim.json';
const report={time:new Date().toISOString(),build:JSON.parse(readFileSync('dist/build-info.json','utf8')),browser:browser.version(),headless:launchOptions().headless,results,errors};
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(ok?'PASS':'FAIL',name,JSON.stringify(data??''));};
const tick=(page,n=3)=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__lyrion.tick(.05);},n);
const map=page=>page.locator('[data-screen="map"]');
const choose=(page,id)=>map(page).locator(`[data-travel-id="${id}"]`).first().click();
const travel=page=>map(page).locator('[data-action="teleport"]');
async function play(page){await page.evaluate(()=>{const g=window.__lyrion;if(g.phase==='paused')g.resume();g.stop();});await map(page).waitFor({state:'hidden'});}
async function open(backend,touch=false,landscape=false){
 const page=await browser.newPage({viewport:touch?(landscape?{width:844,height:390}:{width:390,height:844}):{width:1280,height:800},hasTouch:touch,isMobile:touch});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(renderer=>{if(!localStorage.getItem('lyrion.settings.v1'))localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer,difficulty:'off',audioEnabled:false}));},backend);
 await page.goto(server.url.replace('renderer=webgl2',`renderer=${backend}`));await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 report.build=await page.evaluate(async()=>await(await fetch('/build-info.json',{cache:'no-store'})).json());
 if(process.env.EXPECTED_SOURCE_HASH&&report.build.sourceHash!==process.env.EXPECTED_SOURCE_HASH)throw Error('配信ソースが公開対象と一致しません');
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.startNew();g.stop();g.input.locked=true;});return page;
}
async function openMap(page){await play(page);await page.keyboard.press('KeyM');await map(page).waitFor({state:'visible'});await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-screen="map"]')).opacity)>.99);}

try{
 for(const backend of (process.env.RENDERER?[process.env.RENDERER]:['webgl2','webgpu'])){
  const page=await open(backend),status=await page.evaluate(()=>window.__lyrion.rendererStatus);
  check(`${backend} 実GPUで起動`,status.backend===backend&&status.hardware===true,status);
  const invalid=await page.evaluate(()=>{const g=window.__lyrion,p=g.state.pos.clone();return{reason:g.travelBlockReason('missing-destination'),rejected:!g.teleportTo('missing-destination'),same:g.state.pos.distanceTo(p)<1e-8};});
  check(`${backend} 未定義の目的地を拒否して現在地を維持`,invalid.rejected&&invalid.same&&typeof invalid.reason==='string'&&invalid.reason.length>0,invalid);
  await openMap(page);
  check(`${backend} Mでゲームを停止し星系マップを開く`,await page.evaluate(()=>window.__lyrion.phase==='paused')&&await map(page).isVisible());
  await choose(page,'cindra');
  const before=await page.evaluate(()=>{const g=window.__lyrion,s=g.state;return{position:s.pos.toArray(),time:s.time,data:s.data,total:s.totalData,hull:s.hull,energy:s.energy,mission:s.missionIndex,scanned:[...s.scanned],surface:JSON.stringify(s.surfaceProgress),home:JSON.stringify(s.homecoming)};});
  await travel(page).click();
  const arrival=await page.evaluate(()=>{const g=window.__lyrion,s=g.state,d=g.views.get('cindra').def;return{position:s.pos.toArray(),time:s.time,data:s.data,total:s.totalData,hull:s.hull,energy:s.energy,mission:s.missionIndex,scanned:[...s.scanned],surface:JSON.stringify(s.surfaceProgress),home:JSON.stringify(s.homecoming),target:g.targetId,altitude:g.surfaceDistance(d),relativeSpeed:s.vel.distanceTo(g.refVel),finite:[...s.pos.toArray(),...s.vel.toArray(),...s.quat.toArray()].every(Number.isFinite),save:JSON.parse(localStorage.getItem('lyrion.save.v1'))};});
  check(`${backend} マップの選択と実ボタンでCINDRAへ移動`,arrival.target==='cindra'&&arrival.finite&&arrival.altitude>20&&arrival.relativeSpeed<.1&&arrival.position.some((v,i)=>Math.abs(v-before.position[i])>1000),{altitude:arrival.altitude,relativeSpeed:arrival.relativeSpeed,target:arrival.target});
  check(`${backend} テレポートは時間・資源・調査・報酬を直接変更しない`,['time','data','total','hull','energy','mission','surface','home'].every(k=>arrival[k]===before[k])&&JSON.stringify(arrival.scanned)===JSON.stringify(before.scanned));
  check(`${backend} 到着位置を即時保存`,arrival.save?.pos?.every((v,i)=>Math.abs(v-arrival.position[i])<.001));
  await tick(page);await page.screenshot({path:`${shots}-${backend}-arrival.png`});
  const saved=await page.evaluate(()=>window.__lyrion.state.pos.toArray());
  await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.continueGame();g.stop();g.input.locked=true;});
  check(`${backend} 再開してもテレポート到着位置を維持`,await page.evaluate(p=>window.__lyrion.state.pos.distanceTo(window.__lyrion.state.pos.clone().fromArray(p))<1,saved));
  await openMap(page);await page.screenshot({path:`${shots}-${backend}-map.png`});
  const ids=await map(page).locator('[data-travel-id]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.travelId))]);
  const repeat=await page.evaluate(ids=>{
   const g=window.__lyrion,initial={data:g.state.data,total:g.state.totalData,hull:g.state.hull,energy:g.state.energy,scanned:JSON.stringify([...g.state.scanned]),time:g.state.time},arrivals=[];
   for(const id of [...ids,...ids.slice().reverse()]){
    const accepted=g.teleportTo(id);let minimumAltitude=Infinity;
    for(const view of g.views.values())if(view.def.radius>0)minimumAltitude=Math.min(minimumAltitude,g.surfaceDistance(view.def));
    arrivals.push({id,accepted,minimumAltitude,finite:[...g.state.pos.toArray(),...g.state.vel.toArray(),...g.state.quat.toArray()].every(Number.isFinite)});
   }
   return{arrivals,unchanged:g.state.data===initial.data&&g.state.totalData===initial.total&&g.state.hull===initial.hull&&g.state.energy===initial.energy&&JSON.stringify([...g.state.scanned])===initial.scanned&&g.state.time===initial.time};
  },ids);
  check(`${backend} 全マップ目的地を反復しても安全な有限座標に到着`,ids.length>=10&&repeat.arrivals.every(r=>r.accepted&&r.finite&&r.minimumAltitude>10),repeat);
  check(`${backend} 反復移動でも資源やスキャン報酬を捏造しない`,repeat.unchanged);
  const transient=await page.evaluate(()=>{
   const g=window.__lyrion;g.resume();g.stop();g.debugTeleport('cindra',120);g.setTarget('cindra');g.toggleScan();const scanStarted=g.scan.id==='cindra';
   g.input.virtual.thrust=1;g.input.virtual.boost=g.input.virtual.fire=true;g.input.keys.add('KeyW');g.input.keys.add('KeyJ');g.combat.bolts[0].active=true;
   const accepted=g.teleportTo('lumen');return{accepted,scanStarted,scan:g.scan.id,keys:g.input.keys.size,virtual:{...g.input.virtual},bolts:g.combat.bolts.filter(b=>b.active).length,lock:g.combat.aimTargetId};
  });
  check(`${backend} 移動時に保持入力・スキャン・残弾・照準ロックを解除`,transient.accepted&&transient.scanStarted&&transient.scan===null&&transient.keys===0&&transient.virtual.thrust===0&&!transient.virtual.boost&&!transient.virtual.fire&&transient.bolts===0&&transient.lock===null,transient);
  await page.evaluate(()=>{const g=window.__lyrion;g.teleportTo('prime-base');g.toggleLanding();});await tick(page,230);
  check(`${backend} PAD 01上空へ移動し通常のG操作で着陸`,await page.evaluate(()=>window.__lyrion.landing.mode==='landed'&&window.__lyrion.state.landed?.bodyId==='lyrion-prime'));
  await openMap(page);await choose(page,'cindra');
  check(`${backend} 着陸中は理由を表示してテレポートボタンを無効化`,await travel(page).isDisabled()&&/離陸|着陸/.test(await map(page).innerText()));
  const parked=await page.evaluate(()=>{const g=window.__lyrion,p=g.state.pos.clone();return{rejected:!g.teleportTo('cindra'),same:g.state.pos.distanceTo(p)<1e-8};});check(`${backend} API経由でも着陸モードを迂回できない`,parked.rejected&&parked.same);
  await play(page);await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await tick(page,30);
  const ground=await page.evaluate(()=>{const g=window.__lyrion,p=g.state.pos.clone(),reason=g.travelBlockReason('cindra');return{active:g.surface.active,rejected:!g.teleportTo('cindra'),same:g.state.pos.distanceTo(p)<1e-8,reason};});
  check(`${backend} 地上探索中の移動を拒否し搭乗を案内`,ground.active&&ground.rejected&&ground.same&&/搭乗|機内|船外|地上/.test(ground.reason??''),ground);
  await page.evaluate(()=>{const g=window.__lyrion;g.handlePlayAction('eva');g.toggleLanding();g.teleportTo('asterion');g.handlePlayAction('dock');});await tick(page,180);
  check(`${backend} ASTERIONの安全な位置から接岸可能`,await page.evaluate(()=>window.__lyrion.home.mode==='docked'));
  await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await tick(page,3);
  await openMap(page);await choose(page,'cindra');check(`${backend} EVA中も理由付きでテレポートを拒否`,await travel(page).isDisabled()&&/船外|搭乗|機内|EVA/.test(await map(page).innerText()));
  await play(page);await page.evaluate(()=>{const g=window.__lyrion;g.handlePlayAction('eva');g.handlePlayAction('dock');});await tick(page,180);
  await page.evaluate(()=>{const g=window.__lyrion;g.state.pos.set(400000000,100000000,400000000);g.state.vel.set(0,0,0);g.refVel.set(0,0,0);g.state.quat.identity();g.applySettings({...g.settings,difficulty:'normal',autoAim:true});g.combat.spawn(g.state,'normal',g.worlds);});
  await openMap(page);await choose(page,'cindra');check(`${backend} 交戦中は移動不可の理由を明示`,await travel(page).isDisabled()&&/交戦|戦闘|敵/.test(await map(page).innerText()));await page.screenshot({path:`${shots}-${backend}-blocked.png`});
  await play(page);
  const aim=await page.evaluate(()=>{
   const g=window.__lyrion;g.input.reset();g.state.quat.identity();g.state.vel.set(0,0,0);g.refVel.set(0,0,0);g.combat.reset();g.combat.spawn(g.state,'normal',g.worlds);
   for(let i=0;i<g.combat.enemies.length;i++)if(g.combat.enemies[i].active){const e=g.combat.enemies[i];e.pos.copy(g.state.pos).add(e.pos.clone().set(i===0?100:0,0,i===0?-400:900+i*50));e.vel.set(0,0,0);}
   g.chase.snap();g.tick(.01);const id=g.combat.aimTargetId,passive=g.combat.bolts.filter(b=>b.active&&!b.hostile).length;
   g.input.keys.add('KeyJ');g.tick(.01);g.input.keys.delete('KeyJ');const bolt=g.combat.bolts.find(b=>b.active&&!b.hostile);
   const result={id,locked:g.combat.aimLocked,passive,corrected:!!bolt&&bolt.vel.clone().sub(g.state.vel).normalize().x>.1,hud:document.querySelector('.hud')?.textContent};
   return result;
  });
  check(`${backend} 機首から外れた前方の敵を自動捕捉し自動射撃はしない`,aim.id===0&&aim.locked&&aim.passive===0,aim);
  check(`${backend} 射撃入力時だけ実弾を予測方向へ補正`,aim.corrected);
  const marker=await page.locator('.lead-marker.auto-lock').evaluate(el=>{const r=el.getBoundingClientRect();return{visible:!el.hidden&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,text:el.textContent};});
  check(`${backend} HUDでオートエイムの捕捉を確認できる`,/AUTO AIM · LOCK/.test(aim.hud??'')&&marker.visible&&marker.text==='AUTO LOCK',marker);await page.screenshot({path:`${shots}-${backend}-lock.png`});
  await page.keyboard.press('KeyP');await page.getByRole('button',{name:'設定',exact:true}).click();
  const autoAim=page.getByLabel('オートエイム',{exact:true});check(`${backend} 設定のオートエイムは初期ON`,await autoAim.isChecked());await autoAim.uncheck();
  check(`${backend} 設定OFFを保存`,await page.evaluate(()=>window.__lyrion.settings.autoAim===false&&JSON.parse(localStorage.getItem('lyrion.settings.v1')).autoAim===false));
  await play(page);await tick(page,1);check(`${backend} OFFで捕捉を解除し手動照準へ戻る`,await page.evaluate(()=>window.__lyrion.combat.aimTargetId===null));await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
  check(`${backend} 再起動後もオートエイムOFFを維持`,await page.evaluate(()=>window.__lyrion.settings.autoAim===false));await page.close();
 }
 for(const landscape of [false,true]){
  const page=await open('webgl2',true,landscape);await tick(page);
  const button=page.getByRole('button',{name:'MAP',exact:true});check(`タッチ${landscape?'横':'縦'}にMAPボタンを表示`,await button.isVisible());await button.tap();await map(page).waitFor({state:'visible'});
  await choose(page,'cindra');
  await travel(page).scrollIntoViewIfNeeded();const geometry=await travel(page).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,w:innerWidth,h:innerHeight};});
  check(`タッチ${landscape?'横':'縦'}で移動ボタンが画面内に収まる`,geometry.x>=0&&geometry.y>=0&&geometry.x+geometry.width<=geometry.w+1&&geometry.y+geometry.height<=geometry.h+1,geometry);
  await page.screenshot({path:`${shots}-mobile-${landscape?'landscape':'portrait'}.png`});await travel(page).tap();await tick(page,3);
  check(`タッチ${landscape?'横':'縦'}のマップから実際に移動`,await page.evaluate(()=>window.__lyrion.targetId==='cindra'&&window.__lyrion.phase==='playing'));
  await page.close();
 }
 check('ページ・描画エラーなし',errors.length===0,errors);
}catch(e){check('検証を完遂',false,String(e));console.error(e);}finally{await browser.close();server.close();writeFileSync(reportPath,JSON.stringify(report,null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
