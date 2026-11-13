import {chromium,serve,launchOptions,sleep} from './harness.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const server=await serve(4219),browser=await chromium.launch(launchOptions()),results=[],errors=[],performanceSamples=[];
const report={time:new Date().toISOString(),build:JSON.parse(readFileSync('dist/build-info.json','utf8')),browser:browser.version(),headless:launchOptions().headless,viewport:[1280,720],quality:'medium',warmupMs:1500,sampleMs:3000,results,errors,performanceSamples};
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(ok?'PASS':'FAIL',name,JSON.stringify(data??''));};
async function open(backend,touch=false,landscape=false){
 const page=await browser.newPage({viewport:touch?(landscape?{width:844,height:390}:{width:390,height:844}):{width:1280,height:720},hasTouch:touch,isMobile:touch});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(renderer=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer,difficulty:'off',audioEnabled:false})),backend);
 await page.goto(server.url.replace('renderer=webgl2',`renderer=${backend}`));await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.startNew();g.stop();g.input.locked=true;g.startFirstSteps();});return page;
}
const tick=(page,n=3)=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__lyrion.tick(.05);},n);
async function sample(page,backend,scene){
 if(scene==='street')await page.evaluate(()=>{const g=window.__lyrion;g.input.virtual.thrust=1;g.input.virtual.pitch=-1;});
 await page.evaluate(()=>window.__lyrion.start());await sleep(1500);
 const data=await page.evaluate(async()=>{
  const g=window.__lyrion,intervals=[];let previous=performance.now(),started=previous;
  await new Promise(resolve=>{const frame=now=>{intervals.push(now-previous);previous=now;if(now-started>=3000)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  const duration=intervals.reduce((a,b)=>a+b,0);intervals.sort((a,b)=>a-b);const gpuMs=await g.renderer.gpuTime();g.stop();
  return{fps:intervals.length*1000/duration,p95Ms:intervals[Math.floor(intervals.length*.95)],p99Ms:intervals[Math.floor(intervals.length*.99)],maxMs:intervals[intervals.length-1],durationMs:duration,frames:intervals.length,gpuMs,info:JSON.parse(JSON.stringify(g.rendererInfo)),status:g.rendererStatus};
 });performanceSamples.push({backend,scene,moving:scene==='street',...data});console.log('PERF',backend,scene,JSON.stringify({fps:data.fps,p95:data.p95Ms,p99:data.p99Ms,max:data.maxMs,calls:data.info.render.calls,triangles:data.info.render.triangles}));
 check(`${backend} ${scene} 描画予算と有限FPS`,data.fps>45&&data.info.render.calls<450&&data.info.render.triangles<1500000,data.status);
}
async function walkTo(page,x,z){
 return page.evaluate(([x,z])=>{
  const g=window.__lyrion,dest=g.baseFrame.toWorld(g.surface.localPosition.clone().set(x,0,z),g.surface.pose.position.clone());g.surface.frame.toLocal(dest,dest);
  let ticks=0;for(;ticks<3200;ticks++){
   const p=g.surface.localPosition,dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz);if(d<1)break;
   g.input.virtual.turn=dx/d*Math.min(1,d/2);g.input.virtual.thrust=-dz/d*Math.min(1,d/2);g.input.virtual.pitch=-1;g.tick(.05);
  }g.input.reset();for(let i=0;i<10;i++)g.tick(.05);g.baseFrame.toLocal(g.surface.pose.position,dest);
  return{distance:Math.hypot(x-dest.x,z-dest.z),local:dest.toArray(),ticks,grounded:g.surface.grounded};
 },[x,z]);
}
try{
 for(const backend of (process.env.RENDERER?[process.env.RENDERER]:['webgl2','webgpu'])){
  const page=await open(backend),status=await page.evaluate(()=>window.__lyrion.rendererStatus);
  check(`${backend} 実GPUで起動`,status.backend===backend&&status.hardware===true,status);
  await page.evaluate(()=>window.__lyrion.debugSurface(400));await tick(page);
  const pad=await page.evaluate(()=>window.__lyrion.snapshot());
  check(`${backend} PAD 01に案内を一本化し高度・速度・着陸可否を表示`,pad.landingGuide?.ready&&pad.landingGuide.site.includes('PAD 01')&&pad.markers.filter(m=>m.label.includes('PAD 01')).length===1&&!pad.markers.some(m=>m.id==='cindra'),pad.landingGuide);
  await sample(page,backend,'approach');await page.screenshot({path:`docs/screenshots/settlement-${backend}-approach.png`});
  await page.evaluate(()=>window.__lyrion.debugSurface(650));await tick(page);await page.evaluate(()=>window.__lyrion.toggleLanding());
  check(`${backend} 高度条件の未達を表示して拒否`,await page.evaluate(()=>window.__lyrion.landing.mode==='flight'&&!window.__lyrion.snapshot().landingGuide.ready&&window.__lyrion.snapshot().landingGuide.reason.includes('450')));
  await page.evaluate(()=>window.__lyrion.debugSurface(200,-43,24));await tick(page);await page.evaluate(()=>window.__lyrion.toggleLanding());
  check(`${backend} 建物上はHUDとGの両方で着陸不可`,await page.evaluate(()=>window.__lyrion.snapshot().landingGuide.terrain==='obstacle'&&window.__lyrion.landing.mode==='flight'));
  await page.screenshot({path:`docs/screenshots/settlement-${backend}-blocked.png`});
  await page.evaluate(()=>window.__lyrion.debugSurface(200,0,-250));await tick(page);await page.evaluate(()=>window.__lyrion.toggleLanding());
  check(`${backend} 市街地の道路も着陸場所として案内しない`,await page.evaluate(()=>window.__lyrion.landing.mode==='flight'&&window.__lyrion.snapshot().landingGuide.reason.includes('市街地')));
  await page.evaluate(()=>window.__lyrion.debugSurface(120,2500,0));await tick(page);await page.evaluate(()=>window.__lyrion.toggleLanding());
  check(`${backend} 海面を明示して着陸を拒否`,await page.evaluate(()=>window.__lyrion.snapshot().landingGuide.terrain==='water'&&window.__lyrion.landing.mode==='flight'));
  await page.evaluate(()=>window.__lyrion.debugSurface(120,400,50));await tick(page);
  check(`${backend} 自由探索の平坦な野外着陸を維持`,await page.evaluate(()=>window.__lyrion.snapshot().landingGuide.ready&&!window.__lyrion.landing.assess(window.__lyrion.state,window.__lyrion.positions,window.__lyrion.velocities).onPad));
  await page.evaluate(()=>{const g=window.__lyrion;g.debugSurface(400);g.toggleLanding();});await tick(page,230);
  check(`${backend} PAD 01に実際に接地`,await page.evaluate(()=>window.__lyrion.landing.mode==='landed'&&window.__lyrion.state.hull===100));
  const seamNormals=await page.evaluate(()=>{
   const g=window.__lyrion,t=g.terrains.get('lyrion-prime');let count=0,minDot=1;
   for(const chunk of t.chunks.values())if(chunk.mesh.visible){const geo=chunk.mesh.geometry,p=geo.getAttribute('position'),n=geo.getAttribute('normal'),stride=t.grid+1;
    for(let y=0;y<stride;y++)for(let x=0;x<stride;x++)if(x===0||y===0||x===stride-1||y===stride-1){const i=x+y*stride,point=chunk.anchor.clone().set(p.getX(i)+chunk.anchor.x,p.getY(i)+chunk.anchor.y,p.getZ(i)+chunk.anchor.z),world=point.clone().applyQuaternion(t.rotation).add(g.positions['lyrion-prime']);g.baseFrame.toLocal(world,world);
     if(Math.hypot(world.x,world.z)<500){point.normalize();const dot=point.x*n.getX(i)+point.y*n.getY(i)+point.z*n.getZ(i);minDot=Math.min(minDot,dot);count++;}
    }
   }return{count,minDot};
  });check(`${backend} 基地の地形境界にスカート由来の暗い法線がない`,seamNormals.count>0&&seamNormals.minDot>.9999,seamNormals);
  await sample(page,backend,'port');await page.screenshot({path:`docs/screenshots/settlement-${backend}-port.png`});
  // Same running game, static review camera only: no image generation or scene
  // substitution. This view documents the whole port and district arrangement.
  await page.evaluate(()=>{
   const g=window.__lyrion,c=g.chase.camera,p=g.baseFrame.toWorld(g.state.pos.clone().set(340,240,285),g.state.pos.clone());
   c.position.copy(p).sub(g.origin);c.up.set(0,1,0).applyQuaternion(g.baseFrame.rotation);c.lookAt(g.baseFrame.toWorld(p.set(-30,5,-190),p).sub(g.origin));
   document.querySelector('.hud').style.display='none';g.renderer.render(g.scene,c);
  });await page.screenshot({path:`docs/screenshots/settlement-${backend}-overview.png`});
  await page.evaluate(()=>{document.querySelector('.hud').style.display='';window.__lyrion.tick(0);});
  await page.evaluate(()=>window.__lyrion.handlePlayAction('eva'));await tick(page,30);
  for(const [x,z] of [[-12,-20],[-12,-80],[0,-110],[0,-250]]){const r=await walkTo(page,x,z);check(`${backend} 徒歩で港から市街地へ ${x},${z}`,r.distance<2&&r.grounded,r);}
  const feet=await page.evaluate(()=>{const g=window.__lyrion,p=g.baseFrame.toLocal(g.surface.pose.position,g.surface.localPosition.clone());return p.y;});
  check(`${backend} 道路を突き抜けず接地`,Math.abs(feet-(1.025-.06))<.03,feet);
  await sample(page,backend,'street');await page.screenshot({path:`docs/screenshots/settlement-${backend}-street.png`});
  const fastWalk=await page.evaluate(()=>{
   const g=window.__lyrion,energy=g.state.energy;g.input.virtual.thrust=1;g.input.virtual.pitch=-1;for(let i=0;i<20;i++)g.tick(.05);
   const p=g.snapshot().propulsion,result={speed:Math.hypot(g.surface.localVelocity.x,g.surface.localVelocity.z),title:p.title,mode:p.mode,consumed:energy-g.state.energy};g.input.reset();return result;
  });check(`${backend} 地上の速歩は3.5m/sで消費なしと表示`,Math.abs(fastWalk.speed-3.5)<.05&&fastWalk.mode==='fast-walk'&&fastWalk.title.includes('3.5')&&fastWalk.consumed<=0,fastWalk);
  const wallWalk=await walkTo(page,-50,-308);check(`${backend} 市街地の建物まで歩ける`,wallWalk.distance<2,wallWalk);
  await page.evaluate(()=>{const g=window.__lyrion;g.input.virtual.thrust=1;g.input.virtual.pitch=-1;for(let i=0;i<100;i++)g.tick(.05);g.input.reset();});
  check(`${backend} 徒歩でも市街地の外壁を通り抜けない`,await page.evaluate(()=>{const g=window.__lyrion,p=g.baseFrame.toLocal(g.surface.pose.position,g.surface.localPosition.clone());return p.z> -314&&p.y>.8;}));
  const original=await page.evaluate(()=>{const g=window.__lyrion;g.saveNow();return JSON.stringify(g.state.surfaceProgress);});
  await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.continueGame();g.stop();});await tick(page);
  check(`${backend} 市街地で保存しても調査進行を保ち駐機した船で再開`,await page.evaluate(p=>{const g=window.__lyrion;return JSON.stringify(g.state.surfaceProgress)===p&&g.landing.mode==='landed'&&!g.surface.active;},original));
  await page.evaluate(()=>{const g=window.__lyrion;g.debugSurface(1000);g.input.virtual.boost=g.input.virtual.brake=true;});await tick(page,20);
  const brake=await page.evaluate(()=>({speed:window.__lyrion.snapshot().speed,mode:window.__lyrion.snapshot().propulsion.mode,energy:window.__lyrion.state.energy}));
  check(`${backend} FとX同時押しは加速せず制動を優先`,brake.speed<.1&&brake.mode==='braking'&&brake.energy>99,brake);
  await page.evaluate(()=>{const g=window.__lyrion;g.input.reset();g.debugSurface(1000);g.input.virtual.boost=true;});await tick(page,10);
  check(`${backend} 近距離ブーストの消費と残り秒数を表示`,await page.evaluate(()=>{const g=window.__lyrion,p=g.snapshot().propulsion;return p.mode==='boost'&&p.detail.includes('16 ENERGY/s')&&p.detail.includes('秒')&&g.state.energy<100;}));
  await page.evaluate(()=>{const g=window.__lyrion;g.input.reset();g.debugSurface(20000);g.input.virtual.boost=true;});await tick(page,10);
  check(`${backend} 遠方では巡航倍率と低消費を表示`,await page.evaluate(()=>{const p=window.__lyrion.snapshot().propulsion;return p.mode==='cruise'&&p.title.includes('×')&&p.detail.includes('1 ENERGY/s');}));
  await page.screenshot({path:`docs/screenshots/settlement-${backend}-cruise.png`});
  const wallFlight=await page.evaluate(()=>{
   const g=window.__lyrion;g.input.reset();g.debugSurface(8,-43,45);g.state.quat.copy(g.baseFrame.rotation);g.input.virtual.thrust=1;
   let minZ=Infinity;for(let i=0;i<30;i++){g.tick(.05);const p=g.baseFrame.toLocal(g.state.pos,g.state.pos.clone());minZ=Math.min(minZ,p.z);}g.input.reset();
   return{minZ,hull:g.state.hull};
  });
  check(`${backend} 低空飛行で基地外壁をすり抜けない`,wallFlight.minZ>=35,wallFlight);
  const resources=await page.evaluate(()=>{
   const g=window.__lyrion,cycles=[];
   for(let cycle=0;cycle<4;cycle++){
    g.debugSurface(4000000);for(let i=0;i<10;i++)g.tick(.05);
    const released=[...g.terrains.values()].reduce((sum,t)=>sum+t.chunks.size,0);
    g.debugSurface(400);g.toggleLanding();for(let i=0;i<235;i++)g.tick(.05);
    cycles.push({released,...g.rendererInfo.memory});
   }return cycles;
  });
  check(`${backend} 地上と軌道を4往復してリソースが増え続けない`,resources.every(r=>r.released===0)&&resources.slice(1).every(r=>r.textures===resources[0].textures&&Math.abs(r.geometries-resources[0].geometries)<=8),resources);
  await page.close();
 }
 for(const landscape of [false,true]){
  const page=await open('webgl2',true,landscape);await page.evaluate(()=>window.__lyrion.debugSurface(400));await tick(page);
  const bounds=await page.evaluate(()=>{
   const guide=document.querySelector('.hud-landing-guide').getBoundingClientRect(),buttons=[...document.querySelectorAll('.tc-right .tc-btn')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect());
   return{guide:{x:guide.x,y:guide.y,width:guide.width,height:guide.height},width:innerWidth,height:innerHeight,overlaps:buttons.some(r=>guide.left<r.right&&guide.right>r.left&&guide.top<r.bottom&&guide.bottom>r.top)};
  });
  check(`タッチ${landscape?'横':'縦'}画面で着陸案内が収まり操作ボタンと重ならない`,bounds.guide.x>=0&&bounds.guide.y>=0&&bounds.guide.x+bounds.guide.width<=bounds.width&&bounds.guide.y+bounds.guide.height<=bounds.height&&!bounds.overlaps,bounds);
  await page.screenshot({path:`docs/screenshots/settlement-mobile-${landscape?'landscape':'portrait'}.png`});
  await page.locator('.tc-btn.land').dispatchEvent('pointerdown',{pointerId:81,pointerType:'touch',bubbles:true});await tick(page,230);
  check(`タッチ${landscape?'横':'縦'} LANDで実際に着陸`,await page.evaluate(()=>window.__lyrion.landing.mode==='landed'));
  await page.close();
 }
 check('ページ・描画エラーなし',errors.length===0,errors);
}catch(e){check('検証を完遂',false,String(e));}finally{await browser.close();server.close();writeFileSync('docs/validation/settlement-quality.json',JSON.stringify(report,null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
