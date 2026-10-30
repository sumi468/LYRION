import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createNewState } from '../src/core/state';
import { BODY_DEFS, CATALOG_IDS } from '../src/data/starSystem';
import { HOMEWORLD, STATION_ORBIT, STATION_SOLIDS, INVESTIGATIONS, HARDWARE_SOLIDS } from '../src/data/homeworld';
import { EXPEDITIONS } from '../src/data/expeditions';
import { MISSIONS } from '../src/data/missions';
import { ExpeditionFrames, ReferenceFrame } from '../src/physics/frames';
import { createPositionTable, updateBodyPositions, updateBodyVelocities } from '../src/physics/orbits';
import { clipCameraToBoxes, collideLocalBoxes } from '../src/physics/localCollision';
import { DockingSystem } from '../src/systems/docking';
import { emptyEvaInput, EvaSystem, EVA_MAX_SPEED } from '../src/systems/eva';
import { InvestigationSystem } from '../src/systems/investigations';
import { acceptExpedition, advanceExpedition, createHomecomingProgress, currentObjective, reportExpedition, sanitizeHomecoming, type ExpeditionContext } from '../src/systems/expeditions';
import { deserialize, serialize, SAVE_VERSION } from '../src/systems/save';
import { ExpeditionView } from '../src/render/ExpeditionView';
import { HomecomingSystem } from '../src/systems/homecoming';

