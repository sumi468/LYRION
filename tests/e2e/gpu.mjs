import { chromium, launchOptions, serve, graphicsInfo, sleep, SHOTS } from './harness.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const server = await serve(4181);
const browser = await chromium.launch(launchOptions());
const errors = [];
const report = { timestamp: new Date().toISOString(), browser: browser.version(), platform: process.platform,
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, samples: [], errors };
const reportDir = fileURLToPath(new URL('../../docs/validation/', import.meta.url));
mkdirSync(reportDir, { recursive: true });
let failure;

async function sample(page, duration = 6000) {
  return page.evaluate(async (duration) => {
    const g = window.__lyrion;
    const intervals = [];
    const levels = new Set();
    const started = performance.now();
    let previous = started;
    await new Promise((resolve) => {
      const record = (now) => {
        intervals.push(now - previous);
        previous = now;
        levels.add(g.currentProfile.label);
        if (now - started >= duration) resolve();
        else requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    const total = intervals.reduce((sum, dt) => sum + dt, 0);
    intervals.sort((a, b) => a - b);
    const percentile = (p) => intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))];
    const canvas = document.getElementById('game-canvas');
    return { durationMs: total, frames: intervals.length, fps: intervals.length * 1000 / total,
      medianMs: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
      over33ms: intervals.filter((dt) => dt > 33.4).length, levels: [...levels],
      renderSize: [canvas.width, canvas.height], memory: { ...g.rendererInfo.memory },
      drawCalls: g.rendererInfo.render.calls, triangles: g.rendererInfo.render.triangles,
      phase: g.phase };
  }, duration);
}

// rAF の上限やリフレッシュレートとは別に、GPU完了待ちの時間も測る。
async function gpuTiming(page) {
  return page.evaluate(async () => {
    const g = window.__lyrion;
    const gl = document.getElementById('game-canvas').getContext('webgl2');
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const times = [];
    const queries = [];
    g.stop();
    try {
      for (let i = 0; i < 40; i++) {
        const query = ext ? gl.createQuery() : null;
        const start = performance.now();
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        g.tick(0);
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); queries.push(query); }
        gl.finish();
        times.push(performance.now() - start);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      const gpu = [];
      if (ext && !gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const query of queries) {
          if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        }
      }
      const stats = (values) => {
        if (!values.length) return null;
        values.sort((a,b)=>a-b);
        return { meanMs: values.reduce((a,b)=>a+b,0)/values.length, medianMs:values[Math.floor(values.length*.5)], p95Ms:values[Math.floor(values.length*.95)], samples:values.length };
      };
      return { synchronizedFrame:stats(times), gpu:stats(gpu) };
    } finally {
      for (const query of queries) gl.deleteQuery(query);
      g.start();
    }
  });
}

try {
  for (const quality of ['low', 'medium', 'high', 'auto']) {
    const ctx = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript((quality) => {
      localStorage.setItem('lyrion.settings.v1', JSON.stringify({ quality, showFps: true, audioEnabled: false }));
    }, quality);
    const started = Date.now();
    await page.goto(server.url);
    await page.waitForFunction(() => window.__lyrion?.phase === 'menu', null, { timeout: 120000 });
    const loadMs = Date.now() - started;
    const graphics = await graphicsInfo(page);
    report.graphics = graphics;
    if (graphics.hardware !== true) throw new Error(`Hardware GPU required: ${graphics.renderer}`);
    console.log(`GPU ${graphics.renderer} | ${quality} load ${loadMs}ms`);
    await page.evaluate(() => { const g = window.__lyrion; g.input.requestLock = () => {}; g.input.locked = true; g.startNew(); });
    for (const scene of ['departure', 'thalassa', 'aurelion']) {
      if (scene !== 'departure') await page.evaluate((id) => { const g=window.__lyrion; g.debugTeleport(id, id === 'thalassa' ? 400 : 800); g.setTarget(id); }, scene);
      await sleep(2000);
      const data = { quality, scene, loadMs, ...await sample(page) };
      data.timing = await gpuTiming(page);
      report.samples.push(data);
      console.log(`${quality} / ${scene}: ${data.fps.toFixed(1)} fps, p95 ${data.p95Ms.toFixed(1)} ms, GPU ${data.timing.gpu?.meanMs?.toFixed(2) ?? 'n/a'} ms, ${data.levels.join(',')}`);
      if (data.phase !== 'playing') throw new Error('Game paused during measurement');
      if (quality === 'high') await page.screenshot({ path: join(SHOTS, `gpu-${scene}-1080p.png`) });
    }
    await ctx.close();
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
} catch (error) {
  failure = String(error);
  report.failure = failure;
  console.error(error);
} finally {
  writeFileSync(join(reportDir, 'gpu-benchmark.json'), JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}
if (failure) process.exitCode = 1;
