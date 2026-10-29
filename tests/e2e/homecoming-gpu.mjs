import { chromium, launchOptions, serve, graphicsInfo, sleep, SHOTS } from './harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const server=await serve(4191),browser=await chromium.launch(launchOptions());
const errors=[],report={timestamp:new Date().toISOString(),browser:browser.version(),headless:launchOptions().headless,samples:[],errors};
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
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',difficulty:'off',audioEnabled:false})));
 await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 report.build=await page.evaluate(()=>window.__lyrion.buildInfo);
 report.graphics=await graphicsInfo(page);if(!report.graphics.hardware)throw new Error('Hardware GPU required');
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;g.startNew();});
 for(const scene of ['normal-exploration','homeworld-orbit','asterion','eva','combat','low-mobile','low-mobile-eva']) {
   if(scene==='normal-exploration')await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('aurelion',800);g.setTarget('aurelion');});
   if(scene==='homeworld-orbit')await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('lyrion-prime',650);g.setTarget('lyrion-prime');});
   if(['asterion','eva','low-mobile'].includes(scene))await page.evaluate(()=>{const g=window.__lyrion;g.home.eva.reset();g.home.docking.mode='flight';g.home.docking.restore(true,g.state,g.home.frames.asterion);g.home.measure(g.state);g.syncControlMode();g.chase.snap();g.setTarget(null);});
   if(scene==='eva')await page.evaluate(()=>{const g=window.__lyrion;g.handlePlayAction('eva');g.home.eva.localPosition.set(-10,7,25);g.home.eva.sync(g.state,g.home.frames.asterion);});
   if(scene==='combat')await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('cindra',1600);g.applySettings({...g.settings,difficulty:'hard'});g.combat.spawn(g.state,'hard',g.worlds);g.state.hull=100;g.state.shield=60;});
   if(scene==='low-mobile'){await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const g=window.__lyrion;g.applySettings({...g.settings,quality:'low',difficulty:'off'});await g.texturesReady;g.input.touchMode=true;g.ev.emit('mode',g.home.mode);document.body.classList.add('touch');});}
   if(scene==='low-mobile-eva')await page.evaluate(()=>{const g=window.__lyrion;g.handlePlayAction('eva');g.home.eva.localPosition.set(-10,7,25);g.home.eva.sync(g.state,g.home.frames.asterion);});
   await sleep(1500);
   const data={scene,quality:scene.startsWith('low-mobile')?'low':'high',...await sample(page,4000)};data.timing=await gpuTiming(page);report.samples.push(data);
   console.log(`${scene}: ${data.fps.toFixed(1)} rAF/s, p95 ${data.p95Ms.toFixed(1)}ms, GPU ${data.timing.gpu?.meanMs?.toFixed(3)}ms, calls ${data.drawCalls}`);
   await page.screenshot({path:join(SHOTS,`85-performance-${scene}.png`)});
 }
 const baseline=JSON.parse(readFileSync(new URL(`../../docs/validation/${process.env.GPU_BASELINE||'homecoming-baseline.json'}`,import.meta.url),'utf-8'));
 report.comparison={baselineTimestamp:baseline.timestamp,before:baseline.samples.find(s=>s.quality==='high'&&['aurelion','normal-exploration'].includes(s.scene)),after:report.samples[0],note:'Same high-quality Aurelion viewpoint. Headless rAF frequency is not display FPS.'};
 report.sceneComparison=report.samples.map(after=>({scene:after.scene,before:baseline.samples.find(s=>s.scene===after.scene&&s.quality===after.quality)??null,after}));
 if(errors.length)throw new Error(errors.join(' | '));
}catch(e){report.failure=String(e);console.error(e);}finally{writeFileSync(new URL(`../../docs/validation/${process.env.GPU_REPORT_PREFIX||'homecoming'}-${process.env.HEADED==='1'?'display':'gpu'}.json`,import.meta.url),JSON.stringify(report,null,2));await browser.close();server.close();}
if(report.failure)process.exitCode=1;
