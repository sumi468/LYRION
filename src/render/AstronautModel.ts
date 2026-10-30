import {
  AdditiveBlending, BufferGeometry, CatmullRomCurve3, ConeGeometry, DataTexture,
  EquirectangularReflectionMapping, Float32BufferAttribute, Group, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion,
  RepeatWrapping, RGBAFormat, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3,
  type Material, type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeParts } from './modelParts';
import type { EvaSystem } from '../systems/eva';
import type { QualityProfile } from './quality';

type Section = readonly [y: number, width: number, depth: number, x?: number, z?: number];
type Batch = BufferGeometry[][];
const TAU=Math.PI*2;

/** Tailored elliptical/superelliptical sections, rather than visible primitive limbs.
 * The restrained surface displacement forms broad garment gathers and joint folds. */
function garment(sections: readonly Section[], sides=24, folds=0, amplitude=.012, square=.75): BufferGeometry {
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[];
  const bottom=sections[0][0],height=sections[sections.length-1][0]-bottom;
  // A fold needs several longitudinal samples. Sparse profile rings turn fabric
  // gathers into sharp polygonal cuts, especially under the side lighting.
  const rows:Section[]=[],resolution=Math.min(folds*6,Math.ceil(height/.0125));
  for(let j=0;j<sections.length-1;j++){
    const a=sections[j],b=sections[j+1],steps=Math.max(1,Math.ceil((b[0]-a[0])/height*resolution));
    for(let step=0;step<steps;step++){
      const t=step/steps;
      rows.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,(a[3]??0)+((b[3]??0)-(a[3]??0))*t,(a[4]??0)+((b[4]??0)-(a[4]??0))*t]);
    }
  }
  rows.push(sections[sections.length-1]);
  for(let j=0;j<rows.length;j++){
    const [y,rx,rz,cx=0,cz=0]=rows[j],t=(y-bottom)/Math.max(.001,height);
    for(let k=0;k<=sides;k++){
      const a=k/sides*TAU,c=Math.cos(a),s=Math.sin(a);
      const gather=1+amplitude*Math.sin(t*TAU*folds+.65*Math.sin(a*3))*Math.sin(Math.PI*t);
      vertices.push(cx+Math.sign(c)*Math.abs(c)**square*rx*gather,y,cz+Math.sign(s)*Math.abs(s)**square*rz*gather);
      uv.push(k/sides,t);
    }
  }
  for(let j=0;j<rows.length-1;j++)for(let k=0;k<sides;k++){
    const a=j*(sides+1)+k,b=a+1,c=b+sides+1,d=a+sides+1;indices.push(a,c,b,a,d,c);
  }
  // Closed garment ends; cap normals are smoothed with the shell at their small concealed rims.
  for(const row of [0,rows.length-1]){
    const [y,,,x=0,z=0]=rows[row],middle=vertices.length/3;vertices.push(x,y,z);uv.push(.5,row===0?0:1);
    const offset=row*(sides+1);for(let k=0;k<sides;k++)row===0?indices.push(middle,offset+k,offset+k+1):indices.push(middle,offset+k+1,offset+k);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function rounded(w:number,h:number,d:number,x=0,y=0,z=0,r=.025):BufferGeometry {
  return new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)).translate(x,y,z);
}
function ring(radius:number,tube:number,x=0,y=0,z=0,axis:'y'|'x'|'z'='y'):BufferGeometry {
  const g=new TorusGeometry(radius,tube,5,24);if(axis==='y')g.rotateX(Math.PI/2);if(axis==='x')g.rotateY(Math.PI/2);return g.translate(x,y,z);
}
function hose(points:readonly (readonly [number,number,number])[],radius=.012,steps=20):BufferGeometry {
  return new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),steps,radius,6,false);
}
function helmetShell():BufferGeometry {
  const sections:Section[]=[];
  for(let j=0;j<=16;j++){
    const a=-Math.PI/2+j/16*Math.PI,r=Math.max(.002,Math.cos(a));
    sections.push([.775+Math.sin(a)*.24,r*.249,r*.247,0,.015]);
  }
  return garment(sections,32,0,0,1);
}
function visorPatch(rx:number,ry:number,rz:number,angle:number,vertical:number):BufferGeometry {
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[],nx=24,ny=12;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const a=(i/nx*2-1)*angle,b=(j/ny*2-1)*vertical;
    vertices.push(Math.sin(a)*Math.cos(b)*rx,.775+Math.sin(b)*ry,.015-Math.cos(a)*Math.cos(b)*rz);uv.push(i/nx,j/ny);
  }
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=b+nx+1,d=a+nx+1;indices.push(a,c,b,a,d,c);}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function fabricTextures(): [DataTexture,DataTexture] {
  const size=128,normal=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4);
  let seed=91;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const k=(y*size+x)*4,noise=(seed>>>25)-64;
    normal[k]=128+Math.round(Math.sin(x*Math.PI/2)*5+noise*.035);normal[k+1]=128+Math.round(Math.sin(y*Math.PI/2)*5-noise*.035);normal[k+2]=254;normal[k+3]=255;
    const value=210+Math.round(noise*.14)+(x%4===0||y%4===0?7:0);roughness[k]=roughness[k+1]=roughness[k+2]=value;roughness[k+3]=255;
  }
  const n=new DataTexture(normal,size,size,RGBAFormat),r=new DataTexture(roughness,size,size,RGBAFormat);
  for(const t of [n,r]){t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(5,5);t.magFilter=LinearFilter;t.minFilter=LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;}
  return [n,r];
}
/** A tiny neutral orbital reflection environment, generated once and owned by this model. */
function reflectionTexture():DataTexture {
  const w=128,h=64,data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=y/h,u=x/w,band=Math.exp(-(((v-.56)/.12)**2)),highlight=Math.exp(-(((u-.66)/.13)**2)-(((v-.22)/.09)**2));
    const k=(y*w+x)*4;data[k]=7+band*54+highlight*180;data[k+1]=10+band*69+highlight*180;data[k+2]=16+band*88+highlight*174;data[k+3]=255;
  }
  const texture=new DataTexture(data,w,h,RGBAFormat);texture.mapping=EquirectangularReflectionMapping;texture.colorSpace=SRGBColorSpace;texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

