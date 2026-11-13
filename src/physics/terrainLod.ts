import {Vector3} from 'three';
export interface TerrainPatch{face:number;level:number;x:number;y:number;key:string}
const direction=new Vector3();
export function cubeDirection(face:number,u:number,v:number,out:Vector3):Vector3{
 switch(face){case 0:out.set(1,v,-u);break;case 1:out.set(-1,v,u);break;case 2:out.set(u,1,-v);break;case 3:out.set(u,-1,v);break;case 4:out.set(u,v,1);break;default:out.set(-u,v,-1);}
 return out.normalize();
}
export function patchDirection(p:TerrainPatch,fx:number,fy:number,out:Vector3):Vector3{
 const size=2/2**p.level;return cubeDirection(p.face,-1+(p.x+fx)*size,-1+(p.y+fy)*size,out);
}
/** Best-first subdivision makes the budget a hard bound, independent of face order. */
export function selectTerrainPatches(viewer:Vector3,radius:number,budget:number):TerrainPatch[]{
 const altitude=Math.max(1,viewer.length()-radius),unit=viewer.clone().normalize();
 const leaves:TerrainPatch[]=Array.from({length:6},(_,face)=>({face,level:0,x:0,y:0,key:`${face}/0/0/0`}));
 const score=(p:TerrainPatch)=>{
  patchDirection(p,.5,.5,direction);const size=radius*2/2**p.level;
  const angle=Math.acos(Math.max(-1,Math.min(1,direction.dot(unit))));
  // Conservative angular bounding radius includes corners and distant peaks.
  if(angle>Math.acos(radius/(radius+altitude+5400))+2.3/2**p.level)return 0;
  const distance=Math.max(altitude,angle*radius-size*.65,4);
  return p.level>=19?0:size/distance;
 };
 while(leaves.length+3<=budget){
  let best=-1,value=1.5;
  for(let i=0;i<leaves.length;i++){const s=score(leaves[i]);if(s>value){best=i;value=s;}}
  if(best<0)break;
  const p=leaves[best];leaves.splice(best,1);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++)leaves.push({face:p.face,level:p.level+1,x:p.x*2+x,y:p.y*2+y,key:`${p.face}/${p.level+1}/${p.x*2+x}/${p.y*2+y}`});
 }
 return leaves;
}
