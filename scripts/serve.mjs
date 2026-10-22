import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
if (!existsSync(resolve(root, 'index.html'))) {
  console.error('ビルドがありません。npm install と npm run build を実行してください。');
  process.exit(1);
}
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
const server = createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let path;
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep) || !existsSync(path) || !statSync(path).isFile()) { res.writeHead(404).end(); return; }
  } catch { res.writeHead(400).end(); return; }
  res.writeHead(200, { 'Content-Type':types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(path).on('error',()=>res.destroy()).pipe(res);
});
let port = Number(process.argv.find((arg)=>arg.startsWith('--port='))?.slice(7) || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65525) throw new Error('Invalid port');
const firstPort=port;
server.on('error',(error)=>{
  if (error.code==='EADDRINUSE' && port<firstPort+10) server.listen(++port,'127.0.0.1');
  else { console.error(error.message); process.exitCode=1; }
});
server.on('listening',()=>{
  const url=`http://127.0.0.1:${port}`;
  console.log(`LYRION — Beyond the Stars\n${url}\n終了するには Ctrl+C を押してください。`);
  if (process.argv.includes('--open')) {
    const child = process.platform==='win32'
      ? spawn('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command',`Start-Process '${url}'`],{stdio:'ignore',windowsHide:true})
      : spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
    child.on('error',()=>console.log(`ブラウザで ${url} を開いてください。`));
  }
});
server.listen(port,'127.0.0.1');
process.on('SIGINT',()=>server.close(()=>process.exit()));