/** Original LX-EVA suit. Human-scale articulated pressure garment with PBR material layers. */
export class AstronautModel {
  readonly group=new Group();
  readonly rig=new Group();
  readonly detail=new Group();
  readonly upperArms:Group[]=[];
  readonly forearms:Group[]=[];
  readonly thighs:Group[]=[];
  readonly shins:Group[]=[];
  visualActive=false;
  boardingAmount=0;
  boardingNearShip=false;
  private geometries=new Set<BufferGeometry>();
  private textures:Texture[]=[];
  private materials:Material[]=[];
  private surfaceMaterials:MeshStandardMaterial[]=[];
  private jets:Mesh[]=[];
  private lastTime:number|null=null;
  private lastActive=false;
  private age=0;
  private closing=0;
  private poseWork=0;
  private movement=new Vector3();
  private inverse=new Quaternion();
  private priorRotation=new Quaternion();
  private disposed=false;

  constructor(){
    this.group.name='LX-EVA pressure suit';this.group.add(this.rig);this.rig.add(this.detail);
    const [normal,roughness]=fabricTextures(),environment=reflectionTexture();this.textures.push(normal,roughness,environment);
    const fabric=new MeshPhysicalMaterial({color:0xe1e0d5,roughness:.94,metalness:0,normalMap:normal,normalScale:new Vector2(.17,.17),roughnessMap:roughness,sheen:.18,sheenRoughness:.95});
    const joint=new MeshStandardMaterial({color:0x8f9693,roughness:.94,normalMap:normal,normalScale:new Vector2(.24,.24)});
    const metal=new MeshStandardMaterial({color:0x8b969a,metalness:.83,roughness:.39,envMap:environment,envMapIntensity:.3});
    const shell=new MeshPhysicalMaterial({color:0xc5cbc8,metalness:.12,roughness:.49,clearcoat:.13,clearcoatRoughness:.3});
    const accent=new MeshStandardMaterial({color:0x3f8b95,roughness:.67,metalness:.14});
    const glass=new MeshPhysicalMaterial({color:0xa18a56,metalness:.93,roughness:.12,clearcoat:1,clearcoatRoughness:.04,envMap:environment,envMapIntensity:1.45});
    const screen=new MeshStandardMaterial({color:0x16272e,roughness:.36,metalness:.22,emissive:0x163c48,emissiveIntensity:.3});
    const luminous=new MeshStandardMaterial({color:0x94c8c5,emissive:0x609f9d,emissiveIntensity:.6,roughness:.48});
    this.surfaceMaterials=[fabric,joint,metal,shell,accent,glass,screen,luminous];this.materials.push(...this.surfaceMaterials);
    const batch=():Batch=>this.surfaceMaterials.map(()=>[]);
    const assemble=(parts:Batch,parent:Group)=>{for(let i=0;i<parts.length;i++)if(parts[i].length){const geometry=mergeParts(parts[i]);this.geometries.add(geometry);parent.add(new Mesh(geometry,this.surfaceMaterials[i]));}};
    const body=batch(),details=batch();
    body[0].push(garment([[-.21,.26,.19],[-.15,.29,.21],[-.05,.30,.22],[.08,.325,.23],[.23,.34,.23],[.36,.335,.20],[.46,.29,.18],[.51,.22,.155]],28,3,.018));
    body[0].push(garment([[-.32,.23,.19],[-.27,.285,.205],[-.20,.285,.21],[-.13,.26,.19]],24,2,.028));
    body[1].push(garment([[.48,.17,.135],[.53,.181,.145],[.57,.17,.14]],24,4,.04),ring(.187,.016,0,.545,0));
    body[2].push(ring(.191,.018,0,.565,0),ring(.265,.012,0,-.15,0).scale(1,1,.75));
    body[3].push(helmetShell());
    body[1].push(visorPatch(.253,.245,.253,1.13,.74));
    body[5].push(visorPatch(.257,.245,.259,1.055,.655));
    // The shell rim, cheek catches and helmet lighting stay appropriately small.
    for(const side of [-1,1]){
      body[2].push(rounded(.05,.06,.07,side*.246,.74,-.015,.01));
      details[3].push(rounded(.075,.07,.15,side*.23,.895,-.085,.018));
      details[7].push(rounded(.05,.024,.018,side*.23,.895,-.165,.006));
    }
    // Display-and-control module with protected switch sockets and two service couplings.
    body[3].push(rounded(.365,.23,.073,0,.245,-.242,.026));body[6].push(rounded(.32,.186,.022,0,.25,-.288,.018));
    details[7].push(rounded(.11,.054,.005,-.065,.29,-.302,.004));
    for(let i=0;i<4;i++){details[2].push(rounded(.029,.022,.016,.035+i*.037,.288,-.31,.004));details[4].push(rounded(.022,.014,.008,-.11+i*.044,.214,-.31,.003));}
    for(const side of [-1,1]){body[2].push(ring(.032,.008,side*.20,.02,-.218,'z'));body[1].push(rounded(.095,.065,.025,side*.20,.02,-.21,.02));}
    // Subtle sewn identity bands, hard shell fasteners and original geometric LYRION insignia.
    details[4].push(rounded(.14,.05,.012,-.17,.421,-.215,.006),rounded(.038,.10,.01,.19,.414,-.211,.003));
    details[2].push(rounded(.011,.055,.007,-.218,.425,-.225,.002),rounded(.045,.011,.007,-.202,.405,-.225,.002));
    for(const x of [-.145,.145])for(const y of [.16,.33])details[2].push(rounded(.013,.013,.009,x,y,-.305,.004));
    // PLSS casing is wrapped by a shaped thermal cover; it is visibly separate from the torso.
    body[3].push(rounded(.52,.72,.28,0,.125,.345,.065));
    body[0].push(garment([[-.26,.23,.135,0,.41],[-.20,.28,.17,0,.41],[0,.29,.17,0,.41],[.31,.28,.16,0,.41],[.47,.235,.13,0,.41]],24,2,.016));
    body[1].push(rounded(.44,.11,.16,0,-.225,.46,.025));
    details[2].push(rounded(.027,.56,.023,-.22,.13,.57,.006),rounded(.027,.56,.023,.22,.13,.57,.006));
    details[4].push(rounded(.21,.035,.01,0,.345,.585,.004));
    for(let i=0;i<6;i++)details[1].push(rounded(.26,.008,.016,0,.10+i*.025,.586,.003));
    details[1].push(hose([[-.23,.00,-.20],[-.34,-.08,-.15],[-.34,-.08,.19],[-.25,.01,.39]],.014),hose([[.23,.01,-.20],[.32,-.04,-.12],[.33,.06,.16],[.25,.13,.36]],.012));
    // Restrained seam piping follows the pressure garment, rather than panel lines on a robot.
    for(const side of [-1,1])details[1].push(hose([[side*.25,-.11,-.17],[side*.29,.08,-.18],[side*.30,.28,-.17],[side*.255,.43,-.12]],.0035,14));
    assemble(body,this.rig);assemble(details,this.detail);

    for(const side of [-1,1]){
      const upper=new Group(),forearm=new Group();upper.position.set(side*.365,.385,.01);upper.add(forearm);forearm.position.y=-.305;this.rig.add(upper);this.upperArms.push(upper);this.forearms.push(forearm);
      const a=batch(),b=batch();
      a[0].push(garment([[-.315,.123,.126],[-.28,.139,.144],[-.24,.147,.151],[-.18,.15,.15],[-.10,.163,.16],[-.035,.17,.16],[.025,.145,.145]],20,4,.045));
      // Terminate the cloth below the bearing's centre, rather than letting
      // the ring cut across the sloped shoulder shell and expose jagged edges.
      a[2].push(ring(.151,.012,0,.025,0));
      b[0].push(garment([[-.28,.095,.102],[-.245,.113,.118],[-.20,.12,.13],[-.13,.13,.133],[-.055,.126,.128]],20,5,.045));
      b[1].push(garment([[-.065,.132,.135],[-.045,.139,.142],[-.025,.130,.134],[-.01,.139,.143],[.009,.130,.133]],20,3,0));
      b[2].push(ring(.101,.012,0,-.267,0),ring(.105,.008,0,-.29,0));
      b[0].push(garment([[-.425,.069,.071,side*.009,-.019],[-.39,.085,.07,0,-.012],[-.34,.092,.064],[-.293,.089,.068]],16,2,.04));
      // Curved mitten fingers have individually rounded tips and a separate opposed thumb.
      for(let finger=0;finger<4;finger++){
        const x=(finger-1.5)*.035,l=.065+(finger===1||finger===2?.022:0);
        b[1].push(garment([[-.425-l,.004,.009,x,-.027],[-.423-l*.8,.016,.019,x,-.029],[-.42-l*.38,.017,.023,x,-.022],[-.405,.018,.025,x,-.006]],10,2,.045));
      }
      b[0].push(garment([[-.39,.008,.015,-side*.108,-.035],[-.36,.035,.031,-side*.114,-.015],[-.326,.036,.033,-side*.09,.002]],12,2,.04));
      b[4].push(rounded(.08,.025,.013,0,-.327,-.068,.004));
      assemble(a,upper);assemble(b,forearm);

      const thigh=new Group(),shin=new Group();thigh.position.set(side*.166,-.235,.015);shin.position.y=-.345;thigh.add(shin);this.rig.add(thigh);this.thighs.push(thigh);this.shins.push(shin);
      const c=batch(),d=batch();
      c[0].push(garment([[-.35,.127,.138],[-.30,.145,.15],[-.23,.15,.16],[-.14,.155,.17],[-.055,.158,.17],[.035,.14,.15]],22,4,.035));
      d[0].push(garment([[-.33,.103,.12],[-.29,.12,.137],[-.22,.132,.145],[-.15,.135,.15],[-.06,.129,.140]],22,5,.042));
      d[1].push(garment([[-.075,.135,.148],[-.045,.143,.155],[-.023,.131,.145],[.001,.142,.154],[.02,.130,.142]],20,3,0));
      // Reinforced boot is a shaped bevelled last with a defined heel, toe cap and outsole.
      d[3].push(rounded(.245,.155,.335,0,-.365,-.064,.055));d[1].push(rounded(.25,.035,.355,0,-.43,-.065,.012),rounded(.235,.07,.14,0,-.37,-.19,.025));
      d[3].push(garment([[-.345,.12,.115,0,.017],[-.30,.127,.123,0,.017],[-.258,.113,.118,0,.015]],20,2,.02));
      for(let j=0;j<4;j++)d[1].push(rounded(.19,.012,.017,0,-.344,-.17+j*.035,.004));
      assemble(c,thigh);assemble(d,shin);
    }
    // Six tiny cold-gas plumes; only jets opposing the current maneuver are visible.
    const jetMaterial=new MeshBasicMaterial({color:0xb3dbe7,transparent:true,opacity:.32,blending:AdditiveBlending,depthWrite:false});this.materials.push(jetMaterial);
    const jetAxes=[new Vector3(1,0,0),new Vector3(-1,0,0),new Vector3(0,1,0),new Vector3(0,-1,0),new Vector3(0,0,1),new Vector3(0,0,-1)];
    const up=new Vector3(0,1,0),q=new Quaternion(),m=new Matrix4();
    const nozzles=batch();
    jetAxes.forEach((axis,i)=>{
      const location=new Vector3(i<2?axis.x*.30:0,i===2?.44:i===3?-.285:.09,i===5?-.255:.50+(i===4?.09:0));
      const nozzle=rounded(.065,.06,.05,0,0,0,.012);q.setFromUnitVectors(up,axis);m.compose(location,q,new Vector3(1,1,1));nozzles[1].push(nozzle.applyMatrix4(m));
      const g=new ConeGeometry(.021,.11,8,1,true).rotateZ(Math.PI).translate(0,.055,0);g.applyQuaternion(q).translate(location.x,location.y,location.z);this.geometries.add(g);const mesh=new Mesh(g,jetMaterial);mesh.name=`LX-EVA RCS ${['+X','-X','+Y','-Y','+Z','-Z'][i]}`;mesh.visible=false;this.jets.push(mesh);this.rig.add(mesh);
    });
    assemble(nozzles,this.rig);
    this.setPose(.016,0,0,false,0);
  }

