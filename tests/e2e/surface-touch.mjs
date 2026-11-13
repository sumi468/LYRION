import {chromium,serve,launchOptions} from './harness.mjs';
import {writeFileSync} from 'node:fs';
const server=await serve(4217),browser=await chromium.launch(launchOptions()),results=[],errors=[];
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(ok?'PASS':'FAIL',name,data??'');};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'low',renderer:'webgl2',difficulty:'off'})));
 await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 await page.evaluate(()=>{const g=window.__lyrion;g.startNew();g.stop();g.debugSurface(400);g.handlePlayAction('land');for(let i=0;i<230;i++)g.tick(.05);});
 await page.locator('.tc-context button').filter({hasText:'EVA'}).tap();await page.evaluate(()=>{for(let i=0;i<30;i++)window.__lyrion.tick(.05);});
 check('タッチで降機し地上用操作を表示',await page.evaluate(()=>window.__lyrion.surface.active)&&await page.getByRole('button',{name:'跳ぶ',exact:true}).isVisible());
 const before=await page.evaluate(()=>({ship:window.__lyrion.state.pos.toArray(),crew:window.__lyrion.surface.pose.position.toArray()})),bounds=await page.locator('.tc-stick').boundingBox();
 const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
 await page.locator('.tc-stick').dispatchEvent('pointerdown',{pointerId:20,pointerType:'touch',clientX:x,clientY:y,bubbles:true});
 await page.locator('.tc-stick').dispatchEvent('pointermove',{pointerId:20,pointerType:'touch',clientX:x,clientY:y-38,bubbles:true});
 await page.evaluate(()=>{for(let i=0;i<20;i++)window.__lyrion.tick(.05);});await page.locator('.tc-stick').dispatchEvent('pointerup',{pointerId:20,pointerType:'touch',bubbles:true});
 check('地上スティックが宇宙服を歩かせ機体を操縦しない',await page.evaluate(before=>{const g=window.__lyrion;return g.surface.pose.position.distanceTo(g.surface.pose.position.clone().fromArray(before.crew))>1&&g.state.pos.distanceTo(g.state.pos.clone().fromArray(before.ship))<20;},before));
 await page.getByRole('button',{name:'跳ぶ',exact:true}).dispatchEvent('pointerdown',{pointerId:21,pointerType:'touch',bubbles:true});await page.evaluate(()=>{window.__lyrion.tick(.05);});
 check('タッチで重力下のジャンプ',await page.evaluate(()=>window.__lyrion.surface.localVelocity.y>0));
 await page.getByRole('button',{name:'跳ぶ',exact:true}).dispatchEvent('pointerup',{pointerId:21,pointerType:'touch',bubbles:true});await page.evaluate(()=>{for(let i=0;i<30;i++)window.__lyrion.tick(.05);});
  check('上下を見るときも身体と接地カプセルを直立に維持',await page.evaluate(()=>{const g=window.__lyrion;g.input.keys.add('ArrowUp');for(let i=0;i<20;i++)g.tick(.05);g.input.reset();const up=g.surface.pose.position.clone().set(0,1,0),bodyUp=up.clone().applyQuaternion(g.surfaceAstronaut.group.quaternion),normal=up.applyQuaternion(g.surface.frame.rotation);return bodyUp.dot(normal)>.9999;}));
 await page.screenshot({path:'docs/screenshots/nextgen-surface-mobile.png'});
 check('エラーなし',errors.length===0,errors);
}catch(e){check('完遂',false,String(e));}finally{await browser.close();server.close();writeFileSync('docs/validation/surface-touch.json',JSON.stringify({results,errors},null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
