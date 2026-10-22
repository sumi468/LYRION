import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium, launchOptions } from './harness.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const server=spawn(process.execPath,['scripts/serve.mjs','--port=4183'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='';
server.stdout.on('data',(chunk)=>output+=chunk);
server.stderr.on('data',(chunk)=>output+=chunk);
const results=[];
const check=(name,ok)=>{results.push({name,ok});console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw new Error(name);};
let browser;
try{
  for(let i=0;i<50&&!output.includes('http://127.0.0.1:');i++)await new Promise((resolve)=>setTimeout(resolve,100));
  const base=output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  if(!base)throw new Error(output);
  const response=await fetch(base);
  const html=await response.text();
  check('配布用サーバーでHTMLを配信',response.status===200);
  const paths=[...html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)].map((match)=>match[1]);
  for(const path of paths)check(`配布アセット ${path}`,(await fetch(new URL(path,base))).status===200);
  check('不明なファイルは404',(await fetch(base+'/not-found')).status===404);
  check('書込みメソッドを受け付けない',(await fetch(base,{method:'POST'})).status===405);
  browser=await chromium.launch(launchOptions());
  const page=await browser.newPage({viewport:{width:800,height:450}});
  const errors=[];page.on('pageerror',(error)=>errors.push(String(error)));
  await page.goto(base);
  await page.getByRole('button',{name:'新しい探査を開始',exact:true}).waitFor({timeout:120000});
  check('デバッグなしの配布版が起動',await page.evaluate(()=>!window.__lyrion));
  check('ブラウザエラーなし',errors.length===0);
}catch(error){if(results.every((r)=>r.ok))results.push({name:String(error),ok:false});console.error(error);}
finally{
  if(browser)await browser.close();server.kill();
  const dir=fileURLToPath(new URL('../../docs/validation/',import.meta.url));mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'launcher.json'),JSON.stringify({timestamp:new Date().toISOString(),results},null,2));
}
if(results.some((r)=>!r.ok))process.exitCode=1;
