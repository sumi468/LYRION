import { chromium, launchOptions, serve, sleep, SHOTS } from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const server = await serve(4195), browser = await chromium.launch(launchOptions()), results = [], errors = [];
const report = { timestamp: new Date().toISOString(), results, errors };
const check = (name, ok, data) => { results.push({ name, ok, data }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' ' + JSON.stringify(data) : ''}`); if (!ok) throw new Error(name); };
const tick = (page, seconds) => page.evaluate(seconds => { for (let t = 0; t < seconds; t += .05) window.__lyrion.tick(.05); }, seconds);
const captureErrors = page => { page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); captureErrors(page);
  await page.addInitScript(() => localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'low', difficulty: 'off', audioEnabled: false })));
  await page.goto(server.url); await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  report.build = await page.evaluate(() => window.__lyrion.buildInfo);
  await page.getByRole('button', { name: 'MISSION CONTROL / 遠征', exact: true }).click(); await sleep(400);
  check('6任務の一覧と1つの詳細を分けて表示', await page.locator('.expedition-card').count() === 6 && await page.locator('.mission-detail .mission-story').count() === 1 && await page.locator('.mission-checklist').count() === 1);
  const first = page.locator('.expedition-card[data-mission="first-departure"]');
  check('接岸前の受注不可に理由を表示', await first.getByRole('button').isDisabled() && (await first.locator('.mission-access-reason').textContent()).includes('接岸'));
  await page.locator('.expedition-card[data-mission="orbital-inspection"] a').click();
  check('別任務の説明を読むだけで進行状態を変更しない', await page.locator('.mission-detail h2').textContent() === '軌道上の点検' && await page.evaluate(() => window.__lyrion.state.homecoming.accepted.length === 0 && window.__lyrion.state.homecoming.completed['orbital-inspection'] === undefined));
  check('ロックされた任務に前提となる任務を明示', (await page.locator('.mission-detail .mission-next').textContent()).includes('最初の出発'));
  await page.getByRole('button', { name: 'メニューへ戻る', exact: true }).click();
  await page.evaluate(() => { const g = window.__lyrion; g.input.requestLock = () => {}; g.input.locked = true; });
  await page.getByRole('button', { name: '新しい探査を開始', exact: true }).click();
  await page.evaluate(() => { const g = window.__lyrion; g.stop(); g.tick(0); }); await sleep(400);
  const fields = await page.evaluate(() => {
    const g = window.__lyrion, s = g.snapshot();
    return { mission: s.mission, code: document.querySelector('.mission-code').textContent, progress: document.querySelector('.mission-step').textContent, destination: document.querySelector('.mission-destination').textContent, distance: document.querySelector('.mission-distance').textContent, action: document.querySelector('.mission-action').textContent };
  });
  check('HUDが任務コード・目標内進捗・目的地・距離・操作を表示', fields.code.includes('MISSION 01') && fields.progress.includes('0 /') && fields.destination.includes('ASTERION') && fields.distance.includes('残り距離') && fields.action.length > 0, fields);
  await page.keyboard.press('KeyT'); await tick(page, 12);
  await page.keyboard.press('KeyH'); await tick(page, .1);
  const briefEva = await page.evaluate(() => ({ mode: window.__lyrion.home.mode, docked: window.__lyrion.state.homecoming.docked, action: document.querySelector('.mission-action').textContent, staticHintVisible: getComputedStyle(document.querySelector('.mission-hint')).display !== 'none' }));
  check('未受注で接岸中のEVAは矛盾する接岸案内を隠して機内帰還を案内', briefEva.mode === 'eva' && briefEva.docked && briefEva.action.includes('Yで機内へ帰還') && !briefEva.action.includes('Tで接岸') && !briefEva.staticHintVisible, briefEva);
  await page.screenshot({ path: join(SHOTS, '104-brief-eva-guidance.png') });
  await page.keyboard.press('KeyH'); await tick(page, .6); await page.keyboard.press('KeyB'); await sleep(400);
  await page.locator('.expedition-card[data-mission="first-departure"]').getByRole('button', { name: '受注して追跡', exact: true }).click(); await sleep(400);
  check('受注後の現在目標と達成済み項目が詳細へ反映', await page.locator('.mission-checklist li.done').count() >= 1 && (await page.locator('.mission-next').textContent()).includes('出航'));
  check('進行前の報告に次の必要行動を説明', await page.getByRole('button', { name: '遠征成果を報告', exact: true }).isDisabled() && (await page.locator('#report-reason').textContent()).includes('出航'));
  await page.screenshot({ path: join(SHOTS, '100-mission-control-focused.png') });
  await page.getByRole('button', { name: '操縦へ戻る', exact: true }).click(); await page.evaluate(() => { window.__lyrion.stop(); window.__lyrion.tick(0); }); await sleep(400);
  check('受注後のHUDは現在目標と達成数を更新', (await page.locator('.mission-obj').textContent()).includes('出航') && (await page.locator('.mission-step').textContent()).includes('1 /'));
  await page.screenshot({ path: join(SHOTS, '101-mission-hud-desktop.png') });
  await page.keyboard.press('KeyH'); await tick(page, .1); await page.keyboard.press('KeyB'); await sleep(400);
  check('EVA中の基地操作には接岸ではなく再搭乗を案内', await page.getByRole('button', { name: '基地へ誘導', exact: true }).isDisabled() && (await page.locator('#station-service-reason').textContent()).includes('再搭乗') && (await page.locator('#report-reason').textContent()).includes('再搭乗'));
  await page.getByRole('button', { name: '船外活動へ戻る', exact: true }).click(); await page.evaluate(() => { window.__lyrion.stop(); window.__lyrion.tick(0); });
  check('EVAのメニューから船外操作へ戻れる', await page.evaluate(() => window.__lyrion.home.mode === 'eva' && window.__lyrion.phase === 'playing'));
  await page.keyboard.press('KeyB'); await page.getByRole('button', { name: '従来の探査目標を表示', exact: true }).click();
  await page.getByRole('button', { name: '船外活動へ戻る', exact: true }).click(); await page.evaluate(() => { window.__lyrion.stop(); window.__lyrion.tick(0); });
  check('従来の探査目標では静的な操作ヒントを維持', await page.evaluate(() => !window.__lyrion.snapshot().mission?.action && document.querySelector('.mission-hint').textContent.length > 0 && getComputedStyle(document.querySelector('.mission-hint')).display !== 'none'));

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const touch = await mobile.newPage(); captureErrors(touch);
  await touch.addInitScript(() => localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'low', difficulty: 'off', audioEnabled: false })));
  await touch.goto(server.url); await touch.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
  await touch.getByRole('button', { name: '新しい探査を開始', exact: true }).click(); await touch.evaluate(() => { window.__lyrion.stop(); window.__lyrion.tick(0); });
  for (const [width, height] of [[390, 844], [800, 360]]) {
    await touch.setViewportSize({ width, height }); await sleep(400); await touch.evaluate(() => window.__lyrion.tick(0));
    await touch.evaluate(() => {
      // Hold only this visual fixture so slow concurrent GPU capture cannot dismiss it.
      const schedule = window.setTimeout;
      try {
        window.setTimeout = () => 0;
        window.__lyrion.ev.emit('toast', { kind: 'discover', title: '新しい天体を発見', text: '通知が現在の目標を隠さないことを確認' });
      } finally { window.setTimeout = schedule; }
      document.querySelector('.toast')?.getAnimations().forEach(animation => animation.finish());
    });
    const layout = await touch.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
      const mission = box('.hud-mission'), status = box('.hud-status'), context = box('.tc-context'), ops = box('.hud-operations'), toast = box('.toasts'), combat = box('.hud-combat'), fps = box('.hud-fps');
      const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
      return { mission, status, context, ops, toast, combat, fps, overlap: [status, context, ops, toast, combat, fps].some(b => overlaps(mission, b)), toastOverlap: [status, context, ops, combat, fps].some(b => overlaps(toast, b)), progressVisible: getComputedStyle(document.querySelector('.mission-step')).display !== 'none', action: document.querySelector('.mission-action').textContent, distance: document.querySelector('.mission-distance').textContent };
    });
    check(`${width}×${height}の目標HUD・通知が計器・タッチ操作と重ならない`, !layout.overlap && !layout.toastOverlap && layout.progressVisible && layout.action.length > 0 && layout.distance.length > 0, layout);
    await touch.screenshot({ path: join(SHOTS, `102-mission-hud-touch-${width}.png`) });
  }
  await touch.setViewportSize({ width: 390, height: 844 });
  await touch.getByRole('button', { name: '基地', exact: true }).click(); await sleep(400);
  check('モバイルでも6任務と1つの詳細を操作できる', await touch.locator('.expedition-card').count() === 6 && await touch.locator('.mission-detail').count() === 1);
  await touch.locator('.expedition-card[data-mission="orbital-inspection"] a').click(); await sleep(500);
  check('モバイルで選んだ任務の詳細へ移動する', await touch.locator('.mission-detail h2').textContent() === '軌道上の点検' && await touch.locator('.mission-detail h2').isVisible());
  await touch.screenshot({ path: join(SHOTS, '103-mission-control-touch.png') });
  await mobile.close(); check('ページ・コンソールエラーなし', errors.length === 0, errors);
} catch (e) { report.failure = String(e); console.error(e); }
finally { writeFileSync(new URL('../../docs/validation/mission-clarity.json', import.meta.url), JSON.stringify(report, null, 2)); await browser.close(); server.close(); }
if (report.failure) process.exitCode = 1;
