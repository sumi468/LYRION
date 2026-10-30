import { describe, expect, it } from 'vitest';
import { Box3, BufferGeometry, Material, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { AstronautModel } from '../src/render/AstronautModel';
import { QUALITY_LADDER } from '../src/render/quality';
import { EvaSystem } from '../src/systems/eva';
import { EVA_CAPSULE_SAMPLES } from '../src/physics/localCollision';
import { EVA_ROUTE_RADIUS } from '../src/physics/evaRoute';

function meshes(model:AstronautModel):Mesh[]{const result:Mesh[]=[];model.group.traverse(o=>{if(o instanceof Mesh)result.push(o);});return result;}

describe('Original LX-EVA pressure suit',()=>{
  it('keeps human-scale proportions and a bounded, finite geometry budget',()=>{
    const model=new AstronautModel();model.resetPose();model.group.updateMatrixWorld(true);
    const size=new Box3().setFromObject(model.group).getSize(new Vector3()),parts=meshes(model);
    expect(size.y).toBeGreaterThan(1.95);expect(size.y).toBeLessThan(2.15);
    expect(size.x).toBeGreaterThan(.9);expect(size.x).toBeLessThan(1.35);
    expect(size.z).toBeLessThan(1.25);
    expect(parts.length).toBeLessThanOrEqual(42);expect(model.triangleCount).toBeLessThan(50000);
    for(const part of parts){
      for(const name of ['position','normal','uv'])expect(Array.from(part.geometry.getAttribute(name).array).every(Number.isFinite),name).toBe(true);
      if(part.geometry.index)expect(Math.max(...part.geometry.index.array)).toBeLessThan(part.geometry.getAttribute('position').count);
    }
    model.dispose();
  });
  it('smoothly poses the hands for work and holds the pose when simulation time is paused',()=>{
    const model=new AstronautModel(),eva=new EvaSystem();eva.active=true;eva.localVelocity.set(1,0,-4);eva.thrust=1;
    model.update(eva,false,0,QUALITY_LADDER[3]);for(let i=1;i<=40;i++)model.update(eva,false,i/60,QUALITY_LADDER[3]);
    const resting=model.forearms[0].rotation.x;
    for(let i=41;i<=160;i++)model.update(eva,true,i/60,QUALITY_LADDER[3]);
    expect(model.forearms[0].rotation.x).toBeGreaterThan(resting+.3);
    expect(meshes(model).some(m=>!Array.isArray(m.material)&&m.material.type==='MeshBasicMaterial'&&m.visible)).toBe(true);
    const pose=model.upperArms[0].quaternion.clone();model.update(eva,true,160/60,QUALITY_LADDER[3]);
    expect(model.upperArms[0].quaternion.angleTo(pose)).toBeLessThan(1e-7);
    model.dispose();
  });
  it('directs cold-gas plume geometry outward from the suit instead of into the life-support pack',()=>{
    const model=new AstronautModel(),parts=meshes(model),front=parts.find(mesh=>mesh.name==='LX-EVA RCS -Z')!,back=parts.find(mesh=>mesh.name==='LX-EVA RCS +Z')!;
    front.geometry.computeBoundingBox();back.geometry.computeBoundingBox();
    expect(front.geometry.boundingBox!.min.z).toBeLessThan(-.36);expect(front.geometry.boundingBox!.max.z).toBeLessThan(-.23);
    expect(back.geometry.boundingBox!.min.z).toBeGreaterThan(.56);expect(back.geometry.boundingBox!.max.z).toBeGreaterThan(.69);
    model.dispose();
  });
  it('uses a short finite boarding transition and survives repeated EVA cycles',()=>{
    const model=new AstronautModel(),eva=new EvaSystem();let time=0;
    for(let cycle=0;cycle<4;cycle++){
      eva.active=true;eva.distance=3;model.update(eva,false,time+=.1,QUALITY_LADDER[3]);expect(model.visualActive).toBe(true);
      eva.active=false;model.update(eva,false,time+=.1,QUALITY_LADDER[3]);
      expect(model.visualActive).toBe(true);expect(model.boardingNearShip).toBe(true);expect(model.boardingAmount).toBeGreaterThan(0);
      for(let i=0;i<6;i++)model.update(eva,false,time+=.1,QUALITY_LADDER[3]);
      expect(model.visualActive).toBe(false);expect(model.boardingAmount).toBeCloseTo(1);expect(Number.isFinite(model.rig.position.length())).toBe(true);
    }
    eva.active=true;model.update(eva,false,time+=.1,QUALITY_LADDER[0]);expect(model.detail.visible).toBe(false);
    model.update(eva,false,time+=.1,QUALITY_LADDER[3]);expect(model.detail.visible).toBe(true);
    model.dispose();
  });
  it('uses hatch proximity for boarding and keeps every animated boot within the full-body capsule',()=>{
    const model=new AstronautModel(),eva=new EvaSystem();eva.active=true;eva.distance=7.3;eva.position.set(-6.8,1.25,-2.2);eva.hatchPosition.set(-3.3,1.25,-2.2);
    model.update(eva,false,0,QUALITY_LADDER[3]);let lowest=Infinity,highest=-Infinity;
    for(let i=1;i<=180;i++){
      eva.thrust=1;eva.localVelocity.set(4,1,-3).setLength(6);eva.returning=i>130;
      model.update(eva,i>60,i/60,QUALITY_LADDER[3]);model.group.updateMatrixWorld(true);
      const bounds=new Box3().setFromObject(model.group);lowest=Math.min(lowest,bounds.min.y);highest=Math.max(highest,bounds.max.y);
    }
    expect(lowest).toBeGreaterThan(-1.12);expect(highest).toBeLessThan(1.06);
    eva.active=false;model.update(eva,false,3.1,QUALITY_LADDER[3]);expect(model.boardingNearShip).toBe(true);expect(model.boardingAmount).toBeLessThan(.3);
    model.dispose();
  });
  it('contains the complete animated mesh in the collision envelope and clears that envelope on return routes',()=>{
    const model=new AstronautModel(),eva=new EvaSystem(),point=new Vector3();eva.active=true;eva.thrust=1;eva.localVelocity.set(4,1,-3).setLength(6);
    // Merged triangles repeat many vertices. Deduplicate once so the geometric
    // coverage check remains cheap while retaining every actual mesh position.
    const parts=meshes(model).map(mesh=>{
      const attribute=mesh.geometry.getAttribute('position'),keys=new Set<string>(),positions:Vector3[]=[];
      for(let i=0;i<attribute.count;i++){
        point.fromBufferAttribute(attribute,i);const key=point.toArray().join(',');
        if(!keys.has(key)){keys.add(key);positions.push(point.clone());}
      }
      return {mesh,positions};
    });
    let maximumOverage=-Infinity,maximumRadius=0;
    for(let launch=0;launch<2;launch++){
      if(launch){model.resetPose();eva.active=false;model.update(eva,false,3,QUALITY_LADDER[3]);eva.active=true;}
      for(let pose=0;pose<180;pose++){
        eva.returning=pose>130;model.update(eva,pose>60,launch*3.1+pose/60,QUALITY_LADDER[3]);model.group.updateMatrixWorld(true);
        for(const {mesh,positions} of parts)for(const position of positions){
          point.copy(position).applyMatrix4(mesh.matrixWorld);maximumRadius=Math.max(maximumRadius,point.length());
          let overage=Infinity;
          for(const sample of EVA_CAPSULE_SAMPLES)overage=Math.min(overage,Math.hypot(point.x,point.y-sample.y,point.z)-sample.radius);
          maximumOverage=Math.max(maximumOverage,overage);
        }
      }
    }
    expect(maximumOverage,'every posed vertex has at least 1 cm of collision clearance').toBeLessThan(-.01);
    expect(maximumRadius,'posed mesh remains within the measured 1.20u budget').toBeLessThan(1.20);
    expect(maximumRadius).toBeLessThan(EVA_ROUTE_RADIUS-.03);
    const collisionRadius=Math.max(...EVA_CAPSULE_SAMPLES.map(sample=>Math.abs(sample.y)+sample.radius));
    expect(EVA_ROUTE_RADIUS,'return paths must also clear the physics envelope at corners').toBeGreaterThanOrEqual(collisionRadius+.02);
    model.dispose();
  });
  it('owns and disposes every geometry, material and generated PBR texture exactly once',()=>{
    const model=new AstronautModel(),geometries=new Set<BufferGeometry>(),materials=new Set<Material>(),textures=new Set<Texture>();
    for(const mesh of meshes(model)){
      geometries.add(mesh.geometry);const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      for(const material of list){materials.add(material);if(material instanceof MeshStandardMaterial)for(const key of ['normalMap','roughnessMap','envMap'] as const)if(material[key])textures.add(material[key]);}
    }
    expect(textures.size).toBe(3);
    const counts=new Map<object,number>();for(const resource of [...geometries,...materials,...textures]){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));}
    model.dispose();model.dispose();expect([...counts.values()].every(n=>n===1)).toBe(true);expect(model.group.children).toHaveLength(0);
  });
});
