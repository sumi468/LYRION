import { chromium,launchOptions,serve,graphicsInfo,sleep,SHOTS } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const server=process.env.BASE_URL?null:await serve(4187);
const url=process.env.BASE_URL?process.env.BASE_URL+'/?debug':server.url;
const browser=await chromium.launch(launchOptions()),results=[],errors=[];
const report={timestamp:new Date().toISOString(),url,results,errors};
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(`${ok?'PASS':'FAIL'} ${name} ${data?JSON.stringify(data):''}`);if(!ok)throw new Error(name);};
const shot=(page,name)=>process.env.BASE_URL?Promise.resolve():page.screenshot({path:join(SHOTS,name)});
const step=(page,n)=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__lyrion.tick(.05);},n);
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',difficulty:'normal'})));
 await page.goto(url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 report.graphics=await graphicsInfo(page);
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;});
 await page.getByRole('button',{name:'新しい探査を開始',exact:true}).click();await sleep(650);await page.evaluate(()=>window.__lyrion.stop());
 // Combat is exercised outside the new protected station volume.
 await page.evaluate(()=>window.__lyrion.debugTeleport('cindra',1600));
 await step(page,245);
 const formation=await page.evaluate(()=>{const g=window.__lyrion;return {count:g.combat.count,roles:[...new Set(g.combat.enemies.filter(e=>e.active).map(e=>e.role))],rear:g.combat.pursuers,shields:g.combat.enemies.filter(e=>e.active).map(e=>e.shield)};});
 check('Normalは3種類3機で出現し、後方からも追跡する',formation.count===3&&formation.roles.length===3&&formation.rear>0&&formation.shields.every(s=>s===50),formation);
 await page.evaluate(()=>{const g=window.__lyrion;g.state.quat.setFromUnitVectors(g.state.vel.clone().set(0,0,-1),g.combat.enemies[0].pos.clone().sub(g.state.pos).normalize());});
 await page.keyboard.down('KeyJ');
 const action=await page.evaluate(()=>{
  const g=window.__lyrion,startKills=g.state.kills;let evades=0,warned=false,breakaway=false,hostile=0;
  for(let i=0;i<120;i++){g.tick(.05);evades=Math.max(evades,...g.combat.enemies.map(e=>e.evades));warned ||= g.combat.incoming>0;breakaway ||= g.combat.enemies.some(e=>e.mode==='break');hostile=Math.max(hostile,g.combat.bolts.filter(b=>b.active&&b.hostile).length);}
  return {evades,warned,breakaway,hostile,kills:g.state.kills-startKills,remaining:g.combat.count,hull:g.state.hull,shield:g.state.shield};
 });
 await page.keyboard.up('KeyJ');
 check('6秒の棒立ち連射で一掃できず、敵が回避と再接近を行う',action.kills<3&&action.remaining>0&&action.evades>0&&action.breakaway,action);
 check('敵の射撃予告から複数の実弾が飛来する',action.warned&&action.hostile>=3,action);
 await shot(page,'55-dogfight-pressure.png');
 const energy=await page.evaluate(()=>window.__lyrion.state.energy);await page.keyboard.press('KeyV');await step(page,4);
 const dodge=await page.evaluate(()=>{const g=window.__lyrion;return {time:g.combat.dodgeTime,cooldown:g.combat.dodgeCooldown,energy:g.state.energy,roll:g.combat.rollAngle};});
 check('Vでエネルギーを消費し、描画姿勢も回避ロールする',dodge.time>0&&dodge.cooldown>5&&dodge.energy<energy-15&&dodge.roll>.5,dodge);
 await shot(page,'56-evasive-roll.png');
 await page.keyboard.press('KeyV');
 check('冷却中のV連打で二重にコストを取らない',await page.evaluate(value=>window.__lyrion.state.energy===value,dodge.energy));
 await page.evaluate(()=>window.__lyrion.pause());await step(page,20);
 check('一時停止中は回避の時間と冷却も停止',await page.evaluate(time=>window.__lyrion.combat.dodgeTime===time,dodge.time));
 await page.evaluate(()=>{const g=window.__lyrion;g.resume();g.stop();g.state.pos.set(40000,10000,40000);g.state.vel.set(0,0,0);g.state.quat.identity();g.state.hull=100;g.state.shield=60;g.state.energy=100;g.combat.reset(0);g.tick(.05);});
 await page.keyboard.down('KeyF');await step(page,40);await page.keyboard.up('KeyF');await page.keyboard.down('KeyW');await step(page,140);await page.keyboard.up('KeyW');
 const chase=await page.evaluate(()=>{const g=window.__lyrion;return {speed:g.state.vel.length(),count:g.combat.count,rear:g.combat.pursuers,minDistance:Math.min(...g.combat.enemies.filter(e=>e.active).map(e=>e.pos.distanceTo(g.state.pos)))};});
 check('ブースト逃走後も追撃機が消えず、高速の自機へ追いつく',chase.speed>200&&chase.count>0&&chase.minDistance<1800,chase);
 await page.evaluate(()=>{const g=window.__lyrion;g.combat.reinforcementsIn=.5;});const oldCount=await page.evaluate(()=>window.__lyrion.combat.count);await step(page,11);
 check('交戦が続くと後方から増援が加わる',await page.evaluate(count=>window.__lyrion.combat.count>count,oldCount));
 await page.evaluate(()=>{const g=window.__lyrion;g.state.hull=100;g.state.shield=60;g.start();});
 report.frames=await page.evaluate(()=>new Promise(resolve=>{let start=performance.now(),last=start,minimumEnemies=6;const intervals=[];const frame=now=>{intervals.push(now-last);last=now;minimumEnemies=Math.min(minimumEnemies,window.__lyrion.combat.count);if(now-start<2000)requestAnimationFrame(frame);else{intervals.sort((a,b)=>a-b);resolve({fps:intervals.length*1000/(now-start),p95Ms:intervals[Math.floor(intervals.length*.95)],minimumEnemies});}};requestAnimationFrame(frame);}));
 await page.evaluate(()=>window.__lyrion.stop());
 check('追撃戦を実GPU・1080pの通常ループで描画',report.graphics.hardware&&report.frames.fps>25&&report.frames.minimumEnemies>=3,report.frames);
 await page.evaluate(()=>{const g=window.__lyrion;g.applySettings({...g.settings,difficulty:'easy'});g.combat.spawn(g.state,'easy',g.worlds);g.state.vel.set(0,0,0);g.state.hull=100;g.state.shield=60;g.state.energy=100;});
 const kill=await page.evaluate(()=>{
  const g=window.__lyrion,initial=g.state.kills;g.input.keys.add('KeyJ');
  for(let i=0;i<150&&g.state.kills===initial;i++){
    const enemy=g.combat.enemies.find(e=>e.active);if(enemy){const relative=enemy.vel.clone().sub(g.state.vel);const lead=enemy.pos.clone().addScaledVector(relative,enemy.pos.distanceTo(g.state.pos)/1150).sub(g.state.pos).normalize();g.state.quat.setFromUnitVectors(g.state.vel.clone().set(0,0,-1),lead);}
    g.tick(.05);
  }
  g.input.keys.delete('KeyJ');return {killed:g.state.kills>initial,explosion:g.combat.impacts.some(e=>e.life>0&&e.radius===24),data:g.state.data};
 });
 check('狙って撃てば撃破でき、爆発と報酬が出る',kill.killed&&kill.explosion&&kill.data>=20,kill);
 await step(page,3);
 await shot(page,'57-destruction.png');
 await page.evaluate(()=>{const g=window.__lyrion;g.applySettings({...g.settings,difficulty:'off'});g.tick(.05);});
 check('敵なしでは追跡と敵弾を解除する',await page.evaluate(()=>{const c=window.__lyrion.combat;return c.count===0&&c.pursuers===0&&!c.bolts.some(b=>b.active&&b.hostile);}));
 const memory=await page.evaluate(()=>{const g=window.__lyrion;g.applySettings({...g.settings,difficulty:'hard'});g.combat.spawn(g.state,'hard',g.worlds);g.tick(.05);const before={...g.rendererInfo.memory};for(let i=0;i<20;i++){g.combat.reset();g.combat.spawn(g.state,'hard',g.worlds);g.tick(.05);}return {before,after:{...g.rendererInfo.memory}};});
 check('敵編隊を20回再生成してもGPUリソースが増えない',memory.before.geometries===memory.after.geometries&&memory.before.textures===memory.after.textures,memory);
 check('コンソール・ページエラーなし',errors.length===0,errors);
}catch(error){report.failure=String(error);console.error(error);}
finally{await browser.close();server?.close();writeFileSync(new URL(`../../docs/validation/${process.env.BASE_URL?'production-dogfight':'dogfight'}.json`,import.meta.url),JSON.stringify(report,null,2));}
if(report.failure)process.exitCode=1;
