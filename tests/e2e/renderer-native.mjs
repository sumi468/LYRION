import { chromium, serve, launchOptions, sleep } from './harness.mjs';
import { writeFileSync } from 'node:fs';
const server = await serve(4211);
const browser = await chromium.launch(launchOptions());
const results = [], errors = [], lossDiagnostics=[];
let intentionalLoss=false;
const check = (name, ok, details) => { results.push({ name, ok, details }); console.log(ok ? 'PASS' : 'FAIL', name, details ?? ''); };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0,1200)); });
  page.on('console', m => { if(m.type()==='error'){ (intentionalLoss && /Device was lost before mapping/.test(m.text()) ? lossDiagnostics : errors).push(m.text()); console.log('CONSOLE',m.text().slice(0,1600)); } });
  await page.addInitScript(() => {if(!localStorage.getItem('lyrion.settings.v1'))localStorage.setItem('lyrion.settings.v1', JSON.stringify({quality:'low',renderer:'webgpu'}));});
  await page.goto(server.url.replace('renderer=webgl2','renderer=webgpu'));
  await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  const initial = await page.evaluate(() => window.__lyrion.rendererStatus);
  const nativeDevice=await page.evaluate(()=>{const runtime=window.__lyrion.renderer;return runtime.native.backend.isWebGPUBackend===true&&runtime.native.backend.device===runtime.device;});
  check('実デバイスでWebGPU初期化', initial?.backend === 'webgpu'&&nativeDevice, {...initial,nativeBackendUsesRequestedDevice:nativeDevice});
  await page.evaluate(() => window.__lyrion.startNew());
  await sleep(3000);
  const rendered = await page.evaluate(() => ({ status:window.__lyrion.rendererStatus, info:JSON.parse(JSON.stringify(window.__lyrion.rendererInfo)), fps:window.__lyrion.fps }));
  check('WebGPUで実ゲームを描画', rendered.status.backend==='webgpu' && rendered.info.render.calls>10 && rendered.info.render.triangles>1000, rendered);
  check('GLSL移行材質の霧設定を維持',await page.evaluate(()=>[...window.__lyrion.renderer.bridge.cache.values()].every(entry=>entry.native.material.fog===entry.source.fog)));
  await page.screenshot({path:'docs/screenshots/nextgen-webgpu.png'});
  // Probe the same native device the renderer owns, then deliberately lose it.
  intentionalLoss=true;
  await page.evaluate(() => { const g=window.__lyrion;g.state.data=123;g.saveNow();g.renderer.device.destroy(); });
  await page.waitForFunction(() => window.__lyrion?.phase==='menu' && window.__lyrion.rendererStatus?.backend==='webgl2',null,{timeout:90000});
  check('デバイス喪失からWebGL 2で復帰', await page.evaluate(() => window.__lyrion.continueGame() && window.__lyrion.state.data===123));
  await page.close();
  const fallback=await browser.newPage({viewport:{width:640,height:360}});
  await fallback.addInitScript(() => {localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'low',renderer:'auto'})); Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>null}});});
  await fallback.goto(server.url.replace('renderer=webgl2','renderer=auto'));
  await fallback.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:90000});
  const status=await fallback.evaluate(()=>window.__lyrion.rendererStatus);
  check('アダプター取得失敗時のフォールバック',status.backend==='webgl2' && !!status.reason,status);
  check('描画エラーなし',errors.length===0,errors.map(e=>e.slice(0,300)));
} catch(error){ check('テスト完遂',false,String(error)); }
finally {await browser.close();server.close();writeFileSync('docs/validation/renderer-native.json',JSON.stringify({time:new Date().toISOString(),results,errors,lossDiagnostics},null,2));}
if(results.some(r=>!r.ok))process.exitCode=1;
