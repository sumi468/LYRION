import { chromium, launchOptions, serve, sleep, graphicsInfo, SHOTS } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const server = await serve(4182);
const browser = await chromium.launch(launchOptions());
const results = [];
const errors = [];
const details = {};
const check = (name, ok, data) => { results.push({ name, ok, data }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' '+JSON.stringify(data) : ''}`); };
const step = (page, n) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__lyrion.tick(.05); }, n);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'low' })));
  await page.goto(server.url);
  await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  details.graphics = await graphicsInfo(page);
  check('操作前は音声デバイスを作らない', (await page.evaluate(() => window.__lyrion.audio.diagnostics())).state === 'locked');
  await page.evaluate(() => window.__lyrion.input.touchMode = true);
  await page.getByRole('button', { name: '新しい探査を開始', exact: true }).click();
  await page.waitForFunction(() => window.__lyrion.audio.diagnostics().state === 'running');
  await sleep(400);
  const audio = await page.evaluate(() => window.__lyrion.audio.diagnostics());
  check('開始操作で音声が有効になり波形が出る', audio.rms > .00001, audio);
  await page.evaluate(() => { window.__lyrion.pause(); window.__lyrion.stop(); });
  await page.waitForFunction(() => window.__lyrion.audio.diagnostics().state === 'suspended');
  check('一時停止中は音声処理を停止', true);
  await page.evaluate(() => { const g=window.__lyrion; g.resume(); g.stop(); g.applySettings({...g.settings,audioEnabled:false}); });
  await page.waitForFunction(() => window.__lyrion.audio.diagnostics().state === 'suspended');
  check('サウンドOFFで音声処理を停止', true);
  await page.evaluate(() => window.__lyrion.applySettings({...window.__lyrion.settings,audioEnabled:true,masterVolume:0}));
  await page.waitForFunction(() => window.__lyrion.audio.diagnostics().state === 'running');
  await sleep(600);
  check('音量0でミュート', (await page.evaluate(() => window.__lyrion.audio.diagnostics())).rms < .00001);
  await page.evaluate(() => window.__lyrion.applySettings({...window.__lyrion.settings,masterVolume:.6}));

  await page.keyboard.down('KeyW');
  await step(page, 10);
  await page.evaluate(() => { const g=window.__lyrion; g.pause(); g.resume(); g.stop(); });
  check('停止・再開時に古いキー入力を解除', await page.evaluate(() => window.__lyrion.input.keys.size === 0));
  await page.keyboard.up('KeyW');

  // 報酬やミッション状態を直接書き換えず、スキャンと購入APIだけでクリアする。
  const ids = ['cindra','thalassa','halcyon','aurelion','ember','glacia','vesper','lumen','mira','wayfarer','lyrion'];
  for (const id of ids) {
    await page.evaluate((id) => { const g=window.__lyrion; g.debugTeleport(id,id==='lyrion'?900:120); g.setTarget(id); g.tick(0); g.toggleScan(); }, id);
    await step(page, 145);
    check(`全調査: ${id}`, await page.evaluate((id) => window.__lyrion.state.scanned.has(id), id));
    if (id === 'thalassa') check('獲得報酬でミッションに必要な強化を購入', await page.evaluate(() => window.__lyrion.buyUpgrade('engine')));
  }
  await sleep(1800);
  check('8ミッション完了とクリア画面', await page.evaluate(() => window.__lyrion.state.missionIndex === 8 && document.querySelector('[data-screen="complete"]').classList.contains('on')));
  await page.screenshot({ path: join(SHOTS, '30-campaign-complete.png') });
  const completed = await page.evaluate(() => { const g=window.__lyrion; g.saveNow(); return { data:g.state.data, scanned:g.state.scanned.size, missions:g.state.missionIndex }; });
  await page.reload();
  await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  const restored = await page.evaluate(() => { const g=window.__lyrion; g.input.touchMode=true; g.continueGame(); g.stop(); return {data:g.state.data,scanned:g.state.scanned.size,missions:g.state.missionIndex}; });
  check('クリア後の記録をセーブ復元', JSON.stringify(completed) === JSON.stringify(restored), restored);

  const setQuality = (quality) => page.evaluate(async (quality) => { const g=window.__lyrion; g.applySettings({...g.settings,quality}); await g.texturesReady; g.tick(0); },quality);
  await setQuality('high'); await setQuality('low');
  const before = await page.evaluate(() => ({...window.__lyrion.rendererInfo.memory}));
  for (let i=0;i<12;i++) await setQuality(['high','medium','low'][i%3]);
  const after = await page.evaluate(() => ({...window.__lyrion.rendererInfo.memory}));
  check('画質切替12回でGPUリソースが増え続けない', after.textures === before.textures && after.geometries <= before.geometries + 2, {before,after});

  const contextSupported = await page.evaluate(() => {
    const gl=document.getElementById('game-canvas').getContext('webgl2');
    const ext=gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__restoreGL=()=>ext.restoreContext();
    ext.loseContext(); return true;
  });
  if (contextSupported) {
    await page.waitForFunction(() => window.__lyrion.contextLost);
    await sleep(150);
    await page.evaluate(() => window.__restoreGL());
    await page.waitForFunction(() => !window.__lyrion.contextLost, null, {timeout:120000});
    check('WebGLコンテキスト喪失・復帰後も描画', await page.evaluate(() => { const g=window.__lyrion; g.tick(0); return g.rendererInfo.render.calls>0 && document.getElementById('fatal').hidden; }));
  } else check('WebGLコンテキスト復帰テストを利用可能', false);

  // 高負荷時の Auto の制御を実際のフレームループで検査する(低速端末の模擬)。
  await page.evaluate(() => {
    const g=window.__lyrion; g.applySettings({...g.settings,quality:'auto'});
    const tick=g.tick.bind(g); window.__originalTick=tick;
    g.tick=(dt)=>{ const until=performance.now()+38; while(performance.now()<until){} tick(dt); };
    g.start();
  });
  await sleep(10500);
  const autoLevel=await page.evaluate(()=>{const g=window.__lyrion;g.stop();g.tick=window.__originalTick;return g.currentProfile.label;});
  check('低FPSが続くと実ループでAuto画質が降下', Number(autoLevel.slice(1))<3, autoLevel);
  check('コンソール・ページエラーなし', errors.length===0, errors);
  await page.evaluate(() => window.__lyrion.dispose());
  await sleep(200);
  check('終了時に音声リソースを破棄', (await page.evaluate(() => window.__lyrion.audio.diagnostics())).state === 'closed');
} catch (error) { check('回帰テスト例外なし',false,String(error)); }
finally {
  const dir=fileURLToPath(new URL('../../docs/validation/',import.meta.url));
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'regression.json'),JSON.stringify({timestamp:new Date().toISOString(),browser:browser.version(),...details,results,errors},null,2));
  await browser.close();server.close();
}
console.log(`${results.filter((r)=>r.ok).length}/${results.length} passed`);
if(results.some((r)=>!r.ok))process.exitCode=1;