  private setPose(dt:number,speed:number,work:number,returning:boolean,entry:number):void {
    const blend=1-Math.exp(-dt*7),time=this.lastTime??0;
    for(let i=0;i<2;i++){
      const side=i===0?-1:1;
      const upper=this.upperArms[i],forearm=this.forearms[i],thigh=this.thighs[i],shin=this.shins[i];
      const armX=.13+speed*.16+work*.72+(returning?.12:0)+Math.sin(time*.85+i)*.018;
      upper.rotation.x+=(armX-upper.rotation.x)*blend;
      upper.rotation.z+=(side*(.11+speed*.08+entry*.16)-upper.rotation.z)*blend;
      forearm.rotation.x+=(.36+work*.46+entry*.35-forearm.rotation.x)*blend;
      forearm.rotation.y+=(side*(work*.16)-forearm.rotation.y)*blend;
      thigh.rotation.x+=(.035+speed*.10+Math.sin(time*.65+i)*.018-thigh.rotation.x)*blend;
      thigh.rotation.z+=(side*(.045+work*.025)-thigh.rotation.z)*blend;
      shin.rotation.x+=(-.11-speed*.13-work*.12-shin.rotation.x)*blend;
    }
    this.rig.position.set(entry*.13,-entry*.045+Math.sin(time*.75)*.008,0);
    this.rig.rotation.x+=((returning?-.05:0)+speed*.035-this.rig.rotation.x)*blend;
  }