function framesAt(time: number) {
  const positions=createPositionTable(BODY_DEFS),velocities=createPositionTable(BODY_DEFS),frames=new ExpeditionFrames();
  updateBodyPositions(BODY_DEFS,time,positions);updateBodyVelocities(BODY_DEFS,time,positions,createPositionTable(BODY_DEFS),velocities);
  frames.update(time,positions,velocities);return {frames,positions};
}
describe('Homecoming foundation',()=>{
  it('adds a distinct habitable homeworld without changing the 11-object catalog or eight missions',()=>{
    expect(HOMEWORLD.surface?.program).toBe('terran');expect(HOMEWORLD.atmosphere).toBeDefined();expect(HOMEWORLD.clouds).toBeDefined();
    expect(CATALOG_IDS).toHaveLength(11);expect(CATALOG_IDS).not.toContain('lyrion-prime');expect(MISSIONS).toHaveLength(8);
    const parent=BODY_DEFS.find(d=>d.id===HOMEWORLD.orbit!.parent);expect(parent).toBeDefined();
    expect(HOMEWORLD.orbit!.radius+STATION_ORBIT.radius+360).toBeLessThan(12500);
  });
  it('station orbit and attachment transforms are deterministic after long time jumps',()=>{
    for(const time of [0,1234,86400,1e7]){
      const a=framesAt(time),b=framesAt(time),local=new Vector3(13,-2,32),world=a.frames.asterion.toWorld(local,new Vector3());
      expect(a.frames.asterion.position.distanceTo(a.positions['lyrion-prime'])).toBeCloseTo(STATION_ORBIT.radius,7);
      expect(a.frames.asterion.position.equals(b.frames.asterion.position)).toBe(true);
      expect(a.frames.asterion.toLocal(world,new Vector3()).distanceTo(local)).toBeLessThan(1e-8);
    }
  });
  it('frame point velocity follows rotating attachments',()=>{
    const a=framesAt(200).frames.asterion,b=framesAt(200.01).frames.asterion,local=new Vector3(3,2,100);
    const measured=b.toWorld(local,new Vector3()).sub(a.toWorld(local,new Vector3())).multiplyScalar(100);
    expect(measured.distanceTo(a.pointVelocity(local,new Vector3()))).toBeLessThan(.002);
  });
  it('starts beside the station with inherited orbital velocity',()=>{
    const s=createNewState(),f=framesAt(0).frames.asterion;
    expect(f.toLocal(s.pos,new Vector3()).distanceTo(new Vector3(0,12,110))).toBeLessThan(1e-7);
    expect(s.vel.length()).toBeGreaterThan(1);expect(s.homecoming.activeId).toBe('first-departure');
  });
});
describe('Docking and EVA modes',()=>{
  it('rejects distant, fast and inboard approaches',()=>{
    const f=new ReferenceFrame(),s=createNewState(),d=new DockingSystem();s.vel.set(0,0,0);
    s.pos.set(0,0,300);expect(d.availability(s,f)).toContain('150');
    s.pos.set(0,0,80);s.vel.set(25,0,0);expect(d.availability(s,f)).toContain('18');
    s.vel.set(0,0,0);s.pos.set(0,0,20);expect(d.availability(s,f)).toContain('反対側');
  });
  it('aligns, follows orbital translation and safely undocks repeatedly',()=>{
    const s=createNewState(),f=framesAt(0).frames.asterion,d=new DockingSystem();
    for(let repeat=0;repeat<3;repeat++){
      d.request(s,f);for(let i=0;i<900&&d.mode!=='docked';i++)d.update(1/60,s,f);
      expect(d.mode).toBe('docked');const before=s.pos.clone();f.position.x+=7;d.update(0,s,f);expect(s.pos.x-before.x).toBeCloseTo(7);
      d.request(s,f);for(let i=0;i<200;i++)d.update(1/60,s,f);expect(d.mode).toBe('flight');
      expect(f.toLocal(s.pos,new Vector3()).z).toBeCloseTo(85);
    }
  });
  it('moves the visible astronaut independently, caps speed and returns to the parked ship',()=>{
    const s=createNewState(),f=framesAt(0).frames.asterion,e=new EvaSystem();e.launch(s,'asterion',f);
    const ship=s.pos.clone(),astronaut=e.position.clone(),input=emptyEvaInput();input.side=1;
    for(let i=0;i<240;i++)e.step(1/60,input,s,f);
    expect(s.pos.distanceTo(ship)).toBeLessThan(1e-8);expect(e.position.distanceTo(astronaut)).toBeGreaterThan(10);
    expect(e.localVelocity.length()).toBeLessThanOrEqual(EVA_MAX_SPEED+1e-8);expect(e.board()).toBe(false);
    e.returnToShip();for(let i=0;i<600&&e.active;i++)e.step(1/60,emptyEvaInput(),s,f);expect(e.active).toBe(false);
  });
  it('recovers an exhausted or out-of-bounds astronaut and preserves the ship',()=>{
    for(const reason of ['oxygen','range']){const s=createNewState(),f=framesAt(0).frames.asterion,e=new EvaSystem();e.launch(s,'asterion',f);
      if(reason==='oxygen')e.oxygen=.01;else{e.localPosition.x+=650;e.sync(s,f);}
      for(let i=0;i<240&&e.active;i++)e.step(1/60,emptyEvaInput(),s,f);
      expect(e.active).toBe(false);expect(Number.isFinite(s.pos.length())).toBe(true);
    }
  });
  it('resolves suit penetration and clips cameras at moving station hulls',()=>{
    const f=new ReferenceFrame();f.position.set(1000,50,200);f.rotation.setFromAxisAngle(new Vector3(0,1,0),.8);
    const p=f.toWorld(new Vector3(0,0,0),new Vector3()),v=new Vector3();expect(collideLocalBoxes(f,p,v,.4,STATION_SOLIDS)).toBe(true);
    expect(collideLocalBoxes(f,p,v,.4,STATION_SOLIDS)).toBe(false);
    const focus=f.toWorld(new Vector3(0,0,35),new Vector3()),camera=f.toWorld(new Vector3(0,0,-10),new Vector3());
    clipCameraToBoxes(focus,camera,f,STATION_SOLIDS);expect(f.toLocal(camera,new Vector3()).z).toBeGreaterThan(17);
  });
});
describe('Scientific expeditions',()=>{
  it('defines the six requested mission identities, rewards and concrete target positions',()=>{
    expect(EXPEDITIONS.map(m=>m.reward)).toEqual([30,40,50,70,90,120]);
    expect(EXPEDITIONS.map(m=>m.codeName)).toEqual(['FIRST DEPARTURE','ORBITAL INSPECTION','REPAIR OPERATION','LUNAR EXPEDITION','LOST SIGNAL','UNKNOWN HORIZONS']);
    const h=new HomecomingSystem(),{positions}=framesAt(200),velocities=createPositionTable(BODY_DEFS);
    h.update(200,positions,velocities);h.measure(createNewState());
    for(const m of EXPEDITIONS)for(const o of m.objectives)if(o.target){const p=h.points[o.target]??positions[o.target]??(o.target==='deep'?h.frames.deep.position:null);expect(p,o.id).toBeTruthy();expect(Number.isFinite(p!.length()),o.id).toBe(true);}
  });
  it('does not skip EVA or scientific actions just because the ship is docked',()=>{
    const p=createHomecomingProgress();p.completed['first-departure']=1;acceptExpedition(p,'orbital-inspection');
    const c:ExpeditionContext={eva:false,docking:'docked',stationDistance:0,relativeSpeed:0,distances:{'maintenance-panel':0,'station-sensor':0},scanned:new Map(),landings:new Set()};
    advanceExpedition(p,c,30);expect(currentObjective(p)?.kind).toBe('eva');expect(reportExpedition(p,c,31)).toBeNull();
    c.eva=true;advanceExpedition(p,c,30);expect(currentObjective(p)?.id).toBe('inspection-panel');expect(p.investigated).toEqual({});
  });
  it('requires EVA, validates range and dependencies, cancels interrupted work, and rewards once',()=>{
    const state=createHomecomingProgress(),system=new InvestigationSystem(),id='maintenance-panel';
    expect(system.request(id,state,1,false)).toContain('船外');expect(system.request(id,state,4,true)).toContain('3.6');
    expect(system.request('antenna-repair',state,1,true)).toContain('先に');
    system.request(id,state,1,true);system.step(1,state,{[id]:1},true,1);expect(system.progress).toBeGreaterThan(0);
    system.step(.1,state,{[id]:5},true,1);expect(system.activeId).toBeNull();
    system.request(id,state,1,true);expect(system.step(5,state,{[id]:1},true,2)?.reward).toBe(10);
    expect(system.step(5,state,{[id]:1},true,3)).toBeNull();expect(system.request(id,state,1,true)).toContain('調査済み');
  });
  it('completes all six ordered missions through their objective predicates and reports only at the station',()=>{
    const p=createHomecomingProgress(),c:ExpeditionContext={eva:false,docking:'docked',stationDistance:0,relativeSpeed:0,distances:{},scanned:new Map(),landings:new Set()};
    expect(acceptExpedition(p,EXPEDITIONS[1].id)).toBe(false);
    for(const mission of EXPEDITIONS){
      expect(acceptExpedition(p,mission.id)).toBe(true);let guard=0;
      while(currentObjective(p)?.kind!=='report'&&guard++<50){const obj=currentObjective(p)!;
        c.eva=['eva','visit','investigate'].includes(obj.kind);c.docking=['dock','brief'].includes(obj.kind)?'docked':'flight';c.stationDistance=obj.kind==='depart'?250:0;
        if(obj.target){(c.distances as Record<string,number>)[obj.target]=0;if(obj.kind==='investigate')p.investigated[obj.target]=10; if(obj.kind==='scan-body')(c.scanned as Map<string,number>).set(obj.target,10);if(obj.kind==='land')(c.landings as Set<string>).add(obj.target);}
        advanceExpedition(p,c,2.1);
      }
      expect(currentObjective(p)?.kind).toBe('report');c.eva=false;c.docking='flight';expect(reportExpedition(p,c,20)).toBeNull();
      c.docking='docked';expect(reportExpedition(p,c,20)?.reward).toBe(mission.reward);expect(reportExpedition(p,c,21)).toBeNull();
    }
    expect(Object.keys(p.completed)).toHaveLength(6);
  });
  it('sanitizes corrupt campaign state and ignores unknown IDs',()=>{
    const p=sanitizeHomecoming({activeId:'missing',tracked:true,objectives:['fake',null],investigated:{'maintenance-panel':NaN},completed:{'first-departure':Infinity}});
    expect(p.activeId).toBeNull();expect(p.objectives).toEqual([]);expect(Object.keys(p.completed)).toHaveLength(0);
    expect(sanitizeHomecoming({activeId:'constructor',accepted:['__proto__'],completed:{constructor:3}}).activeId).toBeNull();
  });
  it('keeps investigation and objective IDs unique and references valid objects',()=>{
    expect(new Set(INVESTIGATIONS.map(i=>i.id)).size).toBe(INVESTIGATIONS.length);
    const ids=EXPEDITIONS.flatMap(e=>e.objectives.map(o=>o.id));expect(new Set(ids).size).toBe(ids.length);
    for(const i of INVESTIGATIONS)if(i.requires)expect(INVESTIGATIONS.some(d=>d.id===i.requires)).toBe(true);
  });
  it('keeps every science point reachable from outside its solid hardware',()=>{
    const f=new ReferenceFrame(),v=new Vector3();
    for(const def of INVESTIGATIONS){const p=new Vector3().fromArray(def.position),before=p.clone();
      if(def.frame!=='asterion')collideLocalBoxes(f,p,v,.42,HARDWARE_SOLIDS[def.frame]);else collideLocalBoxes(f,p,v,.42,STATION_SOLIDS);
      expect(p.distanceTo(before),def.id).toBeLessThan(3.6);}
  });
});
describe('Save migration and resources',()=>{
  it('migrates the unreleased v3 prime alias without losing existing campaign or combat records',()=>{
    const s=createNewState();s.kills=7;s.homecoming.completed['first-departure']=10;s.homecoming.investigated['maintenance-panel']=12;
    const raw={...serialize(s),version:3,scanned:{prime:7,cindra:8},detected:['prime','cindra']};const restored=deserialize(raw)!;
    expect(restored.scanned.get('lyrion-prime')).toBe(7);expect(restored.scanned.has('prime')).toBe(false);expect(restored.detected.has('lyrion-prime')).toBe(true);expect(restored.kills).toBe(7);expect(restored.homecoming.completed['first-departure']).toBe(10);expect(restored.homecoming.investigated['maintenance-panel']).toBe(12);
  });
  it('reads v1/v2 without moving the spacecraft or losing scans, upgrades, missions or currency',()=>{
    const state=createNewState();state.pos.set(123,456,789);state.quat.copy(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.7));state.data=123;state.scanned.set('lumen',20);state.upgrades.engine=2;state.missionIndex=5;
    for(const version of [1,2]){const restored=deserialize({...serialize(state),version,homecoming:undefined})!;
      expect(restored.pos.equals(state.pos)).toBe(true);expect(restored.quat.angleTo(state.quat)).toBeLessThan(1e-7);expect(restored.data).toBe(123);expect(restored.upgrades.engine).toBe(2);expect(restored.missionIndex).toBe(5);expect(restored.scanned.has('lumen')).toBe(true);expect(restored.homecoming.tracked).toBe(false);}
  });
  it('saves v3 EVA research and safely recovers aboard, retaining optional homeworld scans',()=>{
    const s=createNewState();s.homecoming.wasEva=true;s.homecoming.investigated['maintenance-panel']=5;s.scanned.set('lyrion-prime',2);
    const data=serialize(s);expect(data.version).toBe(SAVE_VERSION);const restored=deserialize(data)!;
    expect(restored.homecoming.wasEva).toBe(false);expect(restored.homecoming.investigated['maintenance-panel']).toBe(5);expect(restored.scanned.has('lyrion-prime')).toBe(true);expect(restored.pos.equals(s.pos)).toBe(true);
    expect(deserialize({...data,pos:[NaN,0,1]})).toBeNull();expect(deserialize({...data,version:900})).toBeNull();
  });
  it('disposes every unique expedition geometry and material once',()=>{
    const view=new ExpeditionView(),geometries=new Set(),materials=new Set();let disposed=0;
    view.group.traverse((o)=>{if('geometry' in o){const m=o as import('three').Mesh;geometries.add(m.geometry);materials.add(m.material);}});
    for(const g of geometries as Set<import('three').BufferGeometry>)g.addEventListener('dispose',()=>disposed++);
    for(const m of materials as Set<import('three').Material>)m.addEventListener('dispose',()=>disposed++);
    view.dispose();expect(disposed).toBe(geometries.size+materials.size);expect(view.group.children).toHaveLength(0);
  });
});
