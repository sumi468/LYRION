import { chromium, launchOptions, serve, graphicsInfo, sleep, SHOTS } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// This is the actual game's scene, model, lighting and renderer. Only the review
// camera and HUD visibility change for the three close-up inspection photographs.
const server=await serve(4198),browser=await chromium.launch(launchOptions());
const errors=[],report={timestamp:new Date().toISOString(),graphics:null,model:null,screenshots:[],errors};
const capture=async(page,name)=>{const path=join(SHOTS,name);await page.screenshot({path});report.screenshots.push(path);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',difficulty:'off',audioEnabled:false})));
  await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
  report.build=await page.evaluate(()=>window.__lyrion.buildInfo);
  report.graphics=await graphicsInfo(page);
  report.model=await page.evaluate(async()=>{
    const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;g.startNew();g.stop();await g.texturesReady;
    const h=g.home;h.docking.restore(true,g.state,h.frames.asterion);h.measure(g.state);g.syncControlMode();
    // Unlock inspection through the real first-mission predicates and reward API.
    // Debug travel changes ship coordinates only; no completion flags are written.
    if(!g.selectExpedition('first-departure'))throw new Error('First departure briefing could not be accepted');
    g.handlePlayAction('dock');for(let i=0;i<80;i++)g.tick(.05);
    g.state.pos.copy(h.points.nav);const nav=g.state.pos.clone();h.frames.asterion.toLocal(g.state.pos,nav);h.frames.asterion.pointVelocity(nav,g.state.vel);
    for(let i=0;i<60;i++)g.tick(.05);
    if(!g.state.homecoming.objectives.includes('departure-stable'))throw new Error('First mission navigation/stabilization did not complete');
    const approach=g.state.pos.clone().set(0,10,110);h.frames.asterion.toWorld(approach,g.state.pos);h.frames.asterion.pointVelocity(approach,g.state.vel);g.state.quat.copy(h.frames.asterion.rotation);h.measure(g.state);
    g.handlePlayAction('dock');for(let i=0;i<240;i++)g.tick(.05);
    if(!g.reportExpedition()||!g.selectExpedition('orbital-inspection'))throw new Error('First mission report did not unlock orbital inspection');
    g.handlePlayAction('eva');
    const e=h.eva;e.localPosition.set(-12,7,30);e.localVelocity.set(0,0,0);e.sync(g.state,h.frames.asterion);
    g.tick(0);g.expeditionView.astronautModel.resetPose();g.scene.updateMatrixWorld(true);
    const model=g.expeditionView.astronautModel,inverse=model.group.matrixWorld.clone().invert(),point=g.state.pos.clone();
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let batches=0;
    model.group.traverse(object=>{
      if(!object.isMesh)return;batches++;const p=object.geometry.getAttribute('position');
      for(let i=0;i<p.count;i++){
        point.fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        for(let j=0;j<3;j++){const n=point.getComponent(j);min[j]=Math.min(min[j],n);max[j]=Math.max(max[j],n);}
      }
    });
    const posedMin=[Infinity,Infinity,Infinity],posedMax=[-Infinity,-Infinity,-Infinity];let posedRadiusXZ=0,posedRadius3D=0,maxXZPoint,max3DPoint;
    e.active=false;model.update(e,false,g.state.time,g.currentProfile);e.active=true;
    for(let pose=0;pose<180;pose++){
      e.localVelocity.set(4,1,-3).setLength(6);e.thrust=1;e.returning=pose>130;
      model.update(e,pose>60,g.state.time+(pose+1)/60,g.currentProfile);model.group.updateMatrixWorld(true);
      model.group.traverse(object=>{
        if(!object.isMesh)return;const p=object.geometry.getAttribute('position');
        for(let i=0;i<p.count;i++){
          point.fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
          for(let j=0;j<3;j++){const n=point.getComponent(j);posedMin[j]=Math.min(posedMin[j],n);posedMax[j]=Math.max(posedMax[j],n);}
          const radiusXZ=Math.hypot(point.x,point.z),radius3D=point.length();
          if(radiusXZ>posedRadiusXZ){posedRadiusXZ=radiusXZ;maxXZPoint=point.toArray();}if(radius3D>posedRadius3D){posedRadius3D=radius3D;max3DPoint=point.toArray();}
        }
      });
    }
    e.localVelocity.set(0,0,0);e.thrust=0;e.returning=false;model.resetPose();g.tick(0);
    return {triangles:model.triangleCount,batches,bounds:{min,max,size:max.map((n,i)=>n-min[i])},posedBounds:{min:posedMin,max:posedMax,size:posedMax.map((n,i)=>n-posedMin[i]),radiusXZ:posedRadiusXZ,radius3D:posedRadius3D,maxXZPoint,max3DPoint},evaActive:e.active};
  });
  if(!report.model.evaActive||!report.model.bounds.size.every(Number.isFinite))throw new Error('Actual EVA model did not enter a finite, visible state');
  await page.addStyleTag({content:'#ui-root{visibility:hidden!important}'});
  for(const [name,offset] of [['front',[0,.12,-3.5]],['side',[3.5,.12,0]],['back',[0,.12,3.5]]]){
    await page.evaluate(offset=>{
      const g=window.__lyrion,e=g.home.eva,c=g.chase.camera,avatar=g.expeditionView.astronaut;
      const p=g.state.pos.clone().fromArray(offset).applyQuaternion(e.rotation).add(avatar.position);
      const target=g.state.pos.clone().set(0,-.015,.02).applyQuaternion(e.rotation).add(avatar.position);
      c.near=.045;c.fov=39;c.position.copy(p);c.up.set(0,1,0).applyQuaternion(e.rotation);c.lookAt(target);c.updateProjectionMatrix();c.updateMatrixWorld();g.renderer.render(g.scene,c);
    },offset);
    if(name==='front'){
      report.sunOcclusion=await page.evaluate(()=>{
        const g=window.__lyrion,c=g.chase.camera,gl=document.querySelector('#game-canvas').getContext('webgl2');
        const point=g.state.pos.clone().set(0,.02,-.23).applyMatrix4(g.expeditionView.astronaut.matrixWorld).project(c);
        const width=120,height=120,x=Math.round((point.x*.5+.5)*gl.drawingBufferWidth-width/2),y=Math.round((point.y*.5+.5)*gl.drawingBufferHeight-height/2);
        const read=()=>{
          const bytes=new Uint8Array(width*height*4);gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const context=canvas.getContext('2d');context.putImageData(new ImageData(new Uint8ClampedArray(bytes),width,height),0,0);return context.getImageData(0,0,width,height).data;
        };
        const sprites=[];g.sun.group.traverse(o=>{if(o.isSprite)sprites.push([o,o.visible]);});
        g.renderer.render(g.scene,c);const visible=read();
        for(const [sprite] of sprites)sprite.visible=false;
        g.renderer.render(g.scene,c);const hidden=read();
        for(const [sprite,wasVisible] of sprites)sprite.visible=wasVisible;
        g.renderer.render(g.scene,c);
        let maxDelta=0,totalDelta=0;
        for(let i=0;i<visible.length;i++)if(i%4!==3){const delta=Math.abs(visible[i]-hidden[i]);maxDelta=Math.max(maxDelta,delta);totalDelta+=delta;}
        return {region:{x,y,width,height,coordinates:'WebGL bottom-left pixels, projected opaque suit belly'},sprites:sprites.length,maxDelta,meanDelta:totalDelta/(width*height*3)};
      });
      if(report.sunOcclusion.maxDelta>1||report.sunOcclusion.sprites!==2)throw new Error(`Sun glow leaks through opaque suit: ${JSON.stringify(report.sunOcclusion)}`);
    }
    await sleep(80);await capture(page,`90-astronaut-${name}.png`);
  }
  await page.evaluate(()=>{
    const g=window.__lyrion,e=g.home.eva,c=g.chase.camera;
    e.localPosition.set(-4.8,2.4,31);e.localVelocity.set(0,0,0);e.sync(g.state,g.home.frames.asterion);g.tick(0);g.expeditionView.astronautModel.resetPose();
    const avatar=g.expeditionView.astronaut;
    c.position.copy(g.state.pos).set(-7,3,-10).applyQuaternion(e.rotation).add(avatar.position);
    const target=g.state.pos.clone().set(1.8,-.1,1).applyQuaternion(e.rotation).add(avatar.position);
    c.fov=47;c.up.set(0,1,0).applyQuaternion(e.rotation);c.lookAt(target);c.updateProjectionMatrix();c.updateMatrixWorld();g.renderer.render(g.scene,c);
  });
  await sleep(80);await capture(page,'90-astronaut-beside-lx07.png');
  await page.evaluate(()=>{
    const g=window.__lyrion,e=g.home.eva;e.localPosition.set(-6.1,1.8,8);e.localVelocity.set(0,0,0);
    e.look.set(0,-Math.PI/2,0,'YXZ');e.localRotation.setFromEuler(e.look);e.sync(g.state,g.home.frames.asterion);
    g.home.measure(g.state);g.home.investigations.request('maintenance-panel',g.state.homecoming,g.home.distances['maintenance-panel'],true);
    // Animate only the suit for a settled working pose, then use the ordinary EVA camera.
    for(let i=0;i<80;i++)g.expeditionView.astronautModel.update(e,true,g.state.time+i/60,g.currentProfile);
    g.chase.camera.fov=g.settings.fov;g.chase.camera.updateProjectionMatrix();g.tick(0);document.querySelector('#ui-root').style.removeProperty('visibility');
  });
  await page.addStyleTag({content:'#ui-root{visibility:visible!important}'});
  // Let the ordinary game run after the expensive geometry sweep. This restores
  // a meaningful live frame counter and the player's standard EVA camera.
  await page.evaluate(()=>window.__lyrion.start());await sleep(1500);await page.evaluate(()=>window.__lyrion.stop());
  await capture(page,'90-astronaut-station-eva.png');
  report.inspection=await page.evaluate(()=>{const g=window.__lyrion;return {mission:g.state.homecoming.activeId,completed:g.state.homecoming.completed['first-departure']!==undefined,working:g.home.investigations.activeId,fov:g.chase.camera.fov,fps:g.snapshot().fps};});
  if(report.inspection.mission!=='orbital-inspection'||!report.inspection.completed)throw new Error('Station image does not show a legitimately unlocked inspection mission');
  report.render=await page.evaluate(()=>({calls:window.__lyrion.rendererInfo.render.calls,triangles:window.__lyrion.rendererInfo.render.triangles,memory:{...window.__lyrion.rendererInfo.memory}}));
  if(errors.length)throw new Error(errors.join(' | '));
  console.log(JSON.stringify({model:report.model,graphics:report.graphics,screenshots:report.screenshots},null,2));
}catch(error){report.failure=String(error);console.error(error);}finally{
  writeFileSync(new URL('../../docs/validation/astronaut-visuals.json',import.meta.url),JSON.stringify(report,null,2));
  await browser.close();server.close();
}
if(report.failure)process.exitCode=1;
