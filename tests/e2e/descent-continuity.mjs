import {chromium,serve,launchOptions} from './harness.mjs';
import {writeFileSync} from 'node:fs';
const server=await serve(4216),browser=await chromium.launch(launchOptions()),results=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer:'webgpu',difficulty:'off',audioEnabled:false})));
 await page.goto(server.url.replace('renderer=webgl2','renderer=webgpu'));await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 await page.evaluate(()=>{const g=window.__lyrion;g.startNew();g.stop();g.input.locked=true;g.startFirstSteps();});
 await page.screenshot({path:'docs/screenshots/nextgen-descent-orbit.png'});
 let approached=false,entered=false,cloud=false,landed=false,stats;
 for(let batch=0;batch<60&&!landed;batch++){
  stats=await page.evaluate(()=>{
   const g=window.__lyrion;let crossed=false,previous=g.surfaceDistance(g.views.get('lyrion-prime').def);
   for(let i=0;i<100;i++){
    const altitude=g.surfaceDistance(g.views.get('lyrion-prime').def);
    if(g.landing.mode==='flight'){
      // Steering changes attitude only. Every position change uses flight physics.
      const direction=g.baseFrame.position.clone().sub(g.state.pos).normalize();g.state.quat.setFromUnitVectors(direction.clone().set(0,0,-1),direction);
      // X now correctly overrides the accelerator. Release it below the safe
      // approach speed, then pulse normal thrust rather than relying on F+X.
      const relativeSpeed=g.state.vel.clone().sub(g.refVel).length(),braking=altitude<1000&&relativeSpeed>70;
      g.input.virtual.thrust=altitude>420&&!braking?1:0;g.input.virtual.boost=altitude>1200&&g.state.energy>12&&!braking;g.input.virtual.brake=braking||altitude<=420;
      if(altitude<420&&relativeSpeed<90)g.handlePlayAction('land');
    }else{g.input.virtual.thrust=0;g.input.virtual.boost=false;g.input.virtual.brake=false;}
    g.tick(.05);const next=g.surfaceDistance(g.views.get('lyrion-prime').def);if(previous>12000&&next<=12000)crossed=true;previous=next;
    if(g.landing.mode==='landed')break;
   }
   return {altitude:previous,mode:g.landing.mode,time:g.state.time,hull:g.state.hull,cloud:crossed,step:g.state.surfaceProgress.step,position:g.state.pos.toArray(),backend:g.rendererStatus};
  });
  cloud||=stats.cloud;landed=stats.mode==='landed';
  if(!approached&&stats.altitude<250000){approached=true;await page.screenshot({path:'docs/screenshots/nextgen-descent-approach.png'});}
  if(!entered&&stats.altitude<20000){entered=true;await page.screenshot({path:'docs/screenshots/nextgen-descent-atmosphere.png'});}
  if(batch%10===0)console.log('DESCENT',batch,JSON.stringify(stats));
 }
 const ok=landed&&cloud&&stats.hull===100&&errors.length===0;
 results.push({name:'新規ゲームの軌道位置から実推進だけで雲を通過しPRIMEへ着陸',ok,stats,cloud,driver:'QA attitude steering only; boost above 1200m, alternate thrust/brake below 1000m to respect brake priority'});
 console.log(ok?'PASS':'FAIL',JSON.stringify(results[0]));await page.screenshot({path:'docs/screenshots/nextgen-descent-landed.png'});
}catch(e){results.push({name:'完遂',ok:false,error:String(e)});console.error(e);}finally{await browser.close();server.close();writeFileSync('docs/validation/descent-continuity.json',JSON.stringify({results,errors},null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
