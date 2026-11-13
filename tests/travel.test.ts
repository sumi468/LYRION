import {it,expect} from 'vitest';
import {Vector3} from 'three';
import {BODY_DEFS,BODY_BY_ID} from '../src/data/starSystem';
import {TravelPose,bodyArrival,baseArrival,stationArrival,travelBlockReason,TRAVEL_DESTINATIONS} from '../src/systems/travel';
import {createPositionTable,updateBodyPositions,updateBodyVelocities} from '../src/physics/orbits';
import {ReferenceFrame} from '../src/physics/frames';
import {updateSurfaceFrame} from '../src/physics/surfaceFrame';
import {PRIME_BASE_NORMAL,surfaceAltitude} from '../src/physics/terrain';
const valid={phase:'playing',onFoot:false,eva:false,landing:'flight',docking:'flight',enemies:0};
it('rejects unsafe modes and unknown destinations, while allowing paused map travel',()=>{
 expect(travelBlockReason('cindra',valid)).toBeNull();expect(travelBlockReason('cindra',{...valid,phase:'paused'})).toBeNull();
 for(const change of [{phase:'menu'},{eva:true},{onFoot:true},{landing:'approach'},{landing:'landed'},{docking:'docked'},{docking:'undocking'},{enemies:1}])expect(travelBlockReason('cindra',{...valid,...change})).toBeTypeOf('string');
 expect(travelBlockReason('constructor',valid)).toBeTypeOf('string');expect(new Set(TRAVEL_DESTINATIONS.map(d=>d.id)).size).toBe(TRAVEL_DESTINATIONS.length);
});
it('arrives outside real terrain and thermal danger at different orbital times without changing the clock',()=>{
 for(const time of [0,733,40000]){
  const p=createPositionTable(BODY_DEFS),v=createPositionTable(BODY_DEFS);updateBodyPositions(BODY_DEFS,time,p);updateBodyVelocities(BODY_DEFS,time,p,createPositionTable(BODY_DEFS),v);
  for(const d of BODY_DEFS){const out=new TravelPose();bodyArrival(d,time,p[d.id],v[d.id],out);
   expect([...out.position.toArray(),...out.velocity.toArray(),...out.rotation.toArray()].every(Number.isFinite),d.id).toBe(true);expect(out.rotation.length()).toBeCloseTo(1,9);
   if(d.radius>0){const altitude=surfaceAltitude(d,out.position,p[d.id],time);expect(altitude,d.id).toBeGreaterThan(d.kind==='star'?700:100);}
   else expect(Math.abs(out.position.y)).toBeGreaterThan(d.belt!.halfThickness);
  }
 }
});
it('arrives above the real pad and inherits a rotating station approach velocity',()=>{
 const body=BODY_BY_ID['lyrion-prime'],frame=new ReferenceFrame(),center=new Vector3(8e7,1e6,-4e7),velocity=new Vector3(8,4,3),out=new TravelPose();
 updateSurfaceFrame(body,PRIME_BASE_NORMAL,1234,center,velocity,frame);baseArrival(frame,out);
 expect(surfaceAltitude(body,out.position,center,1234)).toBeCloseTo(400,4);expect(frame.toLocal(out.position,new Vector3()).x).toBeCloseTo(0,5);
 frame.angularVelocity.set(.01,.02,.03);stationArrival(frame,out);const local=frame.toLocal(out.position,new Vector3());
 expect(local.distanceTo(new Vector3(0,12,110))).toBeLessThan(1e-6);expect(out.velocity.distanceTo(frame.pointVelocity(local,new Vector3()))).toBeLessThan(1e-6);
});
