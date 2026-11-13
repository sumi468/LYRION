import {BoxGeometry,CanvasTexture,CylinderGeometry,Group,IcosahedronGeometry,Mesh,MeshBasicMaterial,MeshStandardMaterial,PlaneGeometry,RepeatWrapping,SRGBColorSpace,TorusGeometry,type BufferGeometry,type Material} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {BUILDING_FLOOR_HEIGHT,CITY_STOPS,SETTLEMENT_BUILDINGS,SETTLEMENT_ROADS} from '../data/settlement';
import {mergeParts} from './modelParts';
import {CityLife} from './CityLife';

const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>new BoxGeometry(w,h,d).translate(x,y,z);
function canvasTexture(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void):CanvasTexture{
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d')!);
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}
/** A planned coastal town, built once into shared material batches. No lights
 * per window, no network assets and no per-building objects in the frame loop. */
export class SettlementView{
 readonly group=new Group();readonly detail=new Group();
 private readonly life=new CityLife();
 private geos:BufferGeometry[]=[];private mats:Material[]=[];private textures:CanvasTexture[]=[];
 constructor(){
  const grain=canvasTexture(128,128,c=>{let seed=23;for(let y=0;y<128;y++)for(let x=0;x<128;x++){seed=(Math.imul(seed,1664525)+1013904223)|0;const v=185+((seed>>>24)%38);c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(x,y,1,1);}});grain.wrapS=grain.wrapT=RepeatWrapping;grain.repeat.set(2,2);
  const facade=canvasTexture(256,256,c=>{
   c.fillStyle='#667c88';c.fillRect(0,0,256,256);
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const occupied=(x*13+y*7)%11<4;c.fillStyle=occupied?'#bbbeb0':'#6d8797';c.fillRect(x*32+3,y*32+4,26,23);
    c.fillStyle=occupied?'#c8b995':'#7896a1';c.fillRect(x*32+4,y*32+5,24,2);
    c.fillStyle='#273c48';c.fillRect(x*32+15,y*32+4,2,24);c.fillRect(x*32+3,y*32+24,26,3);
   }
  });facade.wrapS=facade.wrapT=RepeatWrapping;
  const labels=['01','PORT LYRA','MISSION CONTROL','SURFACE LAB','SERVICE / 01','HABITAT DISTRICT','RESEARCH CAMPUS','CARGO / ENERGY','01 / SPACEPORT','02 / CIVIC CENTRE','03 / CENTRAL PARK','04 / EAST HABITAT','05 / SCIENCE CAMPUS','06 / LOGISTICS PORT'],atlasRows=Math.ceil(labels.length/2);
  const atlas=canvasTexture(1024,atlasRows*128,c=>{for(let i=0;i<labels.length;i++){const x=(i%2)*512,y=Math.floor(i/2)*128;c.fillStyle='#152b36';c.fillRect(x,y,512,128);c.fillStyle=i===0?'#ffe2a1':'#d7e7e7';c.font=i===0?'bold 108px sans-serif':'bold 29px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(labels[i],x+256,y+60);c.fillStyle='#69c4c7';c.fillRect(x+30,y+108,452,3);}});
  this.textures.push(grain,facade,atlas);
  const concrete=new MeshStandardMaterial({color:0xd1d3c8,map:grain,roughness:.9,metalness:.02});
  const structure=new MeshStandardMaterial({color:0x51616a,roughness:.65,metalness:.22});
  const glass=new MeshStandardMaterial({color:0xc0d5db,map:facade,emissiveMap:facade,emissive:0x4b6468,emissiveIntensity:.22,roughness:.34,metalness:.18});
  const dark=new MeshStandardMaterial({color:0x273b4a,roughness:.55,metalness:.3});
  const road=new MeshStandardMaterial({color:0x3c4447,map:grain,roughness:.98});
  const paint=new MeshStandardMaterial({color:0xe1d5b6,roughness:.88});
  const light=new MeshBasicMaterial({color:0xb2e6e0,toneMapped:false});
  const accent=new MeshStandardMaterial({color:0x9d6e48,roughness:.85});
  const leaf=new MeshStandardMaterial({color:0x63745b,roughness:1});
  const sign=new MeshStandardMaterial({map:atlas,emissiveMap:atlas,emissive:0xffffff,emissiveIntensity:.25,roughness:.8});
  this.mats.push(concrete,structure,glass,dark,road,paint,light,accent,leaf,sign);
  const parts:BufferGeometry[][]=this.mats.map(()=>[]),details:BufferGeometry[][]=this.mats.map(()=>[]);
  const label=(i:number,w:number,h:number,x:number,y:number,z:number,ground=false)=>{
   const geo=new PlaneGeometry(w,h),uv=geo.getAttribute('uv');
   for(let j=0;j<uv.count;j++)uv.setXY(j,(uv.getX(j)+(i%2))*.5,(uv.getY(j)+atlasRows-1-Math.floor(i/2))/atlasRows);
   if(ground)geo.rotateX(-Math.PI/2);geo.translate(x,y,z);details[9].push(geo);
  };
  // Spaceport apron, a distinct protected pad and marked approach lane. The
  // passenger side stays clear for the existing hatch and research route.
  parts[4].push(box(94,.12,94,0,-.18,0));
  parts[1].push(box(97,.12,97,0,-.3,0));
  label(0,6,5,0,.42,8,true);label(1,18,4,-3,.01,-29,true);
  for(let z=24;z<=240;z+=16){
   for(const x of [-8,8]){details[1].push(box(.4,.5,.4,x,.2,z));details[6].push(box(.25,.07,.35,x,.51,z));}
   if(z<70)details[5].push(box(.16,.02,4,0,.01,z));
  }
  for(const [x,z,i] of [[-35,22,2],[-34,-24,3],[28,8,4],[105,-102,5],[-164,-102,6],[-286,-102,7]]){
   details[1].push(box(.12,2.8,.12,x-2,1.4,z),box(.12,2.8,.12,x+2,1.4,z),box(5,1.1,.16,x,2.5,z));label(i,4.8,1,x,2.5,z+.09);
  }
  // Roads, service lanes, expansion joints and pedestrian curbs follow a
  // deliberately graded plateau shared by the collision/terrain field.
  for(const r of SETTLEMENT_ROADS){
   parts[0].push(box(r.w+4,.12,r.d+4,r.x,-.2,r.z));parts[4].push(box(r.w,.06,r.d,r.x,-.09,r.z));
   const vertical=r.d>r.w,length=vertical?r.d:r.w;
   for(let k=-length/2+4;k<length/2;k+=9)details[5].push(vertical?box(.12,.015,3,r.x,-.052,r.z+k):box(3,.015,.12,r.x+k,-.052,r.z));
   for(const side of [-1,1]){
    details[0].push(vertical?box(.2,.15,r.d,r.x+side*(r.w/2+.3),-.07,r.z):box(r.w,.15,.2,r.x,-.07,r.z+side*(r.d/2+.3)));
   }
  }
  // Marked pedestrian access connects the flight apron and the civic boulevard.
  parts[0].push(box(4,.1,55,-12,-.12,-74));
  for(let z=-94;z<=-86;z+=2)details[5].push(box(7,.015,.7,0,-.049,z));
  for(const b of SETTLEMENT_BUILDINGS){
   const h=b.floors*BUILDING_FLOOR_HEIGHT,{x,z,w,d}=b;
   parts[0].push(new RoundedBoxGeometry(w,h,d,1,.35).translate(x,h/2,z));
   parts[1].push(box(w+1.2,.65,d+1.2,x,.1,z),box(w+.5,.5,d+.5,x,h+.15,z));
   // Four textured facades retain metre-sized windows after geometry merging.
   for(const side of [-1,1]){
    const front=new PlaneGeometry(w-2,h-1.4),fu=front.getAttribute('uv');for(let j=0;j<fu.count;j++)fu.setXY(j,fu.getX(j)*(w-2)/24,fu.getY(j)*(h-1.4)/28.8);
    front.rotateY(side===1?0:Math.PI).translate(x,h/2+.3,z+side*(d/2+.025));parts[2].push(front);
    const edge=new PlaneGeometry(d-2,h-1.4),eu=edge.getAttribute('uv');for(let j=0;j<eu.count;j++)eu.setXY(j,eu.getX(j)*(d-2)/24,eu.getY(j)*(h-1.4)/28.8);
    edge.rotateY(side*Math.PI/2).translate(x+side*(w/2+.025),h/2+.3,z);parts[2].push(edge);
   }
   for(let floor=1;floor<b.floors;floor++)parts[0].push(box(w+.18,.24,d+.18,x,floor*BUILDING_FLOOR_HEIGHT,z));
   // Opaque stair/service cores interrupt the glass elevations. Housing has
   // sheltered balconies; civic blocks have deep entrance frames and crowns.
   const coreWidth=b.district==='research'?w*.24:w*.13;
   for(const side of [-1,1])parts[0].push(box(coreWidth,h,.22,x-w*.34,h/2,z+side*(d/2+.18)));
   if(b.district==='habitat')for(let floor=1;floor<b.floors;floor+=2){
    const y=floor*BUILDING_FLOOR_HEIGHT;details[0].push(box(w*.58,.22,1.4,x+w*.06,y,z+d/2+.45));
    details[1].push(box(w*.58,.08,.08,x+w*.06,y+1,z+d/2+1.1));
    for(let n=-2;n<=2;n++)details[1].push(box(.06,.9,.06,x+w*.06+n*w*.13,y+.5,z+d/2+1.1));
   }
   if(b.district==='civic')parts[0].push(box(w*.6,1.3,d*.6,x,h+.8,z));
   if(b.floors>22){
    parts[0].push(box(w*.72,4,d*.72,x,h+2,z),box(w*.45,3,d*.45,x,h+5.5,z));
    parts[1].push(box(w*.75,.35,d*.75,x,h+4.1,z));
    parts[6].push(box(w*.45,.15,.2,x,h+7.1,z+d*.225));
   }
   for(let col=-w/2+1;col<w/2;col+=7)for(const side of [-1,1])parts[1].push(box(.22,h,.15,x+col,h/2,z+side*(d/2+.13)));
   // Real roof services, parapets, entrances and accessible forecourts.
   details[0].push(box(w+.4,.8,.25,x,h+.6,z-d/2),box(w+.4,.8,.25,x,h+.6,z+d/2),box(.25,.8,d,x-w/2,h+.6,z),box(.25,.8,d,x+w/2,h+.6,z));
   details[1].push(box(w*.3,1.2,d*.22,x-w*.18,h+.95,z));
   for(let j=0;j<4;j++)details[3].push(box(w*.27,.07,.12,x-w*.18,h+1.58,z-d*.08+j*.6));
   details[1].push(box(5,3.2,.18,x,1.6,z+d/2+.2),box(8,.25,3,x,3.4,z+d/2+1));
   details[2].push(box(3,2.7,.04,x,1.5,z+d/2+.31));details[6].push(box(4,.08,.1,x,3.05,z+d/2+.35));
   details[7].push(box(w-1,.35,.12,x,h-.5,z+d/2+.2));
   // Paved entrance courts, shaded benches and a planted perimeter give the
   // buildings a human scale without requiring interiors or extra lights.
   parts[0].push(box(9,.08,8,x,-.18,z+d/2+4));
   details[7].push(box(4,.15,.6,x+6,.5,z+d/2+4));details[1].push(box(.18,.5,.6,x+4.5,.2,z+d/2+4),box(.18,.5,.6,x+7.5,.2,z+d/2+4));
   if(b.district==='research'){
    details[3].push(box(w*.55,.08,d*.45,x,h+.7,z));for(let n=-2;n<=2;n++)details[0].push(box(.04,.02,d*.44,x+n*w*.09,h+.75,z));
   }
  }
  // Central park, open market arcades and sheltered district shuttle stops.
  // These squares are reserved in the shared building layout, not painted over
  // roads or collision boxes. A continuous boulevard leads back to PAD 01.
  for(const side of [-1,1]){
   parts[8].push(box(150,.08,150,side*100,-.27,-1000));
   parts[0].push(box(160,.08,7,side*100,-.14,-1000),box(7,.08,160,side*100,-.14,-1000));
   for(const z of [-930,-1070])for(const x of [side*50,side*100,side*150]){
    parts[7].push(new CylinderGeometry(.35,.55,7,7).translate(x,3.5,z));
    parts[8].push(new IcosahedronGeometry(4,1).scale(1,1.3,1).translate(x,8,z));
   }
   for(const x of [side*55,side*145])for(const z of [-965,-1035]){
    details[7].push(box(10,.35,1.2,x,.6,z));details[1].push(box(.2,.6,1.2,x-4.5,.2,z),box(.2,.6,1.2,x+4.5,.2,z));
   }
  }
  parts[1].push(new TorusGeometry(7,.45,6,36).rotateY(.5).translate(-100,9,-1000));
  parts[6].push(new TorusGeometry(4,.15,4,28).rotateX(.5).translate(-100,9,-1000));
  for(let i=0;i<CITY_STOPS.length;i++){
   const {x,z}=CITY_STOPS[i];parts[4].push(box(14,.08,14,x,-.16,z));
   parts[1].push(box(13,.3,5,x,3.5,z-3),box(.2,3.5,.2,x-6,1.75,z-5),box(.2,3.5,.2,x+6,1.75,z-5));
   parts[2].push(box(11,2.5,.1,x,1.6,z-5));parts[6].push(box(12,.08,.1,x,3.25,z-.5));
   label(i+8,10,1.5,x,2.4,z-4.9);details[7].push(box(8,.18,.7,x,.55,z-4));
  }
  // Boulevard lighting and tree-lined avenues use shared material batches.
  for(const x of [-814,-614,-214,214,614,814])for(let z=-550;z>=-1450;z-=100){
   parts[1].push(box(.18,9,.18,x,4.5,z),box(3,.2,.35,x+1,9,z));
   parts[6].push(box(2.5,.06,.3,x+1.1,8.86,z));
   details[7].push(new CylinderGeometry(.25,.4,6,6).translate(x+13,3,z));
   details[8].push(new IcosahedronGeometry(3,1).scale(1,1.2,1).translate(x+13,7,z));
  }
  // Utility yard: storage, water tanks, roofed cargo racks, bus shelters and
  // parked electric service rovers make the town's logistics readable.
  for(let i=0;i<6;i++){
   const x=-322+(i%2)*10,z=-158+Math.floor(i/2)*8;details[i%2?7:0].push(box(8,2.5,6,x,1.25,z));
   for(let k=-3;k<=3;k++)details[1].push(box(.08,2.3,6.04,x+k,1.25,z));
  }
  for(const z of [-324,-341]){
   parts[0].push(new CylinderGeometry(7,7,8,16).translate(-317,4,z));parts[1].push(new TorusGeometry(7,.12,4,24).rotateX(Math.PI/2).translate(-317,7.6,z));
  }
  for(let row=0;row<3;row++)for(let col=0;col<7;col++){
   const x=-315+col*9,z=-400-row*16;parts[1].push(box(.18,2,.18,x,1,z));parts[3].push(box(8,.12,12,x,2.3,z));
   for(let n=-3;n<=3;n++)details[0].push(box(.035,.025,11.8,x+n,2.38,z));
  }
  for(const [x,z] of [[-73,-104],[81,-281],[177,-104]]){
   details[1].push(box(9,.3,3,x,3.1,z),box(.15,3,.15,x-4,1.5,z),box(.15,3,.15,x+4,1.5,z));details[2].push(box(8,2.5,.1,x,1.6,z-1.3));
   details[0].push(box(6,.2,.7,x,.55,z));
  }
  for(const [x,z] of [[-58,53],[-290,-117],[63,-263]]){
   details[1].push(box(2.8,.7,5.4,x,.9,z));details[0].push(new RoundedBoxGeometry(2.6,1.5,2.7,1,.2).translate(x,1.8,z-.7));details[2].push(box(2.35,.7,.04,x,2,z-2.08));
   for(const sx of [-1.5,1.5])for(const sz of [-1.7,1.7])details[3].push(new CylinderGeometry(.65,.65,.35,12).rotateZ(Math.PI/2).translate(x+sx,.65,z+sz));
  }
  // Streetscape: regularly spaced luminaires and planted rain gardens. The
  // luminous surfaces share one unlit batch, with no per-lamp shadow maps.
  for(const x of [-10,106,-106,274])for(let z=-120;z>=-440;z-=48){
   details[1].push(box(.12,7,.12,x,3.5,z),box(2,.12,.3,x+.8,7,z));details[6].push(box(1.4,.04,.25,x+.9,6.91,z));
  }
  for(const x of [113,245,-116])for(const z of [-116,-205,-295,-391,-446]){
   details[0].push(box(4,.4,6,x,.05,z));details[8].push(new RoundedBoxGeometry(3.5,1.3,5.5,1,.6).translate(x,.7,z));
   details[7].push(new CylinderGeometry(.22,.3,5,6).translate(x,2.5,z));
   details[8].push(new IcosahedronGeometry(2.4,1).scale(1,1.15,.9).translate(x,5.7,z),new IcosahedronGeometry(1.7,1).scale(1,1.2,1).translate(x+.8,7.2,z),new IcosahedronGeometry(1.8,1).translate(x-1.1,5.9,z));
  }
  for(const geo of parts[4]){const p=geo.getAttribute('position'),uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)/8,p.getZ(i)/8);}
  for(let i=0;i<parts.length;i++)for(const [batch,parent] of [[parts[i],this.group],[details[i],this.detail]] as const){if(!batch.length)continue;const geometry=mergeParts(batch);this.geos.push(geometry);parent.add(new Mesh(geometry,this.mats[i]));}
  this.group.add(this.detail,this.life.group);this.group.name='PORT LYRA / civic, habitat, research and utility districts';
 }
 update(distance:number,detailDistance:number,time:number){this.group.visible=distance<60000;this.detail.visible=distance<detailDistance;this.life.update(time,distance<detailDistance);}
 dispose(){this.life.dispose();for(const g of this.geos)g.dispose();for(const m of this.mats)m.dispose();for(const t of this.textures)t.dispose();this.group.clear();}
}
