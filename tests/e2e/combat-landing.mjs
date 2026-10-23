import { chromium,launchOptions,serve,graphicsInfo,sleep,SHOTS } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const server=process.env.BASE_URL?null:await serve(4186);
const url=process.env.BASE_URL?process.env.BASE_URL+'/?debug':server.url;
const browser=await chromium.launch(launchOptions()),results=[],errors=[];
const report={timestamp:new Date().toISOString(),url,results,errors};
const screenshot=(page,name)=>process.env.BASE_URL?Promise.resolve():page.screenshot({path:join(SHOTS,name)});
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(`${ok?'PASS':'FAIL'} ${name} ${data?JSON.stringify(data):''}`);if(!ok)throw new Error(name);};
const step=(page,n)=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__lyrion.tick(.05);},n);
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',difficulty:'off'})));
 await page.goto(url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 report.graphics=await graphicsInfo(page);
 await page.getByRole('button',{name:'Hard',exact:true}).click();
 check('開始前に敵レベルを選び、設定を保存',await page.evaluate(()=>window.__lyrion.settings.difficulty==='hard'&&JSON.parse(localStorage.getItem('lyrion.settings.v1')).difficulty==='hard'));
 await screenshot(page,'50-combat-menu.png');
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;});
 await page.getByRole('button',{name:'新しい探査を開始',exact:true}).click();await sleep(150);await page.evaluate(()=>window.__lyrion.stop());
 await step(page,245);
 check('Hardで役割の異なるシールド付き敵5機が自然に出現',await page.evaluate(()=>{const enemies=window.__lyrion.combat.enemies.filter(e=>e.active);return enemies.length===5&&enemies.every(e=>e.hp>=189&&e.shield===75)&&new Set(enemies.map(e=>e.role)).size===3;}));
 const frozen=await page.evaluate(()=>{const g=window.__lyrion;g.pause();return g.combat.enemies[0].pos.toArray();});await step(page,20);
 check('一時停止中に敵と戦闘が進まない',await page.evaluate(p=>window.__lyrion.combat.enemies[0].pos.toArray().every((v,i)=>v===p[i]),frozen));
 await page.evaluate(()=>{const g=window.__lyrion;g.resume();g.stop();});
 await step(page,150);
 check('敵弾が命中し、自機の防御値が減る',await page.evaluate(()=>{const s=window.__lyrion.state;return s.shield<60||s.hull<100;}),await page.evaluate(()=>({hull:window.__lyrion.state.hull,shield:window.__lyrion.state.shield})));
 await screenshot(page,'51-combat-flight.png');
 // The normal frame loop, with all hard-mode enemies present, is measured separately from deterministic ticks.
 await page.evaluate(()=>window.__lyrion.start());
 report.combatFrames=await page.evaluate(()=>new Promise(resolve=>{const intervals=[];let previous=performance.now(),start=previous;const frame=now=>{intervals.push(now-previous);previous=now;if(now-start<2000)requestAnimationFrame(frame);else{intervals.sort((a,b)=>a-b);resolve({fps:intervals.length*1000/(now-start),p95Ms:intervals[Math.floor(intervals.length*.95)]});}};requestAnimationFrame(frame);}));
 await page.evaluate(()=>window.__lyrion.stop());
 check('実GPUの1080pで戦闘を描画し通常ループが進む',report.graphics.hardware&&report.combatFrames.fps>25,report.combatFrames);
 await page.evaluate(()=>{const g=window.__lyrion;g.applySettings({...g.settings,difficulty:'easy'});g.state.vel.set(0,0,0);});await step(page,245);
 await page.evaluate(()=>{const g=window.__lyrion;g.state.hull=100;g.state.shield=60;g.state.quat.setFromUnitVectors(g.state.vel.clone().set(0,0,-1),g.combat.enemies[0].pos.clone().sub(g.state.pos).normalize());});
 const before=await page.evaluate(()=>({kills:window.__lyrion.state.kills,data:window.__lyrion.state.data}));
 await page.keyboard.down('KeyJ');await step(page,65);await page.keyboard.up('KeyJ');
 const after=await page.evaluate(()=>({kills:window.__lyrion.state.kills,data:window.__lyrion.state.data}));
 check('Jの連装砲で敵を撃破しデータ報酬を獲得',after.kills>before.kills&&after.data>before.data,{before,after});
 await page.evaluate(()=>{const g=window.__lyrion;g.applySettings({...g.settings,difficulty:'off'});g.tick(.05);});
 check('敵なしへ変更すると敵と飛行中の弾が消える',await page.evaluate(()=>window.__lyrion.combat.count===0&&!window.__lyrion.combat.bolts.some(b=>b.active)));
 await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('cindra',80);g.damageHull(40,50);g.tick(0);});
 await page.keyboard.press('KeyG');
 check('Gの着陸支援で降下に入る',await page.evaluate(()=>window.__lyrion.landing.mode==='approach'));
 await step(page,300);
 check('実際に接地し着陸装置を展開、修理・補給する',await page.evaluate(()=>{const g=window.__lyrion;return g.landing.mode==='landed'&&g.state.landings.has('cindra')&&g.state.hull===100&&g.state.shield===60&&g.shipModel.gearAmount>.99;}));
 await screenshot(page,'52-surface-landing.png');
 const attached=await page.evaluate(()=>{const g=window.__lyrion;g.saveNow();return g.state.pos.distanceTo(g.positions.cindra);});await step(page,300);
 check('公転・自転が進んでも接地高度を維持',await page.evaluate(radius=>Math.abs(window.__lyrion.state.pos.distanceTo(window.__lyrion.positions.cindra)-radius)<1e-5,attached));
 await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.continueGame();g.stop();g.tick(0);});
 check('着陸状態と撃破数を保存・復元',await page.evaluate(kills=>window.__lyrion.landing.mode==='landed'&&window.__lyrion.state.kills===kills,after.kills));
 await page.keyboard.press('KeyG');await step(page,4);
 check('Gで離陸し、地面を離れて手動操縦へ戻る',await page.evaluate(()=>{const g=window.__lyrion;return g.landing.mode==='flight'&&g.state.landed===null&&g.state.pos.distanceTo(g.positions.cindra)>160;}));
 await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('lumen',60);g.toggleLanding();g.tick(.1);g.toggleLanding();g.tick(.1);});
 check('降下を中止しても機体は地表の外に留まる',await page.evaluate(()=>{const g=window.__lyrion;return g.landing.mode==='flight'&&g.state.pos.distanceTo(g.positions.lumen)>60;}));
 const memory=await page.evaluate(()=>{
   const g=window.__lyrion;g.applySettings({...g.settings,difficulty:'hard'});g.combat.spawn(g.state,'hard',g.worlds);g.tick(.05);
   const before={...g.rendererInfo.memory};
   for(let i=0;i<20;i++){g.combat.reset();g.combat.spawn(g.state,'hard',g.worlds);g.tick(.05);}
   return {before,after:{...g.rendererInfo.memory}};
 });
 check('敵20回再生成でもGPUリソース数が増えない',memory.after.geometries===memory.before.geometries&&memory.after.textures===memory.before.textures,memory);
 check('コンソール・ページエラーなし',errors.length===0,errors);
}catch(error){report.failure=String(error);console.error(error);}
finally{await browser.close();server?.close();writeFileSync(new URL(`../../docs/validation/${process.env.BASE_URL?'production-combat-landing':'combat-landing'}.json`,import.meta.url),JSON.stringify(report,null,2));}
if(report.failure)process.exitCode=1;
