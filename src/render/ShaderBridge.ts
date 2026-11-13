import {DataTexture,InstancedBufferAttribute,InstancedBufferGeometry,Mesh,PlaneGeometry,RGBAFormat,ShaderMaterial,type Object3D,type Points,type Scene} from 'three';
import {nativeShader,type NativeShader} from './tslPrograms';
import {shaderProgram,shaderRevision} from './shaderRegistry';

interface Entry{source:ShaderMaterial;native:NativeShader;release:()=>void}
interface Stars{source:Points;mesh:Mesh<InstancedBufferGeometry>;release:()=>void}

/** Owns native equivalents and only traverses again when a registered shader is
 * created. Uniform synchronization allocates no arrays or vectors per frame. */
export class ShaderBridge{
 private readonly cache=new Map<ShaderMaterial,Entry>();
 private readonly revisions=new WeakMap<Scene,number>();
 private readonly stars:Stars[]=[];
 private readonly fallback=new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat);
 private disposed=false;
 constructor(){this.fallback.needsUpdate=true;}

 prepare(scene:Scene):void{
  const revision=shaderRevision();
  if(scene.userData.dynamicShaders||this.revisions.get(scene)!==revision){scene.traverse(this.visit);this.revisions.set(scene,revision);}
  for(const entry of this.cache.values())entry.native.sync();
  for(const star of this.stars)star.mesh.geometry.instanceCount=Math.min(star.source.geometry.getAttribute('position').count,star.source.geometry.drawRange.count);
 }
 private readonly visit=(object:Object3D):void=>{
  if(!('material' in object))return;
  const drawable=object as Mesh;
  const material=drawable.material;
  if(Array.isArray(material)){for(let i=0;i<material.length;i++)if(material[i] instanceof ShaderMaterial)material[i]=this.convert(material[i] as ShaderMaterial);return;}
  if(!(material instanceof ShaderMaterial))return;
  const kind=shaderProgram(material);if(!kind)throw new Error(`WebGPU shader has no migration: ${material.name||material.type}`);
  if(kind==='stars'&&'isPoints' in object){
   if(this.stars.some(star=>star.source===object))return;
   const source=object as unknown as Points,quad=new PlaneGeometry(1,1),geometry=new InstancedBufferGeometry();
   geometry.index=quad.index;geometry.setAttribute('position',quad.getAttribute('position'));geometry.setAttribute('uv',quad.getAttribute('uv'));
   geometry.setAttribute('normal',quad.getAttribute('normal'));quad.dispose();
   for(const [name,original] of [['starCentre','position'],['aMag','aMag'],['aColor','aColor']] as const){const attr=source.geometry.getAttribute(original);geometry.setAttribute(name,new InstancedBufferAttribute(attr.array,attr.itemSize));}
   geometry.instanceCount=source.geometry.drawRange.count;
   const mesh=new Mesh(geometry,this.convert(material));mesh.name='Native instanced star field';mesh.renderOrder=source.renderOrder;mesh.frustumCulled=false;mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);
   source.visible=false;source.parent!.add(mesh);
   const release=()=>{mesh.removeFromParent();geometry.dispose();source.geometry.removeEventListener('dispose',release);const i=this.stars.findIndex(s=>s.mesh===mesh);if(i>=0)this.stars.splice(i,1);};
   source.geometry.addEventListener('dispose',release);this.stars.push({source,mesh,release});
  }else drawable.material=this.convert(material);
 };
 private convert(source:ShaderMaterial){
  let entry=this.cache.get(source);
  if(!entry){const kind=shaderProgram(source);if(!kind)throw new Error('Unregistered GLSL material');const native=nativeShader(kind,source,this.fallback);
   const release=()=>{source.removeEventListener('dispose',release);native.dispose();this.cache.delete(source);};
   entry={source,native,release};this.cache.set(source,entry);source.addEventListener('dispose',release);
  }
  return entry.native.material;
 }
 dispose():void{if(this.disposed)return;this.disposed=true;for(const star of [...this.stars])star.release();for(const entry of [...this.cache.values()])entry.release();this.fallback.dispose();}
}
