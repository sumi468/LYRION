import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry,
  CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Shape, SphereGeometry,
  SRGBColorSpace, TorusGeometry, type Material, type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 面取りした断面をつなぐハードサーフェス船体。機首は-Z。 */
function fuselage(): BufferGeometry {
  const sections = [
    [-8.2, .12, .02, -.12], [-6.5, .72, .38, -.42], [-3.5, 1.45, .85, -.7],
    [-.5, 2.05, .92, -.95], [3.4, 2.2, .6, -.9], [5.8, 1.65, .35, -.7],
  ];
  const positions: number[] = [], indices: number[] = [], uv: number[]=[];
  for (const [z, width, top, bottom] of sections) {
    const ring=[[-.65,top], [.65,top], [1,top*.45], [1,bottom*.55], [.65,bottom], [-.65,bottom], [-1,bottom*.55], [-1,top*.45]];
    for(let i=0;i<ring.length;i++){const [x,y]=ring[i];positions.push(x*width,y,z);uv.push(i/8,(z+8.2)/14);}
  }
  for(let j=0;j<sections.length-1;j++) for(let i=0;i<8;i++) {
    const a=j*8+i,b=j*8+(i+1)%8,c=b+8,d=a+8;
    indices.push(a,c,b,a,d,c);
  }
  for(let i=1;i<7;i++) {indices.push(0,i,i+1); const n=(sections.length-1)*8;indices.push(n,n+i+1,n+i);}
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function plate(points: [number,number][], thickness=.16): BufferGeometry {
  const shape=new Shape();shape.moveTo(...points[0]);for(const point of points.slice(1))shape.lineTo(...point);shape.closePath();
  return new ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:.055,bevelThickness:.035,bevelSegments:1,steps:1})
    .rotateX(Math.PI/2).translate(0,thickness/2,0);
}

/** 探査機LX-07: 一体型の耐熱船体、デルタ翼、双発のベルノズル、姿勢制御噴口。 */
export class ShipModel {
  readonly group=new Group();
  readonly hull=new Group();
  private flames: Mesh[]=[];
  private jets: Mesh[]=[];
  private flameMat: MeshBasicMaterial;
  private coreMat: MeshBasicMaterial;
  private jetMat: MeshBasicMaterial;
  private geos=new Set<BufferGeometry>();
  private mats: Material[]=[];
  private textures: Texture[]=[];
  private gear: Group[]=[];
  private gearAmount=0;

