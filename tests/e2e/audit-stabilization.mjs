import { chromium, launchOptions, serve, graphicsInfo } from './harness.mjs';
import { writeFileSync } from 'node:fs';
const server=await serve(4194),browser=await chromium.launch(launchOptions()),errors=[];
const fixed=process.env.AUDIT_EXPECT_FIXED!=='0';
const report={timestamp:new Date().toISOString(),source:fixed?'Integrated stabilization build':'v0.7.1 baseline dist; no product edits',cases:[],errors};
const record=(id,data)=>{report.cases.push({id,...data});console.log(id,JSON.stringify(data));};
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'low',difficulty:'off',audioEnabled:false})));
 await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 report.graphics=await graphicsInfo(page);report.build=await page.evaluate(()=>window.__lyrion.buildInfo);
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;g.startNew();g.stop();g.tick(0);});
 record('return-assist-intermediate-waypoint',await page.evaluate(()=>{
  const g=window.__lyrion,h=g.home,e=h.eva;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');
  e.localPosition.set(100,9,0);e.localVelocity.set(0,0,0);e.sync(g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('return');
  let lastHatchDistance=e.position.distanceTo(e.hatchPosition),recoveredAt=null;
  for(let i=0;i<1200;i++){lastHatchDistance=e.position.distanceTo(e.hatchPosition);g.tick(.05);if(!e.active){recoveredAt={afterSeconds:(i+1)*.05,preBoardHatchDistance:lastHatchDistance};break;}}
  return {reproduced:recoveredAt!==null&&recoveredAt.preBoardHatchDistance>4,recoveredAt,finalMode:h.mode};
 }));
 record('landing-approach-permits-eva',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();g.debugTeleport('cindra',80);g.tick(0);g.toggleLanding();const before={landing:g.landing.mode,landed:g.state.landed};
  g.handlePlayAction('eva');const immediate={eva:g.home.eva.active,landing:g.landing.mode};
  for(let i=0;i<100;i++)g.tick(.05);
  return {reproduced:before.landing==='approach'&&immediate.eva,before,immediate,after:{eva:g.home.eva.active,landing:g.landing.mode,landed:g.state.landed,oxygen:g.home.eva.oxygen}};
 }));
 record('undock-save-has-stale-docked-state',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.persist(g.state);h.measure(g.state);
  g.handlePlayAction('dock');const raw=JSON.parse(localStorage.getItem('lyrion.save.v1'));
  const mode=h.docking.mode;g.continueGame();g.stop();
  return {reproduced:mode==='undocking'&&raw.homecoming.docked===true,mode,savedDocked:raw.homecoming.docked,liveDocked:g.state.homecoming.docked,restoredMode:h.mode};
 }));
 record('flying-ship-return-assist-hardcoded-waypoint',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home,p=g.state.pos.clone().set(100,9,-80);
  h.frames.asterion.toWorld(p,g.state.pos);h.frames.asterion.pointVelocity(p,g.state.vel);g.state.quat.copy(h.frames.asterion.rotation);h.measure(g.state);
  g.handlePlayAction('eva');const e=h.eva;e.localPosition.x+=12;e.sync(g.state,h.frames.asterion);g.handlePlayAction('return');let recovered=null;
  for(let i=0;i<1200;i++){const before=e.position.distanceTo(e.hatchPosition);g.tick(.05);if(!e.active){recovered={seconds:(i+1)*.05,preBoardHatchDistance:before};break;}}
  return {reproduced:recovered!==null&&recovered.preBoardHatchDistance>4,recovered,frame:e.frameId,parkedLocal:e.parkedPosition.toArray()};
 }));
 record('blocked-actions-silent',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');
  let toastCount=0;const off=g.ev.on('toast',()=>toastCount++);g.handlePlayAction('dock');g.handlePlayAction('land');g.handlePlayAction('dodge');off();
  return {reproduced:toastCount===0,attempted:['dock','land','dodge'],toastCount,mode:h.mode};
 }));
 record('camera-clip-minimum-retains-wall-intersection',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');
  const e=h.eva;e.localPosition.set(3.52,0,8);e.localVelocity.set(0,0,0);e.look.set(0,-Math.PI/2,0);e.localRotation.setFromEuler(e.look);e.sync(g.state,h.frames.asterion);g.tick(0);
  const camera=h.frames.asterion.toLocal(g.camWorld,g.state.pos.clone()),focus=h.frames.asterion.toLocal(e.position,g.state.pos.clone());
  const clearance=camera.x-3.1;
  return {reproduced:clearance<.3&&camera.z>-14&&camera.z<17,focusLocal:focus.toArray(),cameraLocal:camera.toArray(),hullClearance:clearance,cameraRequiredRadius:.3,nearPlane:g.chase.camera.near};
 }));
 record('suit-sphere-allows-boots-through-hull',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');
  const e=h.eva;e.localPosition.set(0,3.6,0);e.localVelocity.set(0,0,0);e.look.set(0,0,0);e.localRotation.setFromEuler(e.look);e.sync(g.state,h.frames.asterion);g.tick(0);
  const v=g.state.pos.clone();let minY=Infinity,maxY=-Infinity;
  g.expeditionView.astronaut.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).add(g.origin);h.frames.asterion.toLocal(v,v);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}});
  return {reproduced:e.localPosition.y>3.52&&minY<3.1,avatarCentreY:e.localPosition.y,suitMinY:minY,suitMaxY:maxY,hullTopY:3.1,penetration:3.1-minY};
 }));
 record('wall-contact-discards-tangential-eva-motion',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');
  const e=h.eva;e.localPosition.set(3.52,0,8);e.localVelocity.set(-3,0,2);e.stabilized=false;e.look.set(0,0,0);e.sync(g.state,h.frames.asterion);g.tick(.05);
  return {reproduced:Math.abs(e.localVelocity.z)<.01,requestedInwardSpeed:-3,requestedTangentialSpeed:2,resultLocalVelocity:e.localVelocity.toArray(),resultLocalPosition:e.localPosition.toArray()};
 }));
 record('completed-target-steals-nearby-repair-interaction',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');const e=h.eva;
  h.frames.asterion.toLocal(h.points['antenna-diagnosis'],e.localPosition);e.localVelocity.set(0,0,0);e.sync(g.state,h.frames.asterion);g.tick(0);g.handlePlayAction('investigate');
  for(let i=0;i<80;i++)g.tick(.05);
  let message='';const off=g.ev.on('toast',t=>message=t.title);g.handlePlayAction('investigate');off();
  return {reproduced:h.investigations.activeId===null&&message.includes('調査済み'),diagnosisCompleted:g.state.homecoming.investigated['antenna-diagnosis']!==undefined,diagnosisDistance:h.distances['antenna-diagnosis'],repairDistance:h.distances['antenna-repair'],active:h.investigations.activeId,message,localPosition:e.localPosition.toArray()};
 }));
 record('planet-contact-return-route-uninitialized',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();g.debugTeleport('cindra',80);g.tick(0);g.handlePlayAction('eva');
  const h=g.home,e=h.eva,frame=h.frames.get(e.frameId),c=g.positions.cindra,r=g.views.get('cindra').def.radius;
  const normal=g.state.pos.clone().sub(c).normalize();e.position.copy(c).addScaledVector(normal,r+.5);frame.toLocal(e.position,e.localPosition);e.localVelocity.set(0,0,0);e.sync(g.state,frame);g.tick(0);
  const initiated={returning:e.returning,routeLength:e.returnRoute.length,hatchDistance:e.position.distanceTo(e.hatchPosition)};
  const start=e.position.clone();g.tick(.05);const delta=e.position.clone().sub(start),hatchDirection=e.hatchPosition.clone().sub(start).normalize();
  return {reproduced:initiated.returning&&initiated.routeLength===0,initiated,after:{returning:e.returning,routeLength:e.returnRoute.length,hatchDistance:e.position.distanceTo(e.hatchPosition),displacement:delta.length(),towardHatch:delta.dot(hatchDirection),localVelocity:e.localVelocity.toArray()}};
 }));
 record('suit-sidewall-and-backpack-clearance',await page.evaluate(()=>{
  const g=window.__lyrion,poses=[];
  for(const [name,yaw,pitch] of [['side',0,0],['backpack',-Math.PI/2,0],['diagonal',.8,0],['pitched-boot',.8,1.1],['pitched-workhand',.8,-1.1]]){
   g.startNew();g.stop();const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.handlePlayAction('eva');const e=h.eva;
   e.localPosition.set(3.52,0,8);e.localVelocity.set(0,0,0);e.look.set(pitch,yaw,0);e.localRotation.setFromEuler(e.look);e.sync(g.state,h.frames.asterion);g.tick(0);
   const v=g.state.pos.clone();let minX=Infinity;
   for(let step=0;step<=180;step++){
    e.localVelocity.set(step<80?4:0,1,-3);e.thrust=step<80?1:0;e.returning=step>130;
    g.expeditionView.astronautModel.update(e,step>60,g.state.time+step/60,g.profile);g.expeditionView.astronaut.updateMatrixWorld(true);
    g.expeditionView.astronaut.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).add(g.origin);h.frames.asterion.toLocal(v,v);minX=Math.min(minX,v.x);}});
   }
   poses.push({name,yaw,pitch,centreX:e.localPosition.x,meshMinX:minX,hullFaceX:3.1,clearance:minX-3.1});
  }
  return {reproduced:poses.some(p=>p.clearance<0),poses};
 }));
 record('wayfarer-recorder-planet-envelope-blocks-work',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();g.debugTeleport('wayfarer',80);g.tick(0);const h=g.home;ejectVelocity();g.handlePlayAction('eva');const e=h.eva,frame=h.frames.get(e.frameId);
  function ejectVelocity(){const local=h.frames.wayfarer.toLocal(g.state.pos,g.state.pos.clone());h.frames.wayfarer.pointVelocity(local,g.state.vel);h.measure(g.state);}
  frame.toLocal(h.points['wayfarer-recorder'],e.localPosition);e.localVelocity.set(0,0,0);e.sync(g.state,frame);g.tick(0);const initial={returning:e.returning,routeLength:e.returnRoute.length,distance:h.distances['wayfarer-recorder']};
  const message=h.investigate(g.state);let maxDistance=h.distances['wayfarer-recorder'];for(let i=0;i<110;i++){g.tick(.05);maxDistance=Math.max(maxDistance,h.distances['wayfarer-recorder']);}
  return {reproduced:g.state.homecoming.investigated['wayfarer-recorder']===undefined,evaStarted:e.active,initial,message,maxDistance,completed:g.state.homecoming.investigated['wayfarer-recorder']!==undefined,returning:e.returning,routeLength:e.returnRoute.length};
 }));
 record('planet-obstructed-return-rejects-with-manual-recovery',await page.evaluate(()=>{
  const g=window.__lyrion;g.startNew();g.stop();g.debugTeleport('cindra',80);g.tick(0);g.handlePlayAction('eva');const h=g.home,e=h.eva,frame=h.frames.get(e.frameId),radius=g.views.get('cindra').def.radius;
  let normal=g.state.pos.clone().sub(g.positions.cindra).normalize();e.position.copy(g.positions.cindra).addScaledVector(normal,-(radius+2));frame.toLocal(e.position,e.localPosition);e.localVelocity.set(0,0,0);e.sync(g.state,frame);g.tick(0);
  let message='';const off=g.ev.on('toast',t=>message=t.title);g.handlePlayAction('return');off();
  const blocked={returning:e.returning,routeBlocked:e.routeBlocked,message,hatchDistance:e.position.distanceTo(e.hatchPosition)};
  const before=e.localPosition.clone();g.input.keys.add('KeyD');for(let i=0;i<20;i++)g.tick(.05);g.input.reset();const manualMovement=e.localPosition.distanceTo(before);
  normal=g.state.pos.clone().sub(g.positions.cindra).normalize();e.position.copy(g.positions.cindra).addScaledVector(normal,radius+10);frame.toLocal(e.position,e.localPosition);e.localVelocity.set(0,0,0);e.sync(g.state,frame);g.tick(0);g.handlePlayAction('return');const nearSideAccepted=e.returning;
  let recovered=null;for(let i=0;i<1200&&e.active;i++){const hatchDistance=e.position.distanceTo(e.hatchPosition);g.tick(.05);if(!e.active)recovered={seconds:(i+1)*.05,preBoardHatchDistance:hatchDistance};}
  return {reproduced:blocked.returning||!blocked.routeBlocked||!message.includes('シンドラ')||manualMovement<.1||!nearSideAccepted||recovered===null||recovered.preBoardHatchDistance>1.4,blocked,manualMovement,nearSideAccepted,recovered};
 }));
 if(fixed){
  for(const item of report.cases){
    item.ok=!item.reproduced;
    if(item.id==='return-assist-intermediate-waypoint')item.ok&&=item.recoveredAt!==null&&item.recoveredAt.preBoardHatchDistance<=1.4;
    if(item.id==='flying-ship-return-assist-hardcoded-waypoint')item.ok&&=item.recovered!==null&&item.recovered.preBoardHatchDistance<=1.4;
    if(item.id==='undock-save-has-stale-docked-state')item.ok&&=item.savedDocked===false&&item.restoredMode==='flight';
    if(item.id==='completed-target-steals-nearby-repair-interaction')item.ok&&=item.diagnosisCompleted&&item.active==='antenna-repair';
  }
  if(report.cases.some(item=>!item.ok)||errors.length)throw new Error('Stabilization regression remains');
 }
}catch(e){report.failure=String(e);console.error(e);}finally{writeFileSync(new URL(`../../docs/validation/stabilization-${fixed?'current':'observed'}.json`,import.meta.url),JSON.stringify(report,null,2));await browser.close();server.close();}
if(report.failure)process.exitCode=1;
