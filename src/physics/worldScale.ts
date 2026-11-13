import { Quaternion, Vector3 } from 'three';
import type { BodyDef, OrbitDef } from '../data/types';
import { createPositionTable, updateBodyPositions, updateBodyVelocities } from './orbits';

/** World/local distances are metres. Celestial data from saves1–4 used the old compact system. */
export const CELESTIAL_SCALE = 10_000;
/** Compact game world: 1 u stays 1 metre; only celestial content is smaller.
 * CELESTIAL_SCALE remains the historical v5 scale for lossless save migration. */
export const GAMEPLAY_SCALE = 10;
export const METRES_PER_WORLD_UNIT = 1;
export const SURFACE_EYE_HEIGHT = 1.72;
const axisY = new Vector3(0,1,0),axisZ = new Vector3(0,0,1),spinRotation = new Quaternion();
const velocityOffset=new Vector3(),angularVelocity=new Vector3();
export function bodyPointVelocity(body:BodyDef,world:Vector3,center:Vector3,orbital:Vector3,out:Vector3):Vector3{
  angularVelocity.copy(axisY).applyAxisAngle(axisZ,body.axialTilt).multiplyScalar(Math.PI*2/body.rotationPeriod);
  velocityOffset.copy(world).sub(center);return out.crossVectors(angularVelocity,velocityOffset).add(orbital);
}

export function metricOrbit(orbit: OrbitDef, scale = CELESTIAL_SCALE): OrbitDef {
  // Expanding distances with the old period would multiply orbital speeds and
  // acceleration by 10,000. Expand the clock too, preserving local control speeds.
  return {...orbit,radius:orbit.radius*scale,period:orbit.period*scale};
}

/** Scale physical celestial parameters together; spacecraft/probe/hardware dimensions remain local metres. */
export function metricBodies(legacy: readonly BodyDef[], scale = CELESTIAL_SCALE): BodyDef[] {
  return legacy.map(body=>{
    const radius=body.kind==='anomaly'?body.radius:body.radius*scale;
    return {...body,radius,rotationPeriod:body.kind==='anomaly'?body.rotationPeriod:body.rotationPeriod*scale,orbit:body.orbit?metricOrbit(body.orbit,scale):null,
      detectRange:body.detectRange*scale,
      ring:body.ring?{...body.ring,inner:body.ring.inner*scale,outer:body.ring.outer*scale}:undefined,
      belt:body.belt?{...body.belt,period:body.belt.period*scale,inner:body.belt.inner*scale,outer:body.belt.outer*scale,halfThickness:body.belt.halfThickness*scale}:undefined,
      atmosphere:body.atmosphere?{...body.atmosphere}:undefined,
      clouds:body.clouds?{...body.clouds,drift:body.clouds.drift/scale,height:Math.min(body.clouds.height,12_000/Math.max(radius,1))}:undefined};
  });
}

export function playableBodies(legacy:readonly BodyDef[]):BodyDef[]{
  return metricBodies(legacy,GAMEPLAY_SCALE).map(body=>({...body,
    radius:body.homeworld?5000:body.radius,
    clouds:body.clouds?{...body.clouds,height:Math.max(body.clouds.height,(body.homeworld?850:350)/(body.homeworld?5000:body.radius))}:undefined,
    atmosphere:body.atmosphere?{...body.atmosphere,height:Math.max(body.atmosphere.height,Math.min(.3,900/(body.homeworld?5000:body.radius)))}:undefined,
  }));
}

/** Match the same axial-tilt/spin order as BodyView. No integrated rotation state. */
export function bodyRotation(body: Pick<BodyDef,'axialTilt'|'rotationPeriod'>, time: number, out: Quaternion): Quaternion {
  return out.setFromAxisAngle(axisZ,body.axialTilt).multiply(spinRotation.setFromAxisAngle(axisY,time*Math.PI*2/body.rotationPeriod));
}

/** Exact spherical horizon distance, including very low camera altitudes. */
export function horizonDistance(radius: number, altitude: number): number {
  const height=Math.max(0,altitude);return Math.sqrt(height*(2*radius+height));
}

export function formatDistance(metres: number): string {
  if(!Number.isFinite(metres))return '—';
  const a=Math.abs(metres);
  return a<1_000?`${Math.round(metres)} m`:a<100_000?`${(metres/1_000).toFixed(1)} km`:`${Math.round(metres/1_000).toLocaleString('en-US')} km`;
}