  constructor() {
    const ceramic=new MeshStandardMaterial({color:0x9da5ad,metalness:.3,roughness:.6,flatShading:true});
    const titanium=new MeshStandardMaterial({color:0x242e39,metalness:.75,roughness:.46});
    const heat=new MeshStandardMaterial({color:0x121b25,metalness:.3,roughness:.86});
    const copper=new MeshStandardMaterial({color:0x8a6b4d,metalness:.8,roughness:.5});
    const glass=new MeshStandardMaterial({color:0x081923,metalness:.72,roughness:.16,emissive:0x163646,emissiveIntensity:.25});
    const strip=new MeshStandardMaterial({color:0xa9c8cf,metalness:.55,roughness:.4,emissive:0x4a8ca4,emissiveIntensity:.4});
    this.flameMat=new MeshBasicMaterial({color:0x519bdd,transparent:true,opacity:.25,blending:AdditiveBlending,depthWrite:false});
    this.coreMat=new MeshBasicMaterial({color:0x9dd6ff,transparent:true,opacity:.3,blending:AdditiveBlending,depthWrite:false});
    this.jetMat=new MeshBasicMaterial({color:0xa6d9ef,transparent:true,opacity:.35,blending:AdditiveBlending,depthWrite:false});
    this.mats.push(ceramic,titanium,heat,copper,glass,strip,this.flameMat,this.coreMat,this.jetMat);
    // 決定的に生成する微細な擦り傷と目地。法線・粗さだけに使い、塗装色を保つ。
    const finish=document.createElement('canvas');finish.width=finish.height=256;
    const paint=finish.getContext('2d');
    if(paint){
      paint.fillStyle='#b7b7b7';paint.fillRect(0,0,256,256);let seed=47;
      for(let i=0;i<950;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%256;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed%256;paint.fillStyle=i%2?'#aaaaaa':'#c2c2c2';paint.fillRect(x,y,1,i%7+1);}
      paint.strokeStyle='#797979';paint.lineWidth=1;for(let i=0;i<256;i+=64)paint.strokeRect(2,i+2,252,60);
    }
    const finishMap=new CanvasTexture(finish);this.textures.push(finishMap);
    ceramic.bumpMap=finishMap;ceramic.bumpScale=.018;ceramic.roughnessMap=finishMap;
    titanium.bumpMap=finishMap;titanium.bumpScale=.012;
    const parts: Mesh[]=[];
    const originals=new Set<BufferGeometry>();
    const add=(geo:BufferGeometry,mat:Material,x=0,y=0,z=0)=>{
      const mesh=new Mesh(geo,mat);mesh.position.set(x,y,z);parts.push(mesh);originals.add(geo);return mesh;
    };
    add(fuselage(),ceramic);
    // 暗い耐熱腹面と分割された上部の装甲パネル。
    add(plate([[-.06,-7.9],[-1.75,-.6],[-1.48,5.6],[1.48,5.6],[1.75,-.6]],.12),heat,0,-.72,0);
    const panel=plate([[.2,-2.4],[1.2,-1.6],[1.65,2.6],[.2,3.2]],.09);
    const wing=plate([[1.3,-2.6],[2.65,-.2],[6.0,3.9],[5.85,4.65],[2.0,3.8]],.18);
    const wingPanel=plate([[2.2,.15],[2.75,.6],[5.3,3.65],[4.35,3.85],[2.3,2.6]],.07);
    const seam=new BoxGeometry(.035,.035,3.3);
    const finShape=new Shape();finShape.moveTo(-1.5,0);finShape.lineTo(1.5,0);finShape.lineTo(1.1,1.65);finShape.lineTo(.1,1.45);finShape.closePath();
    const finGeo=new ExtrudeGeometry(finShape,{depth:.12,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:1}).rotateY(-Math.PI/2).translate(.06,0,0);
    for(const side of [-1,1]) {
      add(panel,titanium,0,.88,0).scale.x=side;
      add(wing,ceramic,0,-.24,0).scale.x=side;
      add(wingPanel,heat,0,-.08,0).scale.x=side;
      add(seam,heat,side*.95,.97,.55).rotation.y=side*.1;
      // 埋め込んだ左右の推進モジュール。
      const pod=add(new CylinderGeometry(.69,.86,4.6,12).rotateX(Math.PI/2),titanium,side*2.05,-.33,3.45);
      pod.scale.y=.9;
      const cover=add(new BoxGeometry(.62,.18,2.45),ceramic,side*2.05,.3,2.9);cover.rotation.z=side*.08;
      add(new TorusGeometry(.78,.09,8,24),copper,side*2.05,-.33,5.65);
      add(new CylinderGeometry(.7,.55,.85,24,1,true).rotateX(Math.PI/2),heat,side*2.05,-.33,5.65);
      add(new TorusGeometry(.69,.065,8,24),titanium,side*2.05,-.33,6.08);
      const chamber=add(new CylinderGeometry(.34,.34,.18,20).rotateX(Math.PI/2),heat,side*2.05,-.33,5.8);
      chamber.scale.setScalar(.92);
      add(new TorusGeometry(.24,.025,6,20),strip,side*2.05,-.33,5.94);
      // 放熱グリル、ラッチ、翼端の航法灯。
      const vent=new BoxGeometry(.5,.055,.065);
      for(let i=0;i<6;i++)add(vent,heat,side*2.06,.41,1.85+i*.27);
      // Flush fasteners and radiator vanes stay in existing material batches.
      const fastener=new CylinderGeometry(.035,.035,.018,6);
      for(const z of [-1.2,.4,2.0,3.6])add(fastener,copper,side*1.32,.935,z);
      for(let i=0;i<7;i++)add(new BoxGeometry(.72,.04,.075),titanium,side*3.3,-.035,1.8+i*.2).rotation.y=side*.3;
      add(new BoxGeometry(.07,.04,2.5),heat,side*3.4,.01,2.7).rotation.y=side*.3;
      add(new BoxGeometry(.36,.055,.11),copper,side*1.5,.85,-.5);
      add(new BoxGeometry(.65,.055,.1),strip,side*4.7,.015,3.8).rotation.y=-side*.3;
      const lamp=new MeshBasicMaterial({color:side<0?0xe5574f:0x76b7a1});this.mats.push(lamp);
      add(new SphereGeometry(.08,8,6),lamp,side*5.85,-.1,4.27);
      // 外側へ張り出す二枚の尾翼。
      const fin=add(finGeo,titanium,side*1.45,.65,2.6);
      fin.rotation.z=-side*.38;
      // スラスター口と独立して点火する微小プルーム。
      for(const z of [-4.4,3.9]) {
        const nozzle=add(new CylinderGeometry(.12,.18,.22,8).rotateZ(Math.PI/2),titanium,side*1.5,.25,z);
        nozzle.scale.setScalar(z<0?.75:1);
        const geo=new ConeGeometry(.12,.8,8,1,true).rotateZ(-side*Math.PI/2).translate(side*.4,0,0);
        this.geos.add(geo);const jet=new Mesh(geo,this.jetMat);jet.position.set(side*1.65,.25,z);jet.visible=false;
        jet.userData.side=side;jet.userData.front=z<0;this.hull.add(jet);this.jets.push(jet);
      }
    }
    // 多面体キャノピーと中央の補強フレーム。
    const canopy=add(new SphereGeometry(1,6,4,0,Math.PI*2,0,Math.PI/2),glass,0,.72,-3.15);canopy.scale.set(.85,.52,1.9);
    add(new BoxGeometry(.085,.09,3.4),titanium,0,1.15,-3.0).rotation.x=-.045;
    add(new BoxGeometry(1.55,.08,.1),titanium,0,.96,-2.05);
    add(new BoxGeometry(.26,.16,1.3),heat,0,.48,-6.3).rotation.x=.07;
    add(new CylinderGeometry(.035,.035,.9,6),titanium,1.0,1.2,3.6).rotation.z=-.2;
    add(new BoxGeometry(2.5,.65,.12),heat,0,-.18,5.86);
    const aftVent=new BoxGeometry(1.9,.035,.035);for(let i=0;i<5;i++)add(aftVent,titanium,0,-.38+i*.1,5.94);
    this.addMarkings(add);

    // Recessed twin pulse cannons, armoured breeches and sensor fairing.
    for(const side of [-1,1]) {
      add(new BoxGeometry(.65,.55,2.2),titanium,side*2.8,-.35,-1.8);
      add(new CylinderGeometry(.17,.23,3.8,10).rotateX(Math.PI/2),heat,side*2.8,-.35,-4.1);
      add(new TorusGeometry(.18,.045,6,12),copper,side*2.8,-.35,-6.02);
      add(new BoxGeometry(.4,.2,.6),strip,side*.7,.95,-1.2);
    }
    add(new SphereGeometry(.32,12,8),glass,0,.28,-7.4);
    // Three retractable landing struts; one mesh per strut.
    for(const [x,z] of [[0,-4.4],[-2,3.5],[2,3.5]]) {
      const leg=new Group();leg.position.set(x,-.75,z);
      const sources=[new CylinderGeometry(.10,.16,2.0,8).translate(0,-1,0),new CylinderGeometry(.19,.19,.65,8).translate(0,-.6,0),new BoxGeometry(.8,.18,1.25).translate(0,-2.1,0)];
      const pieces=sources.map(g=>g.toNonIndexed());
      const geometry=mergeGeometries(pieces)!;for(const piece of [...sources,...pieces])piece.dispose();
      this.geos.add(geometry);leg.add(new Mesh(geometry,titanium));this.gear.push(leg);this.hull.add(leg);leg.visible=false;
    }

    // 静的部品を材質ごとに結合。ディテールを増やしても描画呼出しを抑える。
    for(const material of new Set(parts.map((part)=>part.material as Material))) {
      const geometries=parts.filter((part)=>part.material===material).map((part)=>{
        part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
        geometry.applyMatrix4(part.matrix);
        // ミラーした部品は、結合後の背面カリングに備えて頂点の向きを戻す。
        if(part.matrix.determinant()<0) for(const attribute of Object.values(geometry.attributes)) {
          const values=attribute.array;
          for(let vertex=0;vertex<attribute.count;vertex+=3) for(let component=0;component<attribute.itemSize;component++) {
            const a=(vertex+1)*attribute.itemSize+component,b=(vertex+2)*attribute.itemSize+component;
            const value=values[a];values[a]=values[b];values[b]=value;
          }
        }
        return geometry;
      });
      const geometry=mergeGeometries(geometries,false);
      for(const temp of geometries)temp.dispose();
      if(!geometry)throw new Error('Ship geometry could not be merged');
      this.geos.add(geometry);this.hull.add(new Mesh(geometry,material));
    }
    for(const geometry of originals)geometry.dispose();
    // 青い排気は薄い外炎と細い芯を重ねる。白い円盤は作らない。
    for(const side of [-1,1]) for(const core of [false,true]) {
      const geo=new ConeGeometry(core?.22:.5,1,16,1,true).rotateX(Math.PI/2).translate(0,0,.5);
      this.geos.add(geo);const flame=new Mesh(geo,core?this.coreMat:this.flameMat);
      flame.position.set(side*2.05,-.33,6.0);flame.userData.core=core;flame.frustumCulled=false;
      this.hull.add(flame);this.flames.push(flame);
    }
    this.group.add(this.hull);
  }

