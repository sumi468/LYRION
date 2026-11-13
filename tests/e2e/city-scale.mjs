import {chromium,serve,launchOptions,sleep} from './harness.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const server=process.env.BASE_URL?{url:process.env.BASE_URL.split('?')[0]+'?debug&renderer=webgl2',close(){}}:await serve(4222);
const browser=await chromium.launch(launchOptions()),results=[],errors=[],performanceSamples=[];
const shots=process.env.ARTIFACT_PREFIX??'docs/screenshots/city',reportPath=process.env.REPORT_PATH??'docs/validation/city-scale.json';
const report={time:new Date().toISOString(),build:null,browser:browser.version(),headless:launchOptions().headless,results,errors,performanceSamples};
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(ok?'PASS':'FAIL',name,JSON.stringify(data??''));};
const tick=(page,n=3)=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__lyrion.tick(.05);},n);
async function open(backend,touch=false,fixture=null){
 const page=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1280,height:800},hasTouch:touch,isMobile:touch});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(({backend,fixture})=>{if(!localStorage.getItem('lyrion.settings.v1'))localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer:backend,difficulty:'off',audioEnabled:false}));if(fixture&&!localStorage.getItem('lyrion.save.v1'))localStorage.setItem('lyrion.save.v1',fixture);},{backend,fixture});
 await page.goto(server.url.replace('renderer=webgl2',`renderer=${backend}`));await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 await page.evaluate(()=>window.__lyrion.texturesReady);
 report.build=await page.evaluate(async()=>await(await fetch('/build-info.json',{cache:'no-store'})).json());if(process.env.EXPECTED_SOURCE_HASH&&report.build.sourceHash!==process.env.EXPECTED_SOURCE_HASH)throw Error('公開ソース不一致');
 await page.evaluate(continuing=>{const g=window.__lyrion;g.input.requestLock=()=>{};continuing?g.continueGame():g.startNew();g.stop();g.input.locked=true;},!!fixture);return page;
}
async function map(page,touch=false){if(touch)await page.getByRole('button',{name:'MAP',exact:true}).tap();else await page.keyboard.press('KeyM');await page.locator('[data-screen="map"]').waitFor({state:'visible'});await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-screen="map"]')).opacity)>.99);}
async function landed(page){await page.evaluate(()=>{const g=window.__lyrion;g.teleportTo('prime-base');g.toggleLanding();});await tick(page,230);await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await tick(page,40);}
async function view(page,eye,look,path){
 await page.evaluate(({eye,look})=>{const g=window.__lyrion,c=g.chase.camera,p=g.state.pos.clone();g.baseFrame.toWorld(p.fromArray(eye),p);c.position.copy(p).sub(g.origin);c.up.set(0,1,0).applyQuaternion(g.baseFrame.rotation);c.lookAt(g.baseFrame.toWorld(p.fromArray(look),p).sub(g.origin));g.surfaceSky.update(g.scene,c,g.camWorld.copy(c.position).add(g.origin),g.positions['lyrion-prime'],g.views.get('lyrion-prime').def,g.positions.lyrion,g.state.time);g.sky.update(c);document.querySelector('.hud').style.display='none';g.renderer.render(g.scene,c);},{eye,look});
 await page.screenshot({path});await page.evaluate(()=>{document.querySelector('.hud').style.display='';window.__lyrion.tick(0);});
}
async function performanceSample(page,backend){
 await page.evaluate(()=>window.__lyrion.start());await sleep(1200);
 const sample=await page.evaluate(async()=>{const g=window.__lyrion,intervals=[];let prev=performance.now(),start=prev;await new Promise(resolve=>{function frame(now){intervals.push(now-prev);prev=now;if(now-start>=3000)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});g.stop();const duration=intervals.reduce((a,b)=>a+b,0);intervals.sort((a,b)=>a-b);return{fps:intervals.length*1000/duration,p95:intervals[Math.floor(intervals.length*.95)],gpuMs:await g.renderer.gpuTime(),calls:g.rendererInfo.render.calls,triangles:g.rendererInfo.render.triangles};});
 performanceSamples.push({backend,viewport:[1280,800],quality:'medium',scene:'expanded city street',sampleMs:3000,...sample});check(`${backend} 拡張都市で実時間FPSと描画予算を確認`,sample.fps>45&&sample.calls<450&&sample.triangles<1500000,sample);
}
try{
 for(const backend of (process.env.RENDERER?[process.env.RENDERER]:['webgl2','webgpu'])){
  const page=await open(backend);check(`${backend} 実GPUで動作`,await page.evaluate(b=>window.__lyrion.rendererStatus.backend===b&&window.__lyrion.rendererStatus.hardware===true,backend));
  const pendingCloud=await page.evaluate(()=>{const g=window.__lyrion,v=g.views.get('lyrion-prime'),texture=v.cloudMat.uniforms.uMap.value;v.cloudMat.uniforms.uMap.value=null;g.tick(0);const hidden=!v.cloudMesh.visible;v.cloudMat.uniforms.uMap.value=texture;g.tick(0);return hidden;});check(`${backend} 未生成の雲テクスチャで白い殻を描画しない`,pendingCloud);
  if(backend==='webgpu'){
   const coverage=await page.evaluate(async()=>{const g=window.__lyrion,t=g.views.get('lyrion-prime').cloudMat.uniforms.uMap.value,gpu=g.renderer.native.backend.get(t).texture,device=g.renderer.device,w=gpu.width,h=gpu.height,bytes=Math.ceil(w*4/256)*256,buffer=device.createBuffer({size:bytes*h,usage:9}),cmd=device.createCommandEncoder();cmd.copyTextureToBuffer({texture:gpu},{buffer,bytesPerRow:bytes,rowsPerImage:h},[w,h,1]);device.queue.submit([cmd.finish()]);await buffer.mapAsync(1);const pixels=new Uint8Array(buffer.getMappedRange());let low=255,high=0,sum=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=pixels[y*bytes+x*4+3];low=Math.min(low,a);high=Math.max(high,a);sum+=a;}buffer.unmap();buffer.destroy();return{mean:sum/(w*h*255),low,high};});
   check('WebGPUの雲量40%が不透明な全球の殻にならない',coverage.mean<.65&&coverage.low<30&&coverage.high>100,coverage);
  }
  const sizes=await page.evaluate(()=>{const g=window.__lyrion;return{prime:g.views.get('lyrion-prime').def.radius,cindra:g.views.get('cindra').def.radius,route:g.views.get('cindra').def.orbit.radius};});check(`${backend} 小さな惑星と短い航路を実配信`,sizes.prime===5000&&sizes.cindra===1200&&sizes.route===50000,sizes);
  const flight=await page.evaluate(()=>{
   const g=window.__lyrion;g.teleportTo('cindra');const from=g.state.pos.clone(),target=g.state.pos.clone(),direction=g.state.pos.clone(),front=g.state.pos.clone().set(0,0,-1);let ticks=0,arrived=false;
   for(;ticks<2400;ticks++){
    const body=g.views.get('thalassa').def;target.copy(g.positions.thalassa).add(direction.set(0,body.radius+1400,0));direction.copy(target).sub(g.state.pos);if(direction.length()<2200){arrived=true;break;}
    g.state.quat.setFromUnitVectors(front,direction.normalize());g.input.virtual.thrust=1;g.input.virtual.boost=true;g.tick(.05);
   }g.input.reset();return{arrived,seconds:ticks*.05,travelled:g.state.pos.distanceTo(from),hull:g.state.hull};
  });check(`${backend} CINDRAからTHALASSAへテレポートなしの通常推進で2分以内`,flight.arrived&&flight.seconds<120&&flight.hull===100,flight);
  await landed(page);check(`${backend} 縮小後もPAD着陸・降機が成立`,await page.evaluate(()=>window.__lyrion.landing.mode==='landed'&&window.__lyrion.surface.active&&window.__lyrion.surface.grounded));
  await view(page,[1200,550,350],[0,45,-750],`${shots}-${backend}-overview.png`);
  await view(page,[20,170,-440],[0,90,-1180],`${shots}-${backend}-skyline.png`);
  await map(page);check(`${backend} 市内の6区画と用途が分かる`,await page.locator('[data-city-stop]').count()===6&&/無料|駐機/.test(await page.locator('.city-transit').innerText()));await page.screenshot({path:`${shots}-${backend}-transit.png`});
  const ids=await page.locator('[data-city-stop]').evaluateAll(nodes=>nodes.map(n=>n.dataset.cityStop));
  const before=await page.evaluate(()=>{const g=window.__lyrion;return{ship:g.state.pos.toArray(),data:g.state.data,walked:g.surface.walked};});
  for(const id of ids){
   if(id!==ids[0])await map(page);await page.locator(`[data-city-stop="${id}"]`).click();await page.locator('[data-screen="map"]').waitFor({state:'hidden'});await tick(page,20);
   const pose=await page.evaluate(()=>{const g=window.__lyrion,p=g.baseFrame.toLocal(g.surface.pose.position,g.state.pos.clone());return{finite:p.toArray().every(Number.isFinite),grounded:g.surface.grounded,local:p.toArray(),distance:g.surface.pose.position.distanceTo(g.baseFrame.position),phase:g.phase};});
   check(`${backend} ${id}へシャトルで移動し接地を維持`,pose.finite&&pose.grounded&&pose.distance<2600&&pose.phase==='playing',pose);
  }
  check(`${backend} シャトルは機体・DATA・歩行の任務進捗を移動しない`,await page.evaluate(before=>{const g=window.__lyrion;return g.state.pos.toArray().every((v,i)=>Math.abs(v-before.ship[i])<100)&&g.state.data===before.data&&g.surface.walked-before.walked<1;},before));
  for(const [stop,side,panel] of [['research',1,'log'],['civic',-1,'operations'],['industry',1,null]]){
   await map(page);await page.locator(`[data-city-stop="${stop}"]`).click();await page.locator('[data-screen="map"]').waitFor({state:'hidden'});
   await page.evaluate(side=>{const g=window.__lyrion;g.surface.face(0);g.surface.sync(g.state,g.landing.referenceFrame);g.input.virtual.turn=side;for(let i=0;i<40;i++)g.tick(.05);g.input.reset();if(side>0&&g.snapshot().operations.text.includes('物流'))g.state.hull=60;},side);
   await page.keyboard.press('KeyE');
   check(`${backend} ${stop}の端末を徒歩とEで利用`,panel?await page.locator(`[data-screen="${panel}"]`).isVisible():await page.evaluate(()=>window.__lyrion.state.hull===100));
   if(panel)await page.evaluate(()=>{const g=window.__lyrion;g.resume();g.stop();});
  }
  await map(page);await page.locator('[data-city-stop="civic"]').click();await page.locator('[data-screen="map"]').waitFor({state:'hidden'});await tick(page,3);
  await performanceSample(page,backend);await page.screenshot({path:`${shots}-${backend}-street.png`});
  const activity=await page.evaluate(()=>{const g=window.__lyrion;let instances=0;g.primeBase.group.traverse(o=>{if(o.isInstancedMesh)instances+=o.count;});return{instances,text:g.snapshot().operations.text};});check(`${backend} 街に交通・歩行者があり現在地の区画を表示`,activity.instances>=200&&activity.text.includes('行政'),activity);
  await page.evaluate(()=>window.__lyrion.saveNow());await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});await page.evaluate(()=>{const g=window.__lyrion;g.continueGame();g.stop();});check(`${backend} 市内からの保存再開は安全に駐機船へ戻る`,await page.evaluate(()=>!window.__lyrion.surface.active&&window.__lyrion.landing.mode==='landed'&&window.__lyrion.state.landed.bodyId==='lyrion-prime'));await page.close();
 }
 const raw=readFileSync('tests/fixtures/public-v5-port.json','utf8').trim(),old=JSON.parse(raw),migration=await open('webgl2',false,raw);
 const migrated=await migration.evaluate(()=>{const g=window.__lyrion;g.saveNow();return{version:JSON.parse(localStorage.getItem('lyrion.save.v1')).version,backup:localStorage.getItem('lyrion.save.before-compact-v6'),data:g.state.data,total:g.state.totalData,mission:g.state.missionIndex,scanned:[...g.state.scanned],landed:g.landing.mode,position:g.state.pos.toArray()};});
 check('現行公開版v5の実セーブを移行しDATA・調査・ミッション・着陸を維持',migrated.version===6&&migrated.backup===raw&&migrated.data===old.data&&migrated.total===old.totalData&&migrated.mission===old.missionIndex&&JSON.stringify(Object.fromEntries(migrated.scanned))===JSON.stringify(old.scanned)&&migrated.landed==='landed'&&Math.hypot(...migrated.position)<1000000,migrated);await migration.close();
 const touch=await open('webgl2',true);await landed(touch);await map(touch,true);const stop=touch.locator('[data-city-stop="habitat"]');await stop.scrollIntoViewIfNeeded();await touch.screenshot({path:`${shots}-mobile-transit.png`});await stop.tap();await tick(touch,20);check('タッチMAPから住宅街へ移動可能',await touch.evaluate(()=>window.__lyrion.snapshot().operations.text.includes('住宅')&&window.__lyrion.surface.grounded));await touch.close();
 check('ページ・描画エラーなし',errors.length===0,errors);
}catch(e){check('検証を完遂',false,String(e));console.error(e);}finally{await browser.close();server.close();writeFileSync(reportPath,JSON.stringify(report,null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
