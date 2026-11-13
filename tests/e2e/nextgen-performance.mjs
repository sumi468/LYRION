import {chromium,serve,launchOptions,sleep} from './harness.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const server=await serve(4214),browser=await chromium.launch(launchOptions()),errors=[],samples=[];
const report={time:new Date().toISOString(),build:JSON.parse(readFileSync('dist/build-info.json','utf8')),browser:browser.version(),headless:launchOptions().headless,viewport:[1280,720],quality:'medium',samples,resourceEviction:[],errors};
try{
 for(const backend of ['webgl2','webgpu']){
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(renderer=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer,difficulty:'off',audioEnabled:false})),backend);
  await page.goto(server.url.replace('renderer=webgl2',`renderer=${backend}`));await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
  const status=await page.evaluate(()=>window.__lyrion.rendererStatus);if(status.backend!==backend||status.hardware!==true)throw Error('Actual hardware backend missing: '+JSON.stringify(status));
  for(const scene of ['space','orbit','entry','surface','coast','station','eva','combat']){
   await page.evaluate(scene=>{
    const g=window.__lyrion;g.startNew();g.stop();g.input.locked=true;g.input.requestLock=()=>{};
    if(scene==='space'||scene==='combat'){g.state.pos.set(4e8,1e8,4e8);g.state.vel.set(0,0,0);g.refVel.set(0,0,0);g.state.quat.identity();}
    if(scene==='orbit')g.debugSurface(4000000);
    if(scene==='entry')g.debugSurface(10000);
    if(scene==='surface'||scene==='coast'){
      g.debugSurface(400,scene==='coast'?1500:0,0);g.handlePlayAction('land');for(let i=0;i<230;i++)g.tick(.05);
      if(scene==='coast'){g.handlePlayAction('eva');for(let i=0;i<30;i++)g.tick(.05);g.input.keys.add('KeyW');for(let i=0;i<100;i++)g.tick(.05);g.input.reset();g.state.cameraMode='first';g.input.keys.add('ArrowRight');for(let i=0;i<32;i++)g.tick(.05);g.input.reset();}
    }
    if(scene==='eva'){g.handlePlayAction('dock');for(let i=0;i<180;i++)g.tick(.05);g.handlePlayAction('eva');for(let i=0;i<20;i++)g.tick(.05);}
    if(scene==='combat'){g.applySettings({...g.settings,difficulty:'normal'});g.combat.reset(0);}
    else g.applySettings({...g.settings,difficulty:'off'});
    for(let i=0;i<3;i++)g.tick(.05);g.start();
   },scene);
   await sleep(800);
   const sample=await page.evaluate(async()=>{
    const g=window.__lyrion,intervals=[];let previous=performance.now(),started=previous;
    await new Promise(resolve=>{const sample=now=>{intervals.push(now-previous);previous=now;if(now-started>=1800)resolve();else requestAnimationFrame(sample);};requestAnimationFrame(sample);});
    const duration=intervals.reduce((a,b)=>a+b,0);intervals.sort((a,b)=>a-b);
    return{fps:intervals.length*1000/duration,frames:intervals.length,durationMs:duration,medianMs:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)],gpuMs:await g.renderer.gpuTime(),info:JSON.parse(JSON.stringify(g.rendererInfo)),profile:g.currentProfile.label,backend:g.rendererStatus};
   });
   samples.push({scene,...sample});console.log(backend,scene,JSON.stringify({fps:sample.fps,p95:sample.p95Ms,gpuMs:sample.gpuMs,calls:sample.info.render.calls,triangles:sample.info.render.triangles,memory:sample.info.memory}));
   await page.screenshot({path:`docs/screenshots/nextgen-final-${backend}-${scene}.png`});
  }
  const resident=await page.evaluate(()=>[...window.__lyrion.terrains.values()].reduce((sum,terrain)=>sum+terrain.chunks.size,0));
  report.resourceEviction.push({backend,residentTerrainChunks:resident});if(resident!==0)throw Error('Unused terrain chunks retained after orbital return');
  await page.close();
 }
 if(errors.length)throw Error('Browser rendering errors');
}catch(e){report.failure=String(e);console.error(e);}finally{await browser.close();server.close();writeFileSync('docs/validation/nextgen-performance.json',JSON.stringify(report,null,2));}
if(report.failure)process.exitCode=1;
