import { chromium, launchOptions, serve, graphicsInfo, sleep, SHOTS } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const server=await serve(4185),browser=await chromium.launch(launchOptions());
const results=[],errors=[];
const report={timestamp:new Date().toISOString(),results,errors};
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(`${ok?'PASS':'FAIL'} ${name} ${data?JSON.stringify(data):''}`);if(!ok)throw new Error(name);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',(error)=>errors.push(String(error)));
 page.on('console',(message)=>{if(message.type()==='error')errors.push(message.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',effectsVolume:0})));
 await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 report.graphics=await graphicsInfo(page);
 const fonts=await page.evaluate(async()=>{
  await document.fonts.load('500 16px Oxanium','LYRION 0123456789');
  await document.fonts.load('500 16px "M PLUS 1"','宇宙船探索');
  return {latin:document.fonts.check('500 16px Oxanium'),japanese:document.fonts.check('500 16px "M PLUS 1"'),family:getComputedStyle(document.body).fontFamily};
 });
 check('同梱した未来的フォントを日本語・英数字にロード',fonts.latin&&fonts.japanese&&fonts.family.includes('Oxanium'),fonts);
 await page.screenshot({path:join(SHOTS,'40-new-menu.png')});
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;});
 await page.getByRole('button',{name:'新しい探査を開始',exact:true}).click();
  await sleep(400);
 await page.evaluate(()=>window.__lyrion.stop());
 // Isolate lateral thrust from the new start's inherited orbital velocity.
 await page.evaluate(()=>{const g=window.__lyrion;g.state.pos.set(40000,10000,40000);g.state.vel.set(0,0,0);g.refVel.set(0,0,0);g.state.assist=false;});
 const initial=await page.evaluate(()=>window.__lyrion.state.pos.toArray());
 await page.keyboard.down('KeyA');
 await page.evaluate(()=>{for(let i=0;i<60;i++)window.__lyrion.tick(1/60);});
 const turn=await page.evaluate((initial)=>{
  const g=window.__lyrion;const relative=g.chase.camera.quaternion.clone().invert().multiply(g.shipModel.group.quaternion);
  return {bank:g.attitude.bank,relativeBank:2*Math.atan2(relative.z,relative.w),displacement:g.state.pos.distanceTo({x:initial[0],y:initial[1],z:initial[2]}),yawRate:g.attitude.yawRate};
 },initial);
 check('Aは停止位置で旋回し、横方向へ推進しない',turn.displacement<.001&&turn.yawRate>.8,turn);
 check('船体がバンクし、追尾カメラからも傾きが見える',turn.bank>.5&&Math.abs(turn.relativeBank)>.3,turn);
 await page.screenshot({path:join(SHOTS,'41-bank-turn.png')});
 await page.keyboard.up('KeyA');
 await page.evaluate(()=>{for(let i=0;i<150;i++)window.__lyrion.tick(1/60);});
 check('旋回をやめると自動バンクが水平へ戻る',await page.evaluate(()=>Math.abs(window.__lyrion.attitude.bank)<.005));
 await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');
 const forward=await page.evaluate(()=>{const g=window.__lyrion;const before=g.state.pos.clone();for(let i=0;i<75;i++)g.tick(1/60);return {distance:g.state.pos.distanceTo(before),bank:g.attitude.bank};});
 await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');
 check('推進しながら右旋回し、右バンクする',forward.distance>40&&forward.bank<-.5,forward);
 await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('thalassa',650);g.setTarget('thalassa');g.tick(0);g.start();});
 await sleep(2400);
 const audio=await page.evaluate(()=>window.__lyrion.audio.diagnostics());
 check('効果音0でもメロディー付きBGMの波形が出る',audio.musicNotesScheduled>=8&&audio.musicRms>.0005&&audio.rms>.0001,audio);
 await page.evaluate(()=>{const g=window.__lyrion;g.stop();for(let i=0;i<20;i++)g.tick(1/60);});
 await page.screenshot({path:join(SHOTS,'42-explorer-lx07.png')});
 const detail=await page.evaluate(()=>{const g=window.__lyrion;let meshes=0;g.shipModel.hull.traverse((o)=>{if(o.isMesh)meshes++;});return {meshes,textures:g.rendererInfo.memory.textures,drawCalls:g.rendererInfo.render.calls};});
 check('新しい船体をバッチ結合し描画負荷を抑える',detail.meshes<=20,detail);
 check('コンソール・ページエラーなし',errors.length===0,errors);
}catch(error){report.failure=String(error);console.error(error);}
finally{writeFileSync(fileURLToPath(new URL('../../docs/validation/flight-upgrade.json',import.meta.url)),JSON.stringify(report,null,2));await browser.close();server.close();}
if(report.failure)process.exitCode=1;
