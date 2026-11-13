import {describe,it,expect} from 'vitest';
import {Vector3} from 'three';
import {HOMEWORLD} from '../src/data/homeworld';
import {metricBodies} from '../src/physics/worldScale';
import {terrainHeight,terrainNormal,BASE_ELEVATION,PRIME_BASE_NORMAL,surfaceAltitude} from '../src/physics/terrain';
import {cubeDirection,selectTerrainPatches,patchDirection} from '../src/physics/terrainLod';
const body=metricBodies([HOMEWORLD])[0];
describe('shared spherical terrain',()=>{
 it('keeps the landing apron flat at a deterministic physical height',()=>{
  const p=PRIME_BASE_NORMAL.clone().multiplyScalar(body.radius).add(new Vector3(12,0,0)).normalize();
  expect(terrainHeight(body,p)).toBe(BASE_ELEVATION);expect(terrainHeight(body,p)).toBe(terrainHeight(body,p.clone()));
 });
 it('has identical heights at adjacent cube-face boundaries',()=>{
  const a=cubeDirection(0,1,.25,new Vector3()),b=cubeDirection(5,-1,.25,new Vector3());
  expect(a.distanceTo(b)).toBeLessThan(1e-12);expect(terrainHeight(body,a)).toBe(terrainHeight(body,b));
  expect(terrainNormal(body,a,new Vector3()).distanceTo(terrainNormal(body,b,new Vector3()))).toBeLessThan(1e-12);
 });
 it('keeps a flat base edge radial without a skirt-dependent lighting crease',()=>{
  const normal=terrainNormal(body,PRIME_BASE_NORMAL,new Vector3());expect(normal.dot(PRIME_BASE_NORMAL)).toBeCloseTo(1,12);expect(normal.length()).toBeCloseTo(1,12);
  for(const direction of [new Vector3(0,1,0),new Vector3(1,.3,.5).normalize()]){
   const n=terrainNormal(body,direction,new Vector3());expect(n.toArray().every(Number.isFinite)).toBe(true);expect(n.length()).toBeCloseTo(1,10);expect(n.dot(direction)).toBeGreaterThan(.8);
  }
 });
 it('bounds LOD work and resolves metre-sized terrain near the viewer',()=>{
  const patches=selectTerrainPatches(PRIME_BASE_NORMAL.clone().multiplyScalar(body.radius+2),body.radius,240);
  expect(patches.length).toBeLessThanOrEqual(240);expect(new Set(patches.map(p=>p.key)).size).toBe(patches.length);
  expect(Math.max(...patches.map(p=>p.level))).toBeGreaterThanOrEqual(16);
  const area=patches.reduce((sum,p)=>sum+1/4**p.level,0);expect(area).toBeCloseTo(6,8);
  for(const p of patches)expect(patchDirection(p,.5,.5,new Vector3()).length()).toBeCloseTo(1,12);
 });
 it('uses the tilted body frame in physical altitude queries',()=>{
  const local=new Vector3(1,0,0).applyAxisAngle(new Vector3(0,0,1),-body.axialTilt);
  expect(surfaceAltitude(body,new Vector3(body.radius+30,0,0),new Vector3(),0)).toBeCloseTo(30-Math.max(0,terrainHeight(body,local)),5);
 });
});
