import { chromium, launchOptions, serve, sleep, graphicsInfo } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const server = await serve(4184);
const browser = await chromium.launch(launchOptions());
const errors = [];
const samples = [];
const durationSec = Number(process.env.SOAK_SECONDS || 120);
const combatMode=process.env.SOAK_COMBAT==='1';
const report = { timestamp:new Date().toISOString(), durationSec, combatMode, browser:browser.version(), samples, errors };
try {
  const page = await browser.newPage({ viewport:{width:1920,height:1080} });
  page.on('pageerror',(error)=>errors.push(String(error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',audioEnabled:false})));
  await page.goto(server.url);
  await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
  report.graphics=await graphicsInfo(page);
  if(report.graphics.hardware!==true)throw new Error('Hardware GPU required');
  await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;g.startNew();});
  if(combatMode)await page.evaluate(()=>window.__lyrion.applySettings({...window.__lyrion.settings,difficulty:'hard'}));
  const ids=['thalassa','aurelion','vesper','lumen','wayfarer','cindra'];
  // 初回表示で作られるGPUリソースを先にウォームアップする。
  for(const id of ids){await page.evaluate((id)=>window.__lyrion.debugTeleport(id,600),id);await sleep(300);}
  const started=Date.now();
  let index=0;
  while(Date.now()-started<durationSec*1000){
    await page.evaluate((id)=>{const g=window.__lyrion;g.debugTeleport(id,600);g.setTarget(id);},ids[index%ids.length]);
    if(combatMode){await page.evaluate(()=>{const g=window.__lyrion;g.combat.spawn(g.state,'hard',g.worlds);});await page.keyboard.down('KeyJ');}
    await page.keyboard.down(index%2?'KeyW':'KeyF');
    await page.keyboard.down('ArrowLeft');
    await sleep(1200);
    await page.keyboard.up('ArrowLeft');
    await sleep(1800);
    await page.keyboard.up(index%2?'KeyW':'KeyF');
    await page.keyboard.down('KeyX');await sleep(1000);await page.keyboard.up('KeyX');
    await sleep(2000);
    if(combatMode)await page.keyboard.up('KeyJ');
    const data=await page.evaluate(()=>{const g=window.__lyrion;return {phase:g.phase,fps:g.snapshot().fps,hull:g.state.hull,shield:g.state.shield,enemies:g.combat.count,bolts:g.combat.bolts.filter(b=>b.active).length,energy:g.state.energy,memory:{...g.rendererInfo.memory},finite:g.state.pos.toArray().every(Number.isFinite),fatal:!document.getElementById('fatal').hidden};});
    samples.push({elapsedSec:(Date.now()-started)/1000,scene:ids[index%ids.length],...data});
    if(data.fatal||!data.finite||data.phase!=='playing')throw new Error('Flight became unstable');
    console.log(`soak ${samples.at(-1).elapsedSec.toFixed(0)}s / ${ids[index%ids.length]} / ${data.fps.toFixed(1)}fps / ${JSON.stringify(data.memory)}`);
    index++;
  }
  const first=samples.slice(0,6),last=samples.slice(-6);
  const peak=(items,key)=>Math.max(...items.map((s)=>s.memory[key]));
  report.resourcePlateau=peak(last,'textures')<=peak(first,'textures') && peak(last,'geometries')<=peak(first,'geometries')+2;
  report.pass=errors.length===0&&report.resourcePlateau;
}catch(error){report.pass=false;report.failure=String(error);console.error(error);}
finally{
  const dir=fileURLToPath(new URL('../../docs/validation/',import.meta.url));mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'gpu-soak.json'),JSON.stringify(report,null,2));
  await browser.close();server.close();
}
if(!report.pass)process.exitCode=1;
