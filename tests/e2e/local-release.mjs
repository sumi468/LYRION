import {chromium,launchOptions} from './harness.mjs';
import {writeFileSync} from 'node:fs';
const url=process.env.BASE_URL??'http://127.0.0.1:4173/',browser=await chromium.launch(launchOptions()),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'medium',renderer:'auto',difficulty:'off',audioEnabled:false})));
 await page.goto(`${url}?debug&v=0.9.0-dev.2`);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 await page.evaluate(()=>{window.__lyrion.input.requestLock=()=>{};});await page.getByRole('button',{name:'新しい探査を開始',exact:true}).click();await page.evaluate(()=>window.__lyrion.stop());
 await page.keyboard.press('KeyB');await page.getByRole('button',{name:'PRIME地上基地へ誘導',exact:true}).click();
 const report=await page.evaluate(async()=>{const g=window.__lyrion;g.tick(.05);return{build:await(await fetch('/build-info.json')).json(),phase:g.phase,target:g.targetId,marker:g.snapshot().markers.find(m=>m.id==='prime-base')?.label,renderer:g.rendererStatus};});
 report.errors=errors;report.ok=report.build.version==='0.9.0-dev.2'&&report.phase==='playing'&&report.target==='prime-base'&&report.marker?.includes('PAD 01')&&errors.length===0;
 writeFileSync('docs/validation/settlement-local-release.json',JSON.stringify(report,null,2));console.log(report.ok?'PASS':'FAIL',JSON.stringify(report));if(!report.ok)process.exitCode=1;
}finally{await browser.close();}
