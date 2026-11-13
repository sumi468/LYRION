import {chromium,serve,launchOptions} from './harness.mjs';
import {writeFileSync} from 'node:fs';
const server=await serve(4213),browser=await chromium.launch(launchOptions()),results=[],errors=[];
let page;
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(ok?'PASS':'FAIL',name,data??'');if(!ok)throw Error(name);};
try{
 const context=await browser.newContext();page=await context.newPage();
 page.on('pageerror',e=>{errors.push(String(e));console.log('PAGEERROR',String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('ERROR',m.text());}});
 page.on('requestfailed',request=>console.log('REQUESTFAIL',request.url(),request.failure()?.errorText));
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'low',renderer:'webgl2'})));
 await page.goto(server.url+'&pwa');await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 const manifest=await page.evaluate(async()=>{const link=document.querySelector('link[rel="manifest"]');return fetch(link.href).then(r=>r.json());});
 check('マニフェストと全アイコンの実寸',await page.evaluate(async icons=>{
  for(const icon of icons){const image=new Image();image.src=icon.src;await image.decode();if(image.width!==Number(icon.sizes.split('x')[0]))return false;}return true;
 },manifest.icons),manifest.display);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:60000});
 const cached=await page.evaluate(async()=>{const keys=await caches.keys();return (await caches.open(keys[0])).keys().then(items=>items.length);});check('ローカル配信物をオフライン保存',cached>=16,cached);
 await page.evaluate(()=>{window.__lyrion.startNew();window.__lyrion.state.data=145;window.__lyrion.saveNow();});
 await context.setOffline(true);await page.reload();console.log('OFFLINE URL',page.url());await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:30000});
 check('オフライン再起動でゲームとセーブを復帰',await page.evaluate(()=>window.__lyrion.continueGame()&&window.__lyrion.state.data===145));
 await page.screenshot({path:'docs/screenshots/nextgen-offline.png'});
}catch(e){results.push({name:'完遂',ok:false,error:String(e)});console.error(e);console.log('PAGE',await page?.evaluate(()=>({url:location.href,text:document.body.innerText.slice(0,1000),debug:!!window.__lyrion})));await page?.screenshot({path:'../../work/pwa-failure.png'});}finally{await browser.close();server.close();writeFileSync('docs/validation/pwa.json',JSON.stringify({results,errors},null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
