// Playwright スモークテスト: 実ブラウザで主要フローを通す。
// 使い方: npm run build && npm run test:e2e   (preview サーバを自動起動)
// SOFTWARE_GL=1 でソフトウェアGLへ切替可。Windowsではインストール済みChromeも利用する。
import { chromium, SHOTS, sleep, serve, launchOptions } from './harness.mjs';
import { sep } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const server = await serve(4179);
const GAME_URL = server.url;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(GAME_URL)).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  // ソフトウェアGLは非常に遅いため、画質は固定(low)・小さな画面で、tick() を手動で進めて決定的に検証する
  await page.addInitScript(() => localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'low' })));
  const step = (n, dt = 0.05) => page.evaluate(([n, dt]) => { const g = window.__lyrion; for (let i = 0; i < n; i++) g.tick(dt); }, [n, dt]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.__lyrion, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__lyrion.phase === 'menu' || window.__lyrion.phase === 'playing', null, { timeout: 60000 });
  check('起動してメニューが表示される', true);
  await page.screenshot({ path: SHOTS + sep + '01-menu.png', timeout: 120000 });

  await page.evaluate(() => { window.__lyrion.startNew(); window.__lyrion.stop(); });
  await step(3);
  check('ゲーム開始 (playing)', await page.evaluate(() => window.__lyrion.phase === 'playing'));
  await page.screenshot({ path: SHOTS + sep + '02-start.png', timeout: 120000 });

  // 入力: W 長押しで加速するか
  await page.keyboard.down('KeyW');
  await step(20);
  const speed = await page.evaluate(() => window.__lyrion.state.vel.length());
  await page.keyboard.up('KeyW');
  check('W で推進し速度が増える', speed > 1, `speed=${speed.toFixed(1)}`);

  // カメラ切替
  const cam0 = await page.evaluate(() => window.__lyrion.state.cameraMode);
  await page.keyboard.press('KeyC');
  await step(2);
  const cam1 = await page.evaluate(() => window.__lyrion.state.cameraMode);
  check('C でカメラ切替', cam0 !== cam1, `${cam0}→${cam1}`);
  await page.screenshot({ path: SHOTS + sep + '03-cockpit.png', timeout: 120000 });
  await page.keyboard.press('KeyC');

  // 全天体へテレポートしてスキャン→報酬
  const ids = ['cindra', 'thalassa', 'lumen', 'aurelion'];
  for (const id of ids) {
    await page.evaluate((i) => { const g = window.__lyrion; g.debugTeleport(i, 120); g.state.vel.set(0, 0, 0); g.setTarget(i); }, id);
    await step(4);
    await page.screenshot({ path: SHOTS + sep + `10-${id}.png`, timeout: 120000 });
    await page.evaluate(() => window.__lyrion.toggleScan());
    await step(130); // 最長スキャン時間(約6s)を 0.05s 刻みで消化
    check(`スキャン完了: ${id}`, await page.evaluate((i) => window.__lyrion.state.scanned.has(i), id));
  }
  const data = await page.evaluate(() => window.__lyrion.state.data);
  check('スキャン報酬でデータ獲得', data > 0, `data=${data}`);

  // アップグレード購入
  const bought = await page.evaluate(() => window.__lyrion.buyUpgrade('engine'));
  check('アップグレード購入', bought === true);

  // セーブ→リロード→Continue
  await page.evaluate(() => window.__lyrion.saveNow());
  const before = await page.evaluate(() => ({ s: window.__lyrion.state.scanned.size, u: window.__lyrion.state.upgrades.engine }));
  await page.reload();
  await page.waitForFunction(() => window.__lyrion && window.__lyrion.phase === 'menu', null, { timeout: 60000 });
  await page.evaluate(() => window.__lyrion.stop());
  const cont = await page.evaluate(() => window.__lyrion.continueGame());
  await step(2);
  const after = await page.evaluate(() => ({ s: window.__lyrion.state.scanned.size, u: window.__lyrion.state.upgrades.engine }));
  check('セーブ/ロードで進行が復元される', cont && before.s === after.s && before.u === after.u, JSON.stringify({ before, after }));

  // 画質設定が描画負荷に反映されるか
  const dpr = {};
  for (const q of ['low', 'medium', 'high']) {
    dpr[q] = await page.evaluate(async (qq) => { const g = window.__lyrion; g.applySettings({ ...g.settings, quality: qq }); await g.texturesReady; const c = document.getElementById('game-canvas'); const p = g.currentProfile; return { px: c.width * c.height, stars: p.stars, belt: p.belt, segs: p.segments[0] }; }, q);
  }
  check('画質設定が解像度・星数・小惑星数・分割数に反映される', dpr.low.px < dpr.high.px && dpr.low.stars < dpr.high.stars && dpr.low.belt < dpr.high.belt && dpr.low.segs < dpr.high.segs, JSON.stringify(dpr));

  // 一時停止/再開
  await page.evaluate(() => window.__lyrion.pause());
  const p1 = await page.evaluate(() => window.__lyrion.phase);
  await page.evaluate(() => window.__lyrion.resume());
  const p2 = await page.evaluate(() => window.__lyrion.phase);
  check('一時停止と再開', p1 === 'paused' && p2 === 'playing');

  check('コンソール/ページエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
} catch (e) {
  check('スモークテスト例外なし', false, String(e));
} finally {
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
const reportDir = fileURLToPath(new URL('../../docs/validation/', import.meta.url));
mkdirSync(reportDir, { recursive: true });
writeFileSync(reportDir + sep + 'smoke.json', JSON.stringify({ timestamp:new Date().toISOString(),results },null,2));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