  private addMarkings(add:(geo:BufferGeometry,mat:Material,x?:number,y?:number,z?:number)=>Mesh): void {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle='#b5c1c8';ctx.font='500 38px monospace';ctx.fillText('LYRION / LX-07',12,50);ctx.fillStyle='#778a96';ctx.font='18px monospace';ctx.fillText('DEEP SPACE SURVEY  |  KEEP CLEAR',12,88);}
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;this.textures.push(map);
    const material=new MeshBasicMaterial({map,transparent:true,depthWrite:false,color:new Color(.65,.7,.75)});this.mats.push(material);
    add(new PlaneGeometry(2.5,.625).rotateX(-Math.PI/2),material,0,.948,.6);
  }

  setThrust(level:number,boosting:boolean): void {
    const power=Math.min(1,level+(boosting?.35:0));
    const length=.12+power*(boosting?5.4:3.1);
    for(const flame of this.flames){flame.visible=power>.02;flame.scale.set(1,1,length*(flame.userData.core?.8:1));}
    this.flameMat.opacity=.04+power*.23;this.coreMat.opacity=.06+power*.42;
  }

  setSteering(yaw:number,pitch:number): void {
    for(const jet of this.jets) {
      const push=(jet.userData.front?1:-1)*jet.userData.side*yaw;
      jet.visible=push>.08||Math.abs(pitch)>.35;
      jet.scale.setScalar(.65+Math.min(1,Math.max(push,Math.abs(pitch)))*.5);
    }
  }

  setHullVisible(visible:boolean): void {this.hull.visible=visible;}
  setLandingGear(deployed:boolean,dt:number):void {
    this.gearAmount+=(Number(deployed)-this.gearAmount)*(1-Math.exp(-dt*4));
    for(const leg of this.gear){leg.visible=this.gearAmount>.01;leg.scale.y=Math.max(.01,this.gearAmount);}
  }
  dispose(): void {
    for(const geometry of this.geos)geometry.dispose();for(const material of this.mats)material.dispose();for(const texture of this.textures)texture.dispose();this.group.removeFromParent();
  }
}
