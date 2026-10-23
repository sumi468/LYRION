import { chromium, launchOptions, serve, graphicsInfo, sleep, SHOTS } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const server = process.env.BASE_URL ? null : await serve(4188);
const url = process.env.BASE_URL ? process.env.BASE_URL + '/?debug' : server.url;
const browser = await chromium.launch(launchOptions()), results = [], errors = [];
const report = { timestamp: new Date().toISOString(), url, results, errors };
const check = (name, ok, data) => { results.push({ name, ok, data }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data ? JSON.stringify(data) : ''}`); if (!ok) throw new Error(name); };
const shot = (page, name) => process.env.BASE_URL ? Promise.resolve() : page.screenshot({ path: join(SHOTS, name) });

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('polish-initialized')) {
      localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'high', difficulty: 'off', audioEnabled: false, showFps: false }));
      sessionStorage.setItem('polish-initialized', '1');
    }
  });
  await page.goto(url); await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  report.graphics = await graphicsInfo(page);
  await page.evaluate(() => { const g = window.__lyrion; g.input.requestLock = () => {}; g.input.locked = true; g.startNew(); });
  await sleep(500);
  const fps = await page.evaluate(() => {
    const g = window.__lyrion, el = document.querySelector('.hud-fps'), s = g.snapshot();
    return { enabled: g.settings.showFps, visible: getComputedStyle(el).display !== 'none', text: el.textContent, fps: s.fps, frameMs: s.frameMs };
  });
  check('旧設定からもFPS・フレーム時間・画質を初期表示', fps.enabled && fps.visible && fps.fps > 0 && Math.abs(fps.fps * fps.frameMs - 1000) < .01 && /FPS.*ms.*HIGH/.test(fps.text), fps);
  await shot(page, '70-fps-departure.png');
  await page.evaluate(() => window.__lyrion.stop());
  const models = await page.evaluate(() => {
    const g = window.__lyrion;
    let ship = 0; g.shipModel.hull.traverse(o => { if (o.isMesh) ship++; });
    return { ship, outpost: g.landingView.group.children.length, probe: g.views.get('wayfarer').probe.children.length,
      enemyHullTriangles: g.combatView.hullGeometry.attributes.position.count / 3,
      enemyTrimTriangles: g.combatView.trimGeometry.attributes.position.count / 3,
      enemyCapacity: g.combatView.enemies.instanceMatrix.count, sparkCapacity: g.combatView.sparks.instanceMatrix.count };
  });
  check('細部を材質別に結合し機体・基地・探査機とFXの上限を維持', models.ship <= 20 && models.outpost === 7 && models.probe === 4 && models.enemyHullTriangles < 3000 && models.enemyTrimTriangles < 3000 && models.enemyCapacity === 6 && models.sparkCapacity === 120, models);
  check('小さな衛星でも基地の基礎が球面の地面まで届く', await page.evaluate(() => {
    const g = window.__lyrion, outpost = g.landingView;
    for (const radius of [48, 60, 160, 400]) {
      outpost.fitSurface(radius);
      const values = outpost.supports.instanceMatrix.array;
      for (let i = 0; i < outpost.supports.count; i++) {
        const offset = i * 16, x = values[offset + 12], y = values[offset + 13], z = values[offset + 14], height = values[offset + 5];
        const ground = Math.sqrt(radius * radius - x * x - z * z) - radius;
        if (y - height / 2 > ground || y + height / 2 < -.25) return false;
      }
    }
    outpost.fitSurface(160); return true;
  }));
  for (const id of ['cindra', 'thalassa', 'lumen', 'halcyon', 'aurelion', 'ember', 'glacia', 'mira', 'vesper', 'wayfarer', 'lyrion']) {
    await page.evaluate(id => {
      const g = window.__lyrion; g.debugTeleport(id, id === 'wayfarer' ? 55 : id === 'lyrion' ? 1200 : id === 'aurelion' ? 800 : 400); g.setTarget(id); g.tick(0);
      document.querySelector('.toasts').replaceChildren();
    }, id);
    await shot(page, `71-finish-${id}.png`);
  }
  check('全11天体を再生成したテクスチャで描画', await page.evaluate(() => window.__lyrion.rendererInfo.render.triangles > 0));
  await page.evaluate(() => {
    const g = window.__lyrion; g.debugTeleport('cindra', 80); g.toggleLanding();
    for (let i = 0; i < 300; i++) g.tick(.05);
  });
  await shot(page, '72-finish-landing.png');
  check('完成した基地へ着陸し機体・着陸脚・基地を同時描画', await page.evaluate(() => {
    const g = window.__lyrion; return g.landing.mode === 'landed' && g.landingView.group.visible && g.shipModel.gearAmount > .99 && g.rendererInfo.render.calls < 90;
  }));
  // A static review camera exposes details hidden by the ordinary flight camera.
  if (!process.env.BASE_URL) {
    await page.evaluate(() => {
      const g = window.__lyrion, c = g.chase.camera, p = g.landingView.group;
      c.position.copy(p.position).add(g.state.pos.clone().set(43, 29, 43).applyQuaternion(p.quaternion));
      c.up.set(0, 1, 0).applyQuaternion(p.quaternion);
      c.lookAt(g.state.pos.clone().set(10, 0, 0).applyQuaternion(p.quaternion).add(p.position));
      document.querySelector('.hud').style.display = 'none';
      g.renderer.render(g.scene, c);
    });
    await shot(page, '73-outpost-detail.png');
    await page.evaluate(() => { document.querySelector('.hud').style.display = ''; window.__lyrion.tick(0); });
  }
  const pool = await page.evaluate(() => {
    const g = window.__lyrion; g.toggleLanding(); g.applySettings({ ...g.settings, difficulty: 'hard' });
    g.combat.spawn(g.state, 'hard', g.worlds);
    for (const effect of g.combat.impacts) { effect.life = .5; effect.duration = 1; effect.radius = 24; effect.pos.copy(g.state.pos); }
    g.tick(0);
    return { enemies: g.combat.count, flashes: g.combatView.explosions.count, sparks: g.combatView.sparks.count };
  });
  check('最大同時爆発を固定プール内で処理', pool.enemies >= 5 && pool.flashes === 12 && pool.sparks === 120, pool);
  await page.evaluate(() => { const g = window.__lyrion; g.applySettings({ ...g.settings, difficulty: 'off' }); g.pause(); });
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByLabel('FPS 表示', { exact: true }).uncheck();
  await page.reload(); await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  check('FPSを設定で消す選択は再読込み後も保持', await page.evaluate(() => !window.__lyrion.settings.showFps && JSON.parse(localStorage.getItem('lyrion.settings.v1')).fpsDisplayVersion === 1));
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByLabel('FPS 表示', { exact: true }).check();
  await page.evaluate(() => { const g = window.__lyrion; g.input.requestLock = () => {}; g.input.locked = true; g.startNew(); g.stop(); g.tick(1 / 60); });
  check('設定からFPS表示を再度有効にできる', await page.locator('.hud-fps').isVisible());
  await page.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const touch = await mobile.newPage();
  touch.on('pageerror', e => errors.push(String(e))); touch.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await touch.addInitScript(() => localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'low', difficulty: 'off', audioEnabled: false })));
  await touch.goto(url); await touch.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  await touch.evaluate(() => { window.__lyrion.startNew(); });
  await sleep(600);
  await touch.evaluate(() => { const g = window.__lyrion; g.stop(); g.tick(0); });
  for (const [width, height] of [[390, 844], [800, 360]]) {
    await touch.setViewportSize({ width, height }); await sleep(600);
    const layout = await touch.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const fps = rect('.hud-fps'), others = ['.hud-status', '.hud-combat', '.tc-top'].map(rect);
      const overlaps = others.some(b => fps.left < b.right && fps.right > b.left && fps.top < b.bottom && fps.bottom > b.top);
      return { fps, others, overlaps, visible: getComputedStyle(document.querySelector('.hud-fps')).display !== 'none' };
    });
    check(`${width}x${height}でFPSが体力・戦闘HUD・タッチボタンと重ならない`, layout.visible && !layout.overlaps, layout);
    if (width === 390) check('縦画面の目標・速度・着陸案内を独立した位置に表示', await touch.evaluate(() => {
      const selectors = ['.hud-speed', '.hud-target', '.landing-label'];
      const boxes = selectors.map(s => document.querySelector(s).getBoundingClientRect());
      return boxes.every((a, i) => boxes.every((b, j) => i === j || a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top));
    }));
    await shot(touch, `74-fps-touch-${width}.png`);
  }
  await mobile.close();
  check('コンソール・ページエラーなし', errors.length === 0, errors);
} catch (error) { report.failure = String(error); console.error(error); }
finally {
  writeFileSync(fileURLToPath(new URL(`../../docs/validation/${process.env.BASE_URL ? 'production-polish' : 'polish'}.json`, import.meta.url)), JSON.stringify(report, null, 2));
  await browser.close(); server?.close();
}
if (report.failure) process.exitCode = 1;
