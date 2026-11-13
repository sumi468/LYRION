import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../dist/',import.meta.url),info=JSON.parse(readFileSync(new URL('build-info.json',root),'utf8'));
const paths=[];function visit(relative=''){for(const file of readdirSync(new URL(relative,root),{withFileTypes:true})){const path=relative+file.name;if(file.isDirectory())visit(path+'/');else if(!path.endsWith('.md')&&!path.endsWith('.txt'))paths.push('./'+path);}}visit();
const script=`const VERSION=${JSON.stringify('lyrion-'+info.sourceHash.slice(0,16))};
const FILES=${JSON.stringify(paths)};
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lyrion-')&&key!==VERSION).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==location.origin)return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.open(VERSION).then(cache=>cache.match('./index.html'))));return;}
 const base=new URL('./',self.registration.scope);const path='./'+url.pathname.slice(base.pathname.length);if(!FILES.includes(path))return;
 // These are immutable same-origin build assets. Vite may add Vary: Origin;
 // module/font requests must match the precache despite their Origin header.
 event.respondWith(caches.open(VERSION).then(async cache=>(await cache.match(new URL(path,base).href,{ignoreSearch:true,ignoreVary:true}))||fetch(request)));
});\n`;
writeFileSync(new URL('sw.js',root),script);console.log(`Offline shell: ${paths.length} local files, ${info.sourceHash.slice(0,12)}`);