export interface MigrationAnchor {
  id:string;oldPosition:Vector3;position:Vector3;oldVelocity:Vector3;velocity:Vector3;range:number;
  oldRotation?:Quaternion;rotation?:Quaternion;
  oldAngularVelocity?:Vector3;angularVelocity?:Vector3;
}
export interface MigratedPose {position:Vector3;velocity:Vector3;reference:string|null;orientationDelta:Quaternion|null}

/** Migration-time allocation is intentional; ordinary frame updates use preallocated frame data.
 * Preserve metre-scale clearances near surfaces/hardware and normalized orbital position farther away.
 */
export function migrateCompactPose(position:Vector3,velocity:Vector3,time:number,legacy:readonly BodyDef[],metric:readonly BodyDef[],anchors:readonly MigrationAnchor[]=[],scale=CELESTIAL_SCALE,nearSurfaceRange=450):MigratedPose {
  const oldPositions=createPositionTable(legacy),newPositions=createPositionTable(metric);
  const oldVelocities=createPositionTable(legacy),newVelocities=createPositionTable(metric);
  updateBodyPositions(legacy,time,oldPositions);updateBodyPositions(metric,time,newPositions);
  updateBodyVelocities(legacy,time,oldPositions,createPositionTable(legacy),oldVelocities);
  updateBodyVelocities(metric,time,newPositions,createPositionTable(metric),newVelocities);
  let nearest:BodyDef|null=null,surfaceDistance=Infinity;
  for(const body of legacy){if(body.radius<=0)continue;const d=position.distanceTo(oldPositions[body.id])-body.radius;if(d<surfaceDistance){nearest=body;surfaceDistance=d;}}
  const result={position:position.clone().multiplyScalar(scale),velocity:velocity.clone(),reference:null as string|null,orientationDelta:null as Quaternion|null};
  let anchor:MigrationAnchor|null=null,anchorDistance=Infinity;
  for(const candidate of anchors){const d=position.distanceTo(candidate.oldPosition);if(d<=candidate.range&&d<anchorDistance&&(d<surfaceDistance||candidate.id==='prime-base')){anchor=candidate;anchorDistance=d;}}
  if(anchor){
    result.position.copy(position).sub(anchor.oldPosition);result.velocity.copy(velocity).sub(anchor.oldVelocity);
    if(anchor.oldAngularVelocity)result.velocity.sub(new Vector3().crossVectors(anchor.oldAngularVelocity,result.position));
    if(anchor.oldRotation&&anchor.rotation){result.orientationDelta=anchor.rotation.clone().multiply(anchor.oldRotation.clone().invert());result.position.applyQuaternion(result.orientationDelta);result.velocity.applyQuaternion(result.orientationDelta);}
    if(anchor.angularVelocity)result.velocity.add(new Vector3().crossVectors(anchor.angularVelocity,result.position));
    result.position.add(anchor.position);result.velocity.add(anchor.velocity);result.reference=anchor.id;return result;
  }
  if(nearest&&(surfaceDistance<=nearSurfaceRange||nearest.kind==='anomaly')){
    const next=metric.find(body=>body.id===nearest!.id)!;
    const direction=position.clone().sub(oldPositions[nearest.id]);if(direction.lengthSq()<1e-10)direction.set(0,1,0);direction.normalize();
    result.orientationDelta=bodyRotation(next,time,new Quaternion()).multiply(bodyRotation(nearest,time,new Quaternion()).invert());direction.applyQuaternion(result.orientationDelta);
    result.position.copy(newPositions[nearest.id]).addScaledVector(direction,next.radius+Math.max(8,surfaceDistance));
    if(scale<1){
      const previousPointVelocity=bodyPointVelocity(nearest,position,oldPositions[nearest.id],oldVelocities[nearest.id],new Vector3());
      const currentPointVelocity=bodyPointVelocity(next,result.position,newPositions[nearest.id],newVelocities[nearest.id],new Vector3());
      result.velocity.copy(velocity).sub(previousPointVelocity).applyQuaternion(result.orientationDelta).add(currentPointVelocity);
    }else result.velocity.copy(velocity).sub(oldVelocities[nearest.id]).add(newVelocities[nearest.id]);result.reference=nearest.id;
  }else if(nearest){
    result.position.copy(position).sub(oldPositions[nearest.id]).multiplyScalar(scale).add(newPositions[nearest.id]);
    result.velocity.copy(velocity).sub(oldVelocities[nearest.id]).add(newVelocities[nearest.id]);
  }
  return result;
}
