import { chromium, launchOptions, serve, sleep, SHOTS } from './harness.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const server=await serve(4192),browser=await chromium.launch(launchOptions()),results=[],errors=[];
const report={timestamp:new Date().toISOString(),results,errors};
const check=(name,ok,data)=>{results.push({name,ok,data});console.log(`${ok?'PASS':'FAIL'} ${name} ${data?JSON.stringify(data):''}`);if(!ok)throw new Error(name);};
const advance=(page,seconds)=>page.evaluate(seconds=>{for(let t=0;t<seconds;t+=.05)window.__lyrion.tick(.05);},seconds);
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>localStorage.setItem('lyrion.settings.v1',JSON.stringify({quality:'high',difficulty:'off',audioEnabled:false})));
 await page.goto(server.url);await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});await sleep(400);
 report.build=await page.evaluate(()=>window.__lyrion.buildInfo);
 const manifest=await (await page.request.get(server.url.split('?')[0]+'build-info.json')).json();
 const source=JSON.parse(readFileSync(new URL('../../public/build-info.json',import.meta.url),'utf8'));
 check('実際に配信したビルドと作業ソースの識別情報が一致',manifest.sourceHash===source.sourceHash&&manifest.sourceHash===report.build.sourceHash&&manifest.version==='0.7.1',report.build);
 check('画面にビルド版とソース識別子を表示',await page.locator('.build-label').filter({hasText:source.sourceHash.slice(0,12)}).isVisible());
 await page.screenshot({path:join(SHOTS,'90-critical-main.png')});
 await page.getByRole('button',{name:'MISSION CONTROL / 遠征',exact:true}).click();await sleep(400);
 const codes=['FIRST DEPARTURE','ORBITAL INSPECTION','REPAIR OPERATION','LUNAR EXPEDITION','LOST SIGNAL','UNKNOWN HORIZONS'];
 check('メインメニューのMISSION CONTROLに指定6ミッションを表示',await page.locator('.expedition-card').count()===6&&await page.locator('.operations-body').getByText('EXPEDITION CAMPAIGN / 6 MISSIONS',{exact:true}).isVisible());
 for(const code of codes)check(`ミッションの実データを表示 ${code}`,await page.locator('.expedition-card .label').filter({hasText:code}).count()===1);
 await page.getByRole('button',{name:'メニューへ戻る',exact:true}).click();
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;});
 await page.getByRole('button',{name:'新しい探査を開始',exact:true}).click();await page.evaluate(()=>{window.__lyrion.stop();window.__lyrion.tick(0);});await sleep(400);
 check('正式ID lyrion-primeが新規ゲームのホームワールド',await page.evaluate(()=>{const g=window.__lyrion,v=g.views.get('lyrion-prime');return v?.def.homeworld===true&&v.def.name==='LYRION PRIME'&&!g.views.has('prime')&&g.home.stationDistance<150&&g.home.docking.relativeSpeed<.01;}));
 check('開始時に母星と基地を実際に描画',await page.evaluate(()=>{const g=window.__lyrion;const fwd=g.state.pos.clone().set(0,0,-1).applyQuaternion(g.state.quat),toPlanet=g.positions['lyrion-prime'].clone().sub(g.state.pos).normalize();return fwd.dot(toPlanet)>.99&&g.expeditionView.station.visible&&g.views.get('lyrion-prime').group.visible&&g.rendererInfo.render.triangles>0;}));
 await page.screenshot({path:join(SHOTS,'91-critical-homeworld.png')});
 check('基地は通常ターゲットとして選択され名前・距離を表示',await page.evaluate(()=>{const s=window.__lyrion.snapshot();return s.stationTarget?.name==='ASTERION STATION'&&s.stationTarget.distance>0&&s.markers.some(m=>m.id==='asterion');})&&await page.locator('.t-name').textContent()==='ASTERION STATION');
 await page.keyboard.press('Tab');for(let i=0;i<20;i++){if(await page.evaluate(()=>window.__lyrion.snapshot().stationTarget!==null))break;await page.keyboard.press('Tab');}
 check('Tabの巡回で基地へ戻れる',await page.evaluate(()=>window.__lyrion.snapshot().stationTarget!==null));
 check('接岸前のUI操作ではミッションや報酬を開始できない',await page.evaluate(()=>{const g=window.__lyrion;const data=g.state.data;return !g.selectExpedition('first-departure')&&!g.reportExpedition()&&g.state.data===data&&g.state.homecoming.objectives.length===0;}));
 await page.keyboard.press('KeyT');await advance(page,12);
 check('基地へ実際に接岸してホーム機能を利用',await page.evaluate(()=>window.__lyrion.home.mode==='docked'));
 await page.screenshot({path:join(SHOTS,'92-critical-station.png')});
 await page.keyboard.press('KeyB');await sleep(400);
 const card=page.locator('.expedition-card').filter({has:page.getByRole('heading',{name:'最初の出発',exact:true})});
 await card.getByRole('button',{name:'受注して追跡',exact:true}).click();
 await sleep(400);
 check('MISSION CONTROL受注が実ゲーム状態を変更',await page.evaluate(()=>{const p=window.__lyrion.state.homecoming;return p.activeId==='first-departure'&&p.accepted.includes('first-departure')&&p.objectives.join(',')==='departure-brief';}));
 check('行動前に完了・報酬を自動付与しない',await page.getByRole('button',{name:'遠征成果を報告',exact:true}).isDisabled()&&await page.evaluate(()=>window.__lyrion.state.homecoming.completed['first-departure']===undefined&&window.__lyrion.state.data===0));
 await page.screenshot({path:join(SHOTS,'93-critical-mission-control.png')});
 await page.getByRole('button',{name:'操縦へ戻る',exact:true}).click();await page.evaluate(()=>{const g=window.__lyrion;g.stop();g.tick(0);});
 check('HUDの次目標マーカーは実ワールド座標の航行標を指す',await page.evaluate(()=>{const g=window.__lyrion,m=g.snapshot().markers.find(m=>m.id==='exp-nav');return m&&Math.abs(m.dist-g.state.pos.distanceTo(g.home.points.nav))<1e-5&&Number.isFinite(m.x)&&Number.isFinite(m.y);}));
 // Migration fixture deliberately contains real v2 fields and no new campaign object.
 const legacy=await page.evaluate(()=>{const g=window.__lyrion;g.debugTeleport('cindra',700);const raw={version:2,savedAt:1,time:g.state.time,playSeconds:321,pos:g.state.pos.toArray(),vel:g.state.vel.toArray(),quat:g.state.quat.toArray(),hull:83,shield:42,kills:7,landed:null,landings:['lumen'],energy:78,data:321,totalData:800,upgrades:{engine:1,boost:0,scanner:1,reactor:0},upgradesBought:2,detected:['cindra','thalassa'],scanned:{cindra:2,thalassa:3},missionIndex:4,assist:true,cameraMode:'third'};localStorage.setItem('lyrion.save.v1',JSON.stringify(raw));return raw;});
 // Install the migration fixture after the outgoing page's beforeunload autosave.
 await page.addInitScript(raw=>localStorage.setItem('lyrion.save.v1',JSON.stringify(raw)),legacy);
 await page.reload();await page.waitForFunction(()=>window.__lyrion?.phase==='menu',null,{timeout:120000});
 check('旧セーブは位置・向き・DATA・戦闘・既存ミッションを維持',await page.evaluate(raw=>{const s=window.__lyrion.state;return s.pos.toArray().every((v,i)=>v===raw.pos[i])&&s.quat.toArray().every((v,i)=>Math.abs(v-raw.quat[i])<1e-12)&&s.data===321&&s.kills===7&&s.missionIndex===4&&s.scanned.size===2&&s.upgrades.engine===1;},legacy));
 await page.getByRole('button',{name:'MISSION CONTROL / 遠征',exact:true}).click();
 check('旧セーブを読み込んでも新6ミッションの一覧が消えない',await page.locator('.expedition-card').count()===6);
 await page.evaluate(()=>{const g=window.__lyrion;g.input.requestLock=()=>{};g.input.locked=true;});
 await page.getByRole('button',{name:'基地へ誘導',exact:true}).click();await page.evaluate(()=>{window.__lyrion.stop();window.__lyrion.tick(0);});
 check('旧プレイヤーはテレポートせず基地への帰還誘導を選べる',await page.evaluate(raw=>{const g=window.__lyrion;return g.phase==='playing'&&g.snapshot().stationTarget?.distance>1000&&g.state.pos.distanceTo(g.state.pos.clone().fromArray(raw.pos))<5;},legacy));
 check('ブラウザ・コンソールエラーなし',errors.length===0,errors);
}catch(e){report.failure=String(e);console.error(e);}finally{writeFileSync(new URL('../../docs/validation/critical-homecoming.json',import.meta.url),JSON.stringify(report,null,2));await browser.close();server.close();}
if(report.failure)process.exitCode=1;