  update(eva:EvaSystem,working:boolean,time:number,profile:QualityProfile):void {
    const dt=this.lastTime===null?0:Math.max(0,Math.min(.1,time-this.lastTime));this.lastTime=time;
    if(eva.active&&!this.lastActive){this.age=0;this.closing=0;this.boardingAmount=0;this.priorRotation.copy(eva.localRotation);}
    if(!eva.active&&this.lastActive){this.boardingNearShip=eva.position.distanceToSquared(eva.hatchPosition)<=4**2+.01;this.closing=this.boardingNearShip?.45:.15;this.boardingAmount=0;}
    if(eva.active)this.age+=dt;
    else if(this.closing>0){this.closing=Math.max(0,this.closing-dt);this.boardingAmount=1-this.closing/(this.boardingNearShip?.45:.15);}
    this.visualActive=eva.active||this.closing>0;this.group.visible=this.visualActive;
    const opacity=eva.active?1:Math.max(0,1-this.boardingAmount);
    for(const material of this.surfaceMaterials){const transparent=opacity<.995;if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}material.opacity=opacity;}
    this.poseWork+=(Number(working)-this.poseWork)*(1-Math.exp(-dt*5));
    this.movement.copy(eva.localVelocity).applyQuaternion(this.inverse.copy(eva.localRotation).invert());
    const speed=Math.min(1,this.movement.length()/6),turn=this.priorRotation.angleTo(eva.localRotation);this.priorRotation.copy(eva.localRotation);
    this.setPose(dt,speed,this.poseWork,eva.returning,Math.max(0,1-this.age/.55));
    this.detail.visible=profile.belt>=2000;
    const power=eva.active?Math.min(1,eva.thrust+turn*3):0;
    for(let i=0;i<6;i++){
      const axis=i<2?this.movement.x:i<4?this.movement.y:this.movement.z,sign=i%2===0?1:-1;
      this.jets[i].visible=power>.04&&(axis*sign<-.15||(turn>.001&&i<2));
      this.jets[i].scale.setScalar(.8+.2*Math.sin(time*27+i));
    }
    (this.jets[0].material as MeshBasicMaterial).opacity=power*(.2+Math.sin(time*31)*.06);
    this.lastActive=eva.active;
  }
  /** Suitable for deterministic visual inspection without advancing physics. */
  resetPose():void {
    this.age=1;this.poseWork=0;for(let i=0;i<8;i++)this.setPose(.1,0,0,false,0);
  }
  get triangleCount():number {let n=0;for(const g of this.geometries)n+=(g.index?g.index.count:g.getAttribute('position').count)/3;return n;}
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();for(const t of this.textures)t.dispose();
    this.group.removeFromParent();this.group.clear();
  }
}
