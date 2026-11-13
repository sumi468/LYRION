import {Vector3} from 'three';
import type {BodyDef} from '../data/types';
import {segmentIntersectsSphere} from './segmentSphere';
import {surfaceAltitude,TERRAIN_MAX_HEIGHT} from './terrain';
const sample=new Vector3();
/** Broad spherical rejection, then bounded shared-height samples. Nominal
 * radii alone incorrectly block valid routes through low coastal valleys. */
export function segmentIntersectsTerrain(a:Vector3,b:Vector3,body:BodyDef,center:Vector3,time:number,padding=0):boolean{
 if(!segmentIntersectsSphere(a,b,center,body.radius+TERRAIN_MAX_HEIGHT+padding))return false;
 const steps=Math.max(2,Math.min(256,Math.ceil(a.distanceTo(b)/8)));
 for(let i=0;i<=steps;i++){sample.lerpVectors(a,b,i/steps);if(surfaceAltitude(body,sample,center,time)<padding-1e-6)return true;}
 return false;
}
