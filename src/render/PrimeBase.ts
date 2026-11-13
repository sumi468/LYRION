import {BoxGeometry,CylinderGeometry,Group,IcosahedronGeometry,Mesh,MeshStandardMaterial,TorusGeometry,Vector3,type BufferGeometry} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BASE_FACILITIES} from '../data/surfaceCampaign';
import type {ReferenceFrame} from '../physics/frames';
import {mergeParts} from './modelParts';
import {LandingView} from './LandingView';
import {SettlementView} from './SettlementView';
import {CORE_PATHS} from '../data/settlement';
const box=(w:number,h:number,d:number,x=0,y=0,z=0)=>new BoxGeometry(w,h,d).translate(x,y,z);
/** Permanent home base: shared material batches, physical exterior volumes,
 * separate accessible terminals and a real pad fixed to PRIME's surface frame. */
export class PrimeBase{
 readonly group=new Group();private readonly pad=new LandingView();private readonly town=new SettlementView();private readonly geos:BufferGeometry[]=[];
 private readonly mats=[
  new MeshStandardMaterial({color:0xc7cbc5,metalness:.12,roughness:.8}),new MeshStandardMaterial({color:0x35434d,metalness:.3,roughness:.6}),
  new MeshStandardMaterial({color:0x102e47,metalness:.5,roughness:.24}),new MeshStandardMaterial({color:0xd2ae67,metalness:.2,roughness:.6}),
  new MeshStandardMaterial({color:0x4cd5df,emissive:0x2ba2b0,emissiveIntensity:.8,roughness:.45}),new MeshStandardMaterial({color:0x657060,roughness:1}),
 ];
 constructor(){
  const parts:BufferGeometry[][]=this.mats.map(()=>[]);
  this.group.add(this.town.group);
  this.pad.fitSurface(3_100_000);this.pad.group.visible=true;this.group.add(this.pad.group);
  // Rounded pressure-shell volumes, external ribs, roof equipment and window bands.
  for(const [x,z,w,d,h] of [[-43,24,11,14,6.8],[-43,-26,11,17,5.6],[41,34,14,15,5.6]]){
   parts[0].push(new RoundedBoxGeometry(w,h,d,2,.65).translate(x,h/2+.15,z));
   parts[1].push(box(w+.3,.45,d+.3,x,.3,z),box(w+.1,.28,d+.1,x,h+.2,z));
   parts[2].push(box(.08,1,d-2,x+w/2+.06,h*.65,z));
   for(let a=-d/2+2;a<d/2;a+=3)parts[1].push(box(w+.15,.09,.12,x,h+.4,z+a));
   for(let i=-2;i<=2;i++)parts[0].push(box(.3,.3,1.6,x+i*1.6,h+.7,z));
   parts[3].push(box(.06,.18,d-1,x+w/2+.1,h*.43,z));
   parts[1].push(box(.12,2.5,1.8,x+w/2+.12,1.4,z+2));
  }
  // Hangar frame shelters a full-sized LX-07; clear central opening remains walkable.
  parts[1].push(box(1.1,12,24,-21,6,54),box(1.1,12,24,0,6,54),box(22,1,24,-10.5,12,54));
  parts[0].push(box(.3,10,24,-21.6,6,54),box(.3,10,24,.6,6,54),box(22,.3,24,-10.5,12.7,54));
  parts[3].push(box(22,.35,.3,-10.5,12.1,41.8));
  // External paths are gently raised slabs, with no invisible walls or interiors.
  for(const [x,z,w,d] of CORE_PATHS)parts[1].push(box(w,.14,d,x,.03,z));
  // Communications mast, steerable dish and radiator panels.
  parts[1].push(new CylinderGeometry(.5,.8,15,12).translate(37,7.5,-38));
  parts[0].push(new TorusGeometry(3,.18,6,28).rotateX(.75).translate(37,14,-38));
  parts[2].push(new CylinderGeometry(3,2.4,.4,28).rotateX(.75).translate(37,14,-38));
  parts[4].push(box(.25,.5,.25,37,16,-38));
  for(const x of [29,42]){parts[1].push(box(.5,3,.5,x,1.5,-56));parts[2].push(box(11,.15,14,x,3.1,-56));for(let z=-62;z<=-50;z+=2)parts[0].push(box(10.8,.025,.04,x,3.2,z));}
  // A recognisable natural outcrop and sample containers, separate from buildings.
  for(let i=0;i<7;i++){const rock=new IcosahedronGeometry(1.2+(i%3)*.5,1).scale(1,.65,1).rotateY(i*1.7).translate(22+Math.sin(i*2)*2.8,.6,-39+Math.cos(i*2)*2.5);parts[5].push(rock);}
  parts[0].push(box(1,.6,.7,25,.3,-37));parts[3].push(box(1.04,.13,.74,25,.62,-37));
  for(const facility of BASE_FACILITIES){const [x,,z]=facility.position;
   parts[1].push(box(.18,1,.18,x,.5,z),box(.7,.55,.35,x,1.15,z));parts[4].push(box(.56,.36,.03,x,1.2,z+.19));parts[3].push(new TorusGeometry(.9,.035,4,24).rotateX(Math.PI/2).translate(x,.1,z));
  }
  for(let i=0;i<parts.length;i++){if(!parts[i].length)continue;const geometry=mergeParts(parts[i]);this.geos.push(geometry);this.group.add(new Mesh(geometry,this.mats[i]));}
  this.group.name='PRIME / Home base';
 }
 update(frame:ReferenceFrame,origin:Vector3,viewer:Vector3,detailDistance=3500,time=0):void{
  this.group.visible=viewer.distanceToSquared(frame.position)<180000**2;
  if(this.group.visible){this.group.position.copy(frame.position).sub(origin);this.group.quaternion.copy(frame.rotation);this.town.update(viewer.distanceTo(frame.position),detailDistance,time);}
 }
 dispose(){this.pad.dispose();this.town.dispose();for(const geometry of this.geos)geometry.dispose();for(const material of this.mats)material.dispose();this.group.clear();}
}
