import {BoxGeometry,CapsuleGeometry,Color,Group,InstancedMesh,Matrix4,MeshBasicMaterial,MeshStandardMaterial,Quaternion,SphereGeometry,Vector3,type BufferGeometry,type Material} from 'three';

const matrix=new Matrix4(),position=new Vector3(),scale=new Vector3(1,1,1),rotation=new Quaternion(),axis=new Vector3(0,1,0),legAxis=new Vector3(1,0,0);
/** Small, deterministic ambient traffic. One draw per shared part; no physics,
 * AI paths, new lights or allocations are added to the frame loop. */
export class CityLife{
 readonly group=new Group();
 private readonly geos:BufferGeometry[]=[];private readonly mats:Material[]=[];
 private readonly buses:InstancedMesh[]=[];private readonly people:InstancedMesh[]=[];
 constructor(){
  const shell=new MeshStandardMaterial({color:0xd5d7d1,roughness:.6,metalness:.15});
  const glass=new MeshStandardMaterial({color:0x183b4b,roughness:.25,metalness:.35});
  const light=new MeshBasicMaterial({color:0x8de8da,toneMapped:false});
  const cloth=new MeshStandardMaterial({color:0xffffff,roughness:.95});
  const skin=new MeshStandardMaterial({color:0xb79176,roughness:1});
  const trousers=new MeshStandardMaterial({color:0x344352,roughness:.95});
  this.mats.push(shell,glass,light,cloth,skin,trousers);
  const add=(geo:BufferGeometry,material:Material,count:number,parts:InstancedMesh[])=>{this.geos.push(geo);const mesh=new InstancedMesh(geo,material,count);mesh.frustumCulled=false;parts.push(mesh);this.group.add(mesh);return mesh;};
  add(new BoxGeometry(2.8,1.8,7).translate(0,1.1,0),shell,14,this.buses);
  add(new BoxGeometry(2.85,.8,5.5).translate(0,1.6,-.2),glass,14,this.buses);
  add(new BoxGeometry(2.4,.09,.05).translate(0,1.1,-3.53),light,14,this.buses);
  const bodies=add(new CapsuleGeometry(.22,.52,3,6).translate(0,1.02,0),cloth,64,this.people);
  add(new SphereGeometry(.16,8,6).translate(0,1.62,0),skin,64,this.people);
  add(new BoxGeometry(.16,.68,.19).translate(0,-.32,0),trousers,128,this.people);
  const colours=[0x95aab0,0xc3a77b,0x6f8793,0xa6aa8d,0x7e808b];
  for(let i=0;i<64;i++)bodies.setColorAt(i,new Color(colours[i%colours.length]));
  this.group.name='PORT LYRA / street traffic and pedestrians';
 }
 update(time:number,visible:boolean):void{
  this.group.visible=visible;if(!visible)return;
  const perimeter=4400;
  for(let i=0;i<14;i++){
   const t=(time*14+i*perimeter/14)%perimeter;let x:number,z:number,yaw:number;
   if(t<1600){x=-800+t;z=-700;yaw=-Math.PI/2;}
   else if(t<2200){x=800;z=-700-(t-1600);yaw=0;}
   else if(t<3800){x=800-(t-2200);z=-1300;yaw=Math.PI/2;}
   else{x=-800;z=-1300+(t-3800);yaw=Math.PI;}
   rotation.setFromAxisAngle(axis,yaw);matrix.compose(position.set(x,.12,z),rotation,scale);
   for(const mesh of this.buses)mesh.setMatrixAt(i,matrix);
  }
  for(let i=0;i<64;i++){
   const direction=i%2?1:-1,travel=(time*1.2+i*47)%880,z=direction>0?-550-travel:-1430+travel,x=(i%4<2?-1:1)*(i%3===0?25:18);
   rotation.setFromAxisAngle(axis,direction>0?0:Math.PI);matrix.compose(position.set(x,-.03,z),rotation,scale);
   this.people[0].setMatrixAt(i,matrix);this.people[1].setMatrixAt(i,matrix);
   for(let side=0;side<2;side++){
    rotation.setFromAxisAngle(legAxis,Math.sin(time*4+i+side*Math.PI)*.35);matrix.compose(position.set(x+(side?-.12:.12),.73,z),rotation,scale);this.people[2].setMatrixAt(i*2+side,matrix);
   }
  }
  for(const mesh of this.buses)mesh.instanceMatrix.needsUpdate=true;
  for(const mesh of this.people)mesh.instanceMatrix.needsUpdate=true;
 }
 dispose(){for(const mesh of this.buses)mesh.dispose();for(const mesh of this.people)mesh.dispose();for(const geometry of this.geos)geometry.dispose();for(const material of this.mats)material.dispose();this.group.clear();}
}
