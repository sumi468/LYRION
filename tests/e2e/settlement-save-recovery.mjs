import {chromium,serve,launchOptions} from './harness.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const server=await serve(4220),browser=await chromium.launch(launchOptions()),results=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1000,height:700}});page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'low',difficulty:'off',audioEnabled:false})));
 await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 const result=await page.evaluate(()=>{
  const g=window.__lyrion;g.input.requestLock=()=>{};g.startNew();g.stop();g.debugSurface(200,-50,-332);
  // A v5 fixture from before the town existed: parked in an old open field.
  const body=g.views.get('lyrion-prime').def,s=g.state,q=s.quat.clone().setFromAxisAngle(s.pos.clone().set(0,0,1),body.axialTilt).multiply(s.quat.clone().setFromAxisAngle(s.pos.clone().set(0,1,0),s.time/body.rotationPeriod*Math.PI*2));
  const normal=s.pos.clone().sub(g.positions[body.id]).normalize().applyQuaternion(q.invert());
  s.landed={bodyId:body.id,normal:normal.toArray()};s.landings.add(body.id);s.data=237;s.hull=88;s.surfaceProgress.active=true;s.surfaceProgress.step=3;
  const progress=JSON.stringify(s.surfaceProgress);g.saveNow();g.continueGame();g.stop();g.tick(.05);
  const local=g.baseFrame.toLocal(g.state.pos,g.state.pos.clone());
  return{mode:g.landing.mode,local:local.toArray(),data:g.state.data,hull:g.state.hull,progressPreserved:JSON.stringify(g.state.surfaceProgress)===progress,landingHistory:g.state.landings.has(body.id),message:document.querySelector('.toasts')?.textContent};
 });
  const ok=result.mode==='flight'&&result.local[1]>60&&result.data===237&&result.hull>=88&&result.hull<89&&result.progressPreserved&&result.landingHistory;
 results.push({name:'旧v5の着陸位置が新しい建物と重なる場合、安全な上空へ復帰し進捗を維持',ok,data:result});console.log(ok?'PASS':'FAIL',JSON.stringify(result));
}catch(e){results.push({name:'検証を完遂',ok:false,error:String(e)});console.error(e);}finally{await browser.close();server.close();writeFileSync('docs/validation/settlement-save-recovery.json',JSON.stringify({build:JSON.parse(readFileSync('dist/build-info.json','utf8')),results,errors},null,2));}
if(results.some(r=>!r.ok)||errors.length)process.exitCode=1;
