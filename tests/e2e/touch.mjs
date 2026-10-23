// タッチ操作のE2E: モバイルUAでタッチUIが出て、スティック/ボタン/視点ドラッグが実際に船へ効くことを確認する。
// 実行: npm run build && node tests/e2e/touch.mjs
import { chromium, SHOTS, sleep, serve, launchOptions } from './harness.mjs';
import { sep } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const server = await serve(4180);
const GAME_URL = server.url;
const results = [];
const check = (name, ok, extra = '') => { results.push({name,ok,extra}); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(GAME_URL)).ok) break; } catch {} await sleep(250); }
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext({
    viewport: { width: 800, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality: 'low' })));
  const step = (n, dt = 0.05) => page.evaluate(([n, dt]) => { const g = window.__lyrion; for (let i = 0; i < n; i++) g.tick(dt); }, [n, dt]);
  // 合成 PointerEvent(タッチ)を送る
  const ptr = (sel, type, x, y, id = 7) => page.evaluate(([sel, type, x, y, id]) => {
    const el = sel === 'canvas' ? document.getElementById('game-canvas') : document.querySelector(sel);
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, [sel, type, x, y, id]);

  await page.goto(GAME_URL);
  await page.waitForFunction(() => window.__lyrion && window.__lyrion.phase === 'menu', null, { timeout: 90000 });
  check('メニュー中はタッチUIが隠れている', await page.evaluate(() => document.querySelector('.tc').hidden));
  await page.evaluate(() => { window.__lyrion.startNew(); window.__lyrion.stop(); });
  await step(3);
  check('プレイ中にタッチUIが表示される', await page.evaluate(() => !document.querySelector('.tc').hidden && document.body.classList.contains('touch')));
  check('Pointer Lock を使わず「クリックして視点操作」を出さない', await page.evaluate(() => window.__lyrion.snapshot().locked === true));
  await page.screenshot({ path: SHOTS + sep + '20-touch-hud.png', timeout: 120000 });

  // スティックを上へ倒す → 前進
  const c = await page.evaluate(() => { const r = document.querySelector('.tc-stick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const fwd0 = await page.evaluate(() => window.__lyrion.state.pos.clone());
  await ptr('.tc-stick', 'pointerdown', c.x, c.y - 45, 1);
  check('スティック上で virtual.thrust > 0', await page.evaluate(() => window.__lyrion.input.virtual.thrust > 0.5));
  await step(20);
  const moved = await page.evaluate((p) => window.__lyrion.state.pos.distanceTo({ x: p.x, y: p.y, z: p.z, isVector3: true }) , fwd0).catch(() => 0);
  const speed = await page.evaluate(() => window.__lyrion.state.vel.length());
  await ptr('.tc-stick', 'pointerup', c.x, c.y - 45, 1);
  check('スティックで船が加速する', speed > 1, `speed=${speed.toFixed(1)} moved=${Number(moved).toFixed(1)}`);
  check('スティックを離すと入力が0に戻る', await page.evaluate(() => window.__lyrion.input.virtual.thrust === 0 && window.__lyrion.input.virtual.turn === 0));

  // 視点ドラッグ
  const q0 = await page.evaluate(() => window.__lyrion.state.quat.toArray());
  await ptr('canvas', 'pointerdown', 400, 120, 5);
  await ptr('canvas', 'pointermove', 460, 120, 5);
  await ptr('canvas', 'pointermove', 520, 140, 5);
  await step(6);
  await ptr('canvas', 'pointerup', 520, 140, 5);
  const q1 = await page.evaluate(() => window.__lyrion.state.quat.toArray());
  check('キャンバスのドラッグで向きが変わる', q0.some((v, i) => Math.abs(v - q1[i]) > 1e-3));

  // ブースト長押し
  await ptr('.tc-btn.boost', 'pointerdown', 700, 300, 2);
  const b1 = await page.evaluate(() => window.__lyrion.input.virtual.boost);
  await ptr('.tc-btn.boost', 'pointerup', 700, 300, 2);
  const b2 = await page.evaluate(() => window.__lyrion.input.virtual.boost);
  check('BOOST を押している間だけ有効', b1 === true && b2 === false);

  await ptr('.tc-btn.fire','pointerdown',650,300,21);await step(2);
  check('FIREの長押しで実際にパルス弾を発射',await page.evaluate(()=>window.__lyrion.input.firing&&window.__lyrion.combat.bolts.some(b=>b.active&&!b.hostile)));
  await ptr('.tc-btn.fire','pointerup',650,300,21);
  check('FIREを離すと射撃入力が解除される',await page.evaluate(()=>!window.__lyrion.input.firing));
  await ptr('.tc-btn.evade','pointerdown',600,300,24);await ptr('.tc-btn.evade','pointerup',600,300,24);await step(2);
  check('EVADEで回避ロールを開始',await page.evaluate(()=>window.__lyrion.combat.dodgeTime>0&&window.__lyrion.combat.dodgeCooldown>5));
  const dodgeEnergy=await page.evaluate(()=>window.__lyrion.state.energy);
  await ptr('.tc-btn.evade','pointerdown',600,300,25);await ptr('.tc-btn.evade','pointerup',600,300,25);
  check('冷却中のEVADE連打でエネルギーを重ねて消費しない',await page.evaluate(energy=>window.__lyrion.state.energy===energy,dodgeEnergy));
  await page.evaluate(()=>window.__lyrion.debugTeleport('cindra',80));
  await ptr('.tc-btn.land','pointerdown',700,300,22);await ptr('.tc-btn.land','pointerup',700,300,22);
  check('LANDで自動着陸を開始',await page.evaluate(()=>window.__lyrion.landing.mode==='approach'));
  await ptr('.tc-btn.land','pointerdown',700,300,23);await ptr('.tc-btn.land','pointerup',700,300,23);
  check('再度LANDで降下を安全に中止',await page.evaluate(()=>window.__lyrion.landing.mode==='flight'));

  // スキャンボタン
  await page.evaluate(() => { const g = window.__lyrion; g.debugTeleport('cindra', 120); g.state.vel.set(0, 0, 0); g.setTarget('cindra'); });
  await step(3);
  await ptr('.tc-btn.scan', 'pointerdown', 650, 280, 3);
  await ptr('.tc-btn.scan', 'pointerup', 650, 280, 3);
  check('SCAN ボタンでスキャンが始まる', await page.evaluate(() => window.__lyrion.scan.id === 'cindra'));
  await step(130);
  check('タッチ操作だけでスキャンが完了する', await page.evaluate(() => window.__lyrion.state.scanned.has('cindra')));
  await page.screenshot({ path: SHOTS + sep + '21-touch-scanned.png', timeout: 120000 });

  // ブースト押下中に一時停止 → 入力が解除される
  await ptr('.tc-btn.boost', 'pointerdown', 700, 300, 4);
  await page.evaluate(() => document.querySelectorAll('.tc-top .tc-btn')[1].dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true })));
  await step(2);
  const st = await page.evaluate(() => ({ phase: window.__lyrion.phase, hidden: document.querySelector('.tc').hidden, boost: window.__lyrion.input.virtual.boost }));
  check('II ボタンで一時停止し、タッチUIが隠れて押下状態が解除される', st.phase === 'paused' && st.hidden && st.boost === false, JSON.stringify(st));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { const g=window.__lyrion; g.resume(); g.stop(); });
  await step(2);
  const layout = await page.evaluate(() => {
    const rect = (selector) => { const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    return {stick:rect('.tc-stick'),cluster:rect('.tc-right'),top:rect('.tc-top'),status:rect('.hud-status'),mission:rect('.hud-mission')};
  });
  const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height>b.y;
  check('縦画面390pxでも主要タッチ操作とHUDが重ならない', !overlaps(layout.stick,layout.cluster) && !overlaps(layout.top,layout.status) && !overlaps(layout.top,layout.mission), JSON.stringify(layout));
  // CDPから実際のブラウザ入力経路で2本の指を送る(合成DOMイベントとは別に検査)。
  const cdp=await ctx.newCDPSession(page);
  const points=await page.evaluate(()=>{
    const center=(selector)=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
    const stick=center('.tc-stick');stick.y-=36;
    return [{...stick,id:1},{...center('.tc-btn.boost'),id:2}];
  });
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
  check('2本指で前進とBOOSTを同時操作',await page.evaluate(()=>window.__lyrion.input.virtual.thrust>.5 && window.__lyrion.input.virtual.boost));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('指を離すと2本分の入力が解除される',await page.evaluate(()=>window.__lyrion.input.virtual.thrust===0 && !window.__lyrion.input.virtual.boost));
  await page.screenshot({path:SHOTS+sep+'22-touch-portrait.png'});
  await ptr('.tc-btn.boost','pointerdown',points[1].x,points[1].y,15);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  check('フォーカス喪失時にタッチ入力を解除',await page.evaluate(()=>!window.__lyrion.input.virtual.boost));
  check('コンソール/ページエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
} catch (e) {
  check('例外なし', false, String(e));
} finally {
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
const reportDir = fileURLToPath(new URL('../../docs/validation/', import.meta.url));
mkdirSync(reportDir, { recursive: true });
writeFileSync(reportDir + sep + 'touch.json', JSON.stringify({timestamp:new Date().toISOString(),results},null,2));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
