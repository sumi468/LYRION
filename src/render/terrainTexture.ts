import {DataTexture,RGBAFormat,UnsignedByteType,RepeatWrapping,ClampToEdgeWrapping,LinearMipmapLinearFilter,Vector3} from 'three';
import type {BodyDef} from '../data/types';
import {terrainHeight,terrainColor} from '../physics/terrain';
/** Orbit albedo uses exactly the same continents and coasts as ground meshes. */
export async function terrainTexture(body:BodyDef,width:number,progress?:(value:number)=>void):Promise<DataTexture>{
 const height=width/2,data=new Uint8Array(width*height*4),direction=new Vector3(),color=new Vector3();
 for(let y=0;y<height;y++){
  const theta=(1-y/(height-1))*Math.PI,s=Math.sin(theta);
  for(let x=0;x<width;x++){
   const phi=x/(width-1)*Math.PI*2;direction.set(-Math.cos(phi)*s,Math.cos(theta),Math.sin(phi)*s);
   const elevation=terrainHeight(body,direction);terrainColor(body,direction,elevation,color);
   const i=(y*width+x)*4;data[i]=Math.min(255,color.x*255);data[i+1]=Math.min(255,color.y*255);data[i+2]=Math.min(255,color.z*255);data[i+3]=Math.max(0,Math.min(255,((body.surface!.sea??.53)+elevation/18000)*255));
  }
  if(y%128===127){progress?.((y+1)/height);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
 }
 const texture=new DataTexture(data,width,height,RGBAFormat,UnsignedByteType);texture.wrapS=RepeatWrapping;texture.wrapT=ClampToEdgeWrapping;texture.generateMipmaps=true;texture.minFilter=LinearMipmapLinearFilter;texture.needsUpdate=true;progress?.(1);return texture;
}
