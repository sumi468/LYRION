import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { INVESTIGATIONS } from '../data/homeworld';
import type { HomecomingSystem } from '../systems/homecoming';
import type { HomecomingProgress } from '../systems/expeditions';
import type { QualityProfile } from './quality';
import { mergeParts } from './modelParts';
import { AstronautModel } from './AstronautModel';

const boardingPosition = new Vector3();

type Parts = BufferGeometry[][];
const box = (x: number,y: number,z: number,px=0,py=0,pz=0) => new BoxGeometry(x,y,z).translate(px,py,pz);
const tube = (r: number,length: number,x=0,y=0,z=0,axis: 'y'|'z'|'x'='z') => {
  const g = new CylinderGeometry(r,r,length,12);
  if (axis==='z') g.rotateX(Math.PI/2); if (axis==='x') g.rotateZ(Math.PI/2);
  return g.translate(x,y,z);
};
function assemble(parts: Parts, materials: MeshStandardMaterial[]): Group {
  const g = new Group();
  parts.forEach((p,i)=>{if(p.length)g.add(new Mesh(mergeParts(p),materials[i]));});
  return g;
}

/** Static hardware is merged by material, with a separate quality-controlled detail batch. */
export class ExpeditionView {
  readonly group = new Group();
  readonly station: Group;
  readonly satellite: Group;
  readonly deep: Group;
  readonly astronautModel = new AstronautModel();
  readonly astronaut = this.astronautModel.group;
  private detail: Group;
  private targets: Mesh[] = [];
  private repairLight = new Mesh(new SphereGeometry(.18,8,6),new MeshStandardMaterial({color:0xeb8e35,emissive:0xeb8e35,emissiveIntensity:1.5}));
  private materials = [
    new MeshStandardMaterial({color:0xd2d4c9,roughness:.62,metalness:.45}),
    new MeshStandardMaterial({color:0x273844,roughness:.55,metalness:.8}),
    new MeshStandardMaterial({color:0x0b2246,roughness:.32,metalness:.72}),
    new MeshStandardMaterial({color:0xd7b169,roughness:.42,metalness:.7}),
    new MeshStandardMaterial({color:0x51cbe0,emissive:0x218fa0,emissiveIntensity:1.5}),
    new MeshStandardMaterial({color:0xe9e7da,roughness:.85}),
    new MeshStandardMaterial({color:0xb49749,metalness:1,roughness:.19}),
    new MeshStandardMaterial({color:0xf16a35,roughness:.7}),
  ];
  constructor() {
    const p: Parts = this.materials.map(()=>[]), d: Parts=this.materials.map(()=>[]);
    // Pressure modules, articulated nodes, airlocks and structural collars.
    p[0].push(tube(3,26,0,0,1),tube(2.7,10,-8,0,2,'x'),tube(2.7,10,8,0,2,'x'));
    for (const z of [-13,-8,-2,5,12,16]) p[1].push(tube(3.14,.45,0,0,z));
    p[0].push(tube(2.3,6,0,0,19));p[1].push(tube(2.6,1,0,0,22.5));
    p[3].push(new TorusGeometry(2.25,.22,6,24).translate(0,0,24));
    p[4].push(new TorusGeometry(2.65,.07,4,24).translate(0,0,24.1));
    p[1].push(box(85,1.8,2,0,0,-17));
    for (const x of [-33,-21,21,33]) {
      p[3].push(box(.35,.5,31,x,0,-18));
      p[2].push(box(9,.14,28,x,.2,-18));
      for (let z=-31;z<=-4;z+=2.8) d[3].push(box(8.8,.025,.04,x,.29,z));
      for (let dx=-4.3;dx<=4.3;dx+=2.15) d[3].push(box(.035,.025,27.8,x+dx,.29,-18));
    }
    for (const x of [-10,10]) {p[0].push(box(6,.2,9,x,-4,-9));for(let z=-13;z<-5;z+=1)d[1].push(box(5.8,.04,.07,x,-4.12,z));}
    p[1].push(tube(.23,10,-7,4,-11,'y'));p[0].push(new SphereGeometry(1.3,12,8).scale(1,.3,1).translate(-7,8.5,-11));
    for(const z of [-10,-5,0,5,10]) {
      d[3].push(tube(.06,5,-3.55,1.5,z,'z'),tube(.06,1,-3.55,1,z,'y'));
      d[1].push(box(1.2,.06,.7,0,3.04,z));
    }
    p[1].push(box(1.2,1.8,.8,-4.4,1.4,8),box(.8,1.5,1,7,3,2),box(1.3,.8,1,-7,6,-13));
    p[4].push(box(.65,1,.06,-4.4,1.4,8.43),box(.4,.4,.1,7,3.4,2.55));
    for(const x of [-2,2]){p[4].push(box(.22,.22,.3,x,0,24.3));d[7].push(box(.5,.14,.5,x,3.1,10));}
    p[1].push(box(3,2,2,16,-5,17));p[3].push(tube(.4,3,16,-5,17,'x'));
    this.station=assemble(p,this.materials); this.detail=assemble(d,this.materials);this.station.add(this.detail);this.group.add(this.station);
    this.repairLight.position.set(-7,6.6,-12.4);this.station.add(this.repairLight);

    const sat: Parts=this.materials.map(()=>[]);
    sat[3].push(box(3,3,3));sat[1].push(tube(.15,14,0,0,0,'x'));sat[2].push(box(5,.12,6,-5,0,0),box(5,.12,6,5,0,0));
    sat[0].push(tube(.9,2,0,2,0,'y'));sat[4].push(box(.8,.1,.8,0,3,0));this.satellite=assemble(sat,this.materials);this.group.add(this.satellite);
    const deep:Parts=this.materials.map(()=>[]);
    deep[1].push(tube(1.8,7,0,0,0,'y'),box(4,2,5,11,-1.5,4));deep[3].push(new TorusGeometry(3.5,.24,6,32).rotateX(Math.PI/2));
    deep[0].push(tube(.2,12,0,0,0,'x'));deep[2].push(box(4,.1,5,-5,0,0),box(4,.1,5,5,0,0));deep[4].push(tube(.65,.3,0,3.6,0,'y'));this.deep=assemble(deep,this.materials);this.group.add(this.deep);

    this.group.add(this.astronaut);
    const targetGeo=new TorusGeometry(.65,.045,4,20);
    for (let i=0;i<INVESTIGATIONS.length;i++){const m=new Mesh(targetGeo,this.materials[4]);this.targets.push(m);this.group.add(m);}
    this.materials.push(this.repairLight.material);
  }
  update(system: HomecomingSystem, progress: HomecomingProgress, origin: Vector3, camera: Vector3, time: number, profile: QualityProfile): void {
    for(const id of ['asterion','satellite','deep'] as const) {
      const g=id==='asterion'?this.station:this[id],f=system.frames.get(id);
      g.position.copy(f.position).sub(origin);g.quaternion.copy(f.rotation);
      g.visible=f.position.distanceToSquared(camera)<(id==='asterion'?20000:6000)**2;
    }
    this.detail.visible=profile.belt>=2000&&system.stationDistance<1800;
    const eva=system.eva;this.astronautModel.update(eva,system.investigations.activeId!==null,time,profile);
    const repaired=progress.investigated['antenna-repair']!==undefined;
    this.repairLight.material.color.setHex(repaired?0x64e8b0:0xeb8e35);this.repairLight.material.emissive.copy(this.repairLight.material.color);
    if(this.astronautModel.visualActive){
      boardingPosition.copy(eva.position);
      if(!eva.active&&this.astronautModel.boardingNearShip)boardingPosition.lerp(eva.hatchPosition,this.astronautModel.boardingAmount);
      this.astronaut.position.copy(boardingPosition).sub(origin);this.astronaut.quaternion.copy(eva.rotation);
    }
    for(let i=0;i<this.targets.length;i++){
      const def=INVESTIGATIONS[i],m=this.targets[i];
      m.visible=eva.active&&system.distances[def.id]<65&&progress.investigated[def.id]===undefined;
      if(m.visible){m.position.copy(system.points[def.id]).sub(origin);m.lookAt(camera.x-origin.x,camera.y-origin.y,camera.z-origin.z);m.scale.setScalar(1+Math.sin(time*3)*.08);}
    }
  }
  dispose(): void {
    // The suit owns its batched geometry, PBR maps and reflection texture.
    // Remove it before traversing station hardware to avoid double disposal.
    this.astronautModel.dispose();
    const geometries=new Set<BufferGeometry>();this.group.traverse(o=>{if(o instanceof Mesh)geometries.add(o.geometry);});
    for(const g of geometries)g.dispose();for(const m of this.materials)m.dispose();this.group.clear();
  }
}
