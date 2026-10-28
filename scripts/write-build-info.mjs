import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=[];
function collect(dir){for(const entry of readdirSync(join(root,dir),{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())collect(path);else if(entry.name!=='build-info.json')files.push(path);}}
for(const dir of ['src','public','scripts'])collect(dir);
files.push('package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html');files.sort();
const hash=createHash('sha256');for(const path of files){hash.update(path+'\0');hash.update(readFileSync(join(root,path)));}
let revision='unavailable',dirty=true;
for(const binary of ['git',join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe')]){
  const args=['-c',`safe.directory=${root.replaceAll('\\','/').replace(/\/$/,'')}`];
  const head=spawnSync(binary,[...args,'rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(head.status===0){revision=head.stdout.trim();const status=spawnSync(binary,[...args,'status','--porcelain'],{cwd:root,encoding:'utf8',windowsHide:true});dirty=status.status!==0||status.stdout.trim().length>0;break;}
}
const info={version:JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,sourceRevision:revision,sourceHash:hash.digest('hex'),uncommittedChanges:dirty,builtAt:new Date().toISOString()};
writeFileSync(join(root,'public/build-info.json'),JSON.stringify(info,null,2)+'\n');
console.log(`LYRION ${info.version} / source ${info.sourceHash.slice(0,12)} / ${dirty?'working tree':'committed'}`);
