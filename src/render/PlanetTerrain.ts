import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Quaternion,Vector3,Texture,RepeatWrapping,CanvasTexture,Vector2} from 'three';
import type {BodyDef} from '../data/types';
import type {QualityProfile} from './quality';
import {terrainQuality} from './quality';
import {bodyRotation} from '../physics/worldScale';
import {terrainHeight,terrainColor,terrainNormal} from '../physics/terrain';
import {patchDirection,selectTerrainPatches,type TerrainPatch} from '../physics/terrainLod';

interface Chunk{patch:TerrainPatch;anchor:Vector3;mesh:Mesh;water:Mesh|null;last:number}
const direction=new Vector3(),point=new Vector3(),colour=new Vector3(),anchorWorld=new Vector3();
/** Body-local mesh vertices stay close to each chunk anchor. Only CPU doubles
 * carry planet centres; each anchor is transformed before subtracting origin. */
export class PlanetTerrain{
 readonly group=new Group();
 private readonly chunks=new Map<string,Chunk>();
 private readonly ground=new MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0});
 private readonly waterMaterial:MeshStandardMaterial;
 private readonly normalMap:Texture;
 private readonly grain:Texture;
 private readonly rotation=new Quaternion();
 private readonly inverse=new Quaternion();
 private readonly localViewer=new Vector3();
 private readonly lastViewer=new Vector3(Infinity,0,0);
 private active=new Set<string>();
 private generation=0;
 private lastTime=-Infinity;
 private budget=0;
 private grid=0;
 constructor(readonly body:BodyDef){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const context=canvas.getContext('2d')!;
  const image=context.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(x+y*128)*4;image.data[i]=128+Math.sin(x*Math.PI/16+y*Math.PI/32)*12;image.data[i+1]=128+Math.cos(y*Math.PI/16-x*Math.PI/32)*12;image.data[i+2]=253;image.data[i+3]=255;}
  context.putImageData(image,0,0);this.normalMap=new CanvasTexture(canvas);this.normalMap.wrapS=this.normalMap.wrapT=RepeatWrapping;
  const grain=document.createElement('canvas');grain.width=grain.height=128;const paint=grain.getContext('2d')!,pixels=paint.createImageData(128,128);
  for(let i=0;i<128*128;i++){const shade=205+((Math.imul(i+713,1103515245)>>>17)%51);pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=shade;pixels.data[i*4+3]=255;}
  paint.putImageData(pixels,0,0);this.grain=new CanvasTexture(grain);this.grain.wrapS=this.grain.wrapT=RepeatWrapping;this.ground.map=this.grain;
  this.waterMaterial=new MeshStandardMaterial({color:0x123f50,roughness:.25,metalness:.16,normalMap:this.normalMap,normalScale:new Vector2(.33,.33)});
  this.group.name=`${body.id} spherical terrain`;
 }
 get chunkCount(){return this.active.size;}
 private build(p:TerrainPatch,grid:number):Chunk{
  const radius=this.body.radius,anchor=patchDirection(p,.5,.5,new Vector3()).multiplyScalar(radius);
  const pos:number[]=[],colors:number[]=[],water:number[]=[],uv:number[]=[],indices:number[]=[];
  let ocean=false;
  const append=(fx:number,fy:number,skirt=0)=>{
   patchDirection(p,fx,fy,direction);const height=terrainHeight(this.body,direction);
   point.copy(direction).multiplyScalar(radius+height-skirt).sub(anchor);pos.push(point.x,point.y,point.z);
   terrainColor(this.body,direction,height,colour);colors.push(colour.x,colour.y,colour.z);
   point.copy(direction).multiplyScalar(radius-.08-skirt).sub(anchor);water.push(point.x,point.y,point.z);
   // Shared world frequency, with repeat boundaries exactly at cube patch edges.
   const size=radius*2/2**p.level;uv.push((p.x+fx)*size/22,(p.y+fy)*size/22);if(height<.5)ocean=true;
  };
  for(let y=0;y<=grid;y++)for(let x=0;x<=grid;x++)append(x/grid,y/grid);
  const stride=grid+1;
  for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){const a=x+y*stride;indices.push(a,a+1,a+stride,a+1,a+stride+1,a+stride);}
  // Radial skirts hide cracks between independently selected LOD levels.
  const depth=Math.max(3,radius/2**p.level*.035);
  for(let edge=0;edge<4;edge++){
   const first=pos.length/3;
   for(let i=0;i<=grid;i++){
    const fx=edge===0?i/grid:edge===1?1:edge===2?1-i/grid:0;
    const fy=edge===0?0:edge===1?i/grid:edge===2?1:1-i/grid;append(fx,fy,depth);
    if(i<grid){const a=edge===0?i:edge===1?grid+i*stride:edge===2?grid-i+grid*stride:(grid-i)*stride;const b=edge===0?a+1:edge===1?a+stride:edge===2?a-1:a-stride;indices.push(a,first+i,b,b,first+i,first+i+1);}
   }
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(pos,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  // Cube face winding varies by convention; enforce outward normals and winding.
  const normals=geometry.getAttribute('normal'),positions=geometry.getAttribute('position');
  point.fromBufferAttribute(positions,Math.floor(stride*stride/2)).add(anchor).normalize();direction.fromBufferAttribute(normals,Math.floor(stride*stride/2));
  if(direction.dot(point)<0){for(let i=0;i<indices.length;i+=3){const t=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=t;}geometry.setIndex(indices);geometry.computeVertexNormals();}
  // The vertical skirt must not bend the top edge's lighting normal. Sampling
  // only the perimeter bounds construction cost and works across LOD levels.
  const edgeNormals=geometry.getAttribute('normal');
  for(let y=0;y<=grid;y++)for(let x=0;x<=grid;x++)if(x===0||y===0||x===grid||y===grid){
   patchDirection(p,x/grid,y/grid,direction);terrainNormal(this.body,direction,point);edgeNormals.setXYZ(x+y*stride,point.x,point.y,point.z);
  }
  for(let edge=0;edge<4;edge++)for(let i=0;i<=grid;i++){
   const top=edge===0?i:edge===1?grid+i*stride:edge===2?grid-i+grid*stride:(grid-i)*stride;
   edgeNormals.setXYZ(stride*stride+edge*stride+i,edgeNormals.getX(top),edgeNormals.getY(top),edgeNormals.getZ(top));
  }
  const mesh=new Mesh(geometry,this.ground);this.group.add(mesh);let sea:Mesh|null=null;
  if(ocean&&this.body.surface?.program==='terran'){
   const waterGeometry=new BufferGeometry();waterGeometry.setAttribute('position',new Float32BufferAttribute(water,3));waterGeometry.setAttribute('uv',new Float32BufferAttribute(uv,2));waterGeometry.setIndex(indices);waterGeometry.computeVertexNormals();
   const waterNormals=waterGeometry.getAttribute('normal'),waterPositions=waterGeometry.getAttribute('position');
   for(let i=0;i<waterPositions.count;i++){point.fromBufferAttribute(waterPositions,i).add(anchor).normalize();waterNormals.setXYZ(i,point.x,point.y,point.z);}
   waterGeometry.computeBoundingSphere();sea=new Mesh(waterGeometry,this.waterMaterial);this.group.add(sea);
  }
  return {patch:p,anchor,mesh,water:sea,last:this.generation};
 }
 update(center:Vector3,viewer:Vector3,origin:Vector3,time:number,profile:QualityProfile):boolean{
  const altitude=viewer.distanceTo(center)-this.body.radius;this.group.visible=altitude<200000;
  if(!this.group.visible){if(this.chunks.size)this.clear();return false;}
  bodyRotation(this.body,time,this.rotation);this.inverse.copy(this.rotation).invert();this.localViewer.copy(viewer).sub(center).applyQuaternion(this.inverse);
  const quality=terrainQuality(profile),rebuild=quality.grid!==this.grid;
  if(rebuild){this.clear();this.grid=quality.grid;}
  if(rebuild||quality.patches!==this.budget||(time<this.lastTime||time-this.lastTime>.4)&&this.localViewer.distanceToSquared(this.lastViewer)>25){
   this.generation++;this.budget=quality.patches;this.lastTime=time;this.lastViewer.copy(this.localViewer);
   const selected=selectTerrainPatches(this.localViewer,this.body.radius,this.budget);this.active=new Set(selected.map(p=>p.key));
   for(const patch of selected){let chunk=this.chunks.get(patch.key);if(!chunk){chunk=this.build(patch,this.grid);this.chunks.set(patch.key,chunk);}chunk.last=this.generation;}
   for(const [key,chunk] of this.chunks){if(!this.active.has(key)&&chunk.last<this.generation-2){this.release(chunk);this.chunks.delete(key);}}
  }
  for(const [key,chunk] of this.chunks){
   const visible=this.active.has(key);chunk.mesh.visible=visible;if(chunk.water)chunk.water.visible=visible;
   if(!visible)continue;
   anchorWorld.copy(chunk.anchor).applyQuaternion(this.rotation).add(center).sub(origin);
   chunk.mesh.position.copy(anchorWorld);chunk.mesh.quaternion.copy(this.rotation);
   if(chunk.water){chunk.water.position.copy(anchorWorld);chunk.water.quaternion.copy(this.rotation);}
  }
  this.normalMap.offset.set((time*.011)%1,(time*.007)%1);return true;
 }
 private release(c:Chunk){c.mesh.removeFromParent();c.mesh.geometry.dispose();if(c.water){c.water.removeFromParent();c.water.geometry.dispose();}}
 private clear(){for(const chunk of this.chunks.values())this.release(chunk);this.chunks.clear();this.active.clear();this.lastViewer.set(Infinity,0,0);this.lastTime=-Infinity;}
 dispose(){this.clear();this.ground.dispose();this.waterMaterial.dispose();this.normalMap.dispose();this.grain.dispose();}
}
