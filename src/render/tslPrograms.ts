import {Texture,type ShaderMaterial} from 'three';
import {LineBasicNodeMaterial,MeshBasicNodeMaterial,PointsNodeMaterial,type NodeMaterial} from 'three/webgpu';
import {abs,acos,atan,cameraPosition,cameraProjectionMatrix,cross,dFdx,dFdy,dot,exp,float,floor,fract,length,max,min,mix,modelViewMatrix,modelWorldMatrix,normalView,normalize,positionLocal,positionView,positionWorld,pow,sign,sin,smoothstep,step,texture,uniform,uv,vec2,vec3,vec4,attribute,viewportSize} from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type {ShaderProgram} from './shaderRegistry';

type F=Node<'float'>;
type V=Node<'vec3'>;
interface UniformTypes{
 uUp:'vec3';uSun:'vec3';uOpacity:'float';
 uSeed:'float';uC0:'vec3';uC1:'vec3';uC2:'vec3';uSea:'float';uSunDirV:'vec3';uSunDirW:'vec3';uSunColor:'vec3';uAmbient:'vec3';uBump:'float';uSpec:'float';uLava:'float';uTwilight:'float';uRingIn:'float';uRingOut:'float';uRingInv:'mat3';uCloudOffset:'float';uOffset:'float';uCenter:'vec3';uRp:'float';uRa:'float';uColor:'vec3';uSunset:'vec3';uStrength:'float';uPlanetR:'float';uTime:'float';uCore:'vec3';uEdge:'vec3';uBright:'float';uScale:'float';uBox:'float';uCamMod:'vec3';uVel:'vec3';uStreak:'float';uAlpha:'float';
}
interface Binding{set(value:unknown):void;name:string}
export interface NativeShader{material:NodeMaterial;sync():void;dispose():void}
const PI=Math.PI;

function hash(p:V):F{return fract(sin(dot(p,vec3(127.1,311.7,74.7))).mul(43758.5453123));}
function noise(p:V):F{
 const i=floor(p),f=fract(p),w=f.mul(f).mul(float(3).sub(f.mul(2)));
 const a=mix(hash(i),hash(i.add(vec3(1,0,0))),w.x),b=mix(hash(i.add(vec3(0,1,0))),hash(i.add(vec3(1,1,0))),w.x);
 const c=mix(hash(i.add(vec3(0,0,1))),hash(i.add(vec3(1,0,1))),w.x),d=mix(hash(i.add(vec3(0,1,1))),hash(i.add(vec3(1,1,1))),w.x);
 return mix(mix(a,b,w.y),mix(c,d,w.y),w.z);
}
function fbm(p:V,count=5):F{let sum:F=float(0),q=p,weight=.5;for(let i=0;i<count;i++){sum=sum.add(noise(q).mul(weight));q=q.mul(2.03).add(vec3(.17,.31,.11));weight*=.5;}return sum;}

/** Native TSL equivalents of every registered scene shader. Original ShaderMaterial
 * uniforms remain owned by the existing views; this binding is the renderer boundary. */
export function nativeShader(kind:ShaderProgram,source:ShaderMaterial,fallback:Texture):NativeShader{
 const bindings:Binding[]=[],values:Record<string,Node>={};
 for(const [name,entry] of Object.entries(source.uniforms)){
  if(name.toLowerCase().includes('tex')||name==='uMap'||name==='uSky'){
   const n=texture(entry.value instanceof Texture?entry.value:fallback);values[name]=n;
   bindings.push({name,set:value=>{n.value=value instanceof Texture?value:fallback;}});
  }else{
   const initial:unknown=entry.value;
   const makeUniform=uniform as unknown as (value:unknown)=>Node;
   const n=makeUniform(initial??0);values[name]=n;
   const writable=n as unknown as {value:unknown};bindings.push({name,set:value=>{writable.value=value;}});
  }
 }
 const u=<K extends keyof UniformTypes>(name:K):Node<UniformTypes[K]>=>values[name] as Node<UniformTypes[K]>;
 // Texture nodes must keep their mutable binding; sampling a newly captured
 // Texture would keep the pre-bake placeholder forever.
 const tex=(name:string,coord:Node<'vec2'>=uv()):Node<'vec4'>=>{
  const t=values[name] as unknown as ReturnType<typeof texture>;
  return t.sample(coord) as unknown as Node<'vec4'>;
 };
 const material:NodeMaterial=kind==='dust'?new LineBasicNodeMaterial():kind==='stars'?new PointsNodeMaterial():new MeshBasicNodeMaterial();
 material.name=`LYRION ${kind} / TSL`;material.side=source.side;material.transparent=source.transparent;material.depthTest=source.depthTest;material.depthWrite=source.depthWrite;
 material.blending=source.blending;material.toneMapped=source.toneMapped;material.opacity=source.opacity;
 // Custom GLSL opts out of scene fog. Node materials default to fog=true;
 // retaining that default turns the orbital shell into an opaque fog overlay.
 material.fog=source.fog;
 let color:V=vec3(0),alpha:F=float(1);
 const n=normalize(normalView),view=normalize(positionView.negate());

 if(kind==='bake'){
  const program=Number(source.defines.PROGRAM),p=vec3(sin(uv().x.mul(2*PI)).mul(sin(uv().y.mul(PI))),uv().y.mul(PI).cos(),uv().x.mul(2*PI).cos().mul(sin(uv().y.mul(PI))));
  const seed=u('uSeed'),q=p.mul(3.2).add(vec3(seed.mul(.13),seed.mul(.07),seed.mul(.19))),h=fbm(q);
  if(program===10){
   const nebula=fbm(p.mul(3.8).add(vec3(4,7,2)),5),filament=pow(max(float(0),float(.52).sub(abs(p.y.add(p.x.mul(.35)).add(p.z.mul(.18))))),3);
   color=mix(vec3(.008,.012,.024),mix(vec3(.10,.045,.14),vec3(.035,.13,.16),noise(p.mul(5))),nebula).add(filament.mul(nebula).mul(.45));
  }else if(program===6){
   // Coverage is the occupied fraction, so both backends threshold at 1-sea.
   // The former inverted threshold made PRIME's 40% cover nearly opaque.
   const cloud=fbm(p.mul(5).add(vec3(seed.mul(.13))),5).mul(.78).add(fbm(p.mul(13).add(vec3(seed.mul(.37))),4).mul(.22));
   alpha=smoothstep(float(1).sub(u('uSea')).sub(.14),float(1).sub(u('uSea')).add(.08),cloud);color=vec3(1);
  }
  else if(program===3){const bands=sin(p.y.mul(38).add(fbm(p.mul(7)).mul(5))).mul(.5).add(.5);color=mix(u('uC0'),u('uC1'),bands).mul(.7).add(u('uC2').mul(pow(h,3)));alpha=h;}
  else {
   color=mix(u('uC0'),u('uC1'),smoothstep(.2,.7,h));color=mix(color,u('uC2'),smoothstep(.6,.9,h));alpha=h;
   if(program===1){const coast=smoothstep(u('uSea').sub(.02),u('uSea').add(.025),h);const land=mix(u('uC1'),u('uC2'),smoothstep(.6,.85,h));color=mix(u('uC0').mul(.55).add(vec3(.005,.02,.035)),land,coast);}
   if(program===2||program===4){const crater=pow(float(1).sub(noise(q.mul(14))),12);color=color.mul(float(1).sub(crater.mul(.3)));}
   if(program===5){const fissure=pow(float(1).sub(abs(noise(q.mul(9)).sub(.5)).mul(2)),20);color=color.add(vec3(1,.12,.01).mul(fissure.mul(.6)));}
  }
  material.toneMapped=false;
 }else if(kind==='planet'){
  const t=tex('uMap'),albedo=t.rgb,h=t.a,l=normalize(u('uSunDirV')),geo=dot(n,l);
  const dx=dFdx(positionView),dy=dFdy(positionView),r1=cross(dy,n),r2=cross(n,dx),det=dot(dx,r1),grad=r1.mul(dFdx(h)).add(r2.mul(dFdy(h))).mul(sign(det));
  const bumped=normalize(n.mul(abs(det)).sub(grad.mul(u('uBump'))));
  const normal=u('uBump').greaterThan(0).select(bumped,n),diff=max(dot(normal,l),0).mul(smoothstep(-.04,.1,geo));
  let shadow:F=float(1);
  if('USE_CLOUDSHADOW' in source.defines)shadow=shadow.mul(float(1).sub(tex('uCloudTex',vec2(uv().x.add(u('uCloudOffset')),uv().y)).a.mul(.5)));
  if('USE_RING' in source.defines){
   const pr=u('uRingInv').mul(modelWorldMatrix.mul(vec4(positionLocal,0)).xyz),ls=normalize(u('uRingInv').mul(u('uSunDirW'))),safe=sign(ls.y).mul(max(abs(ls.y),.001));
   const distance=pr.y.negate().div(safe),hit=pr.add(ls.mul(distance)),coordinate=length(hit.xz).sub(u('uRingIn')).div(u('uRingOut').sub(u('uRingIn')));
   const casts=distance.greaterThan(0).and(coordinate.greaterThan(0)).and(coordinate.lessThan(1)).and(abs(ls.y).greaterThan(.001));
   shadow=shadow.mul(float(1).sub(casts.select(tex('uRingTex',vec2(coordinate,.5)).a.mul(.85),float(0))));
  }
  color=albedo.mul(u('uSunColor').mul(diff).mul(shadow).add(u('uAmbient')));
  const twilight=smoothstep(-.3,0,geo).mul(float(1).sub(smoothstep(0,.22,geo)));color=color.add(albedo.mul(vec3(1,.42,.18)).mul(twilight).mul(u('uTwilight')).mul(.35));
  const water=float(1).sub(smoothstep(u('uSea').add(.002),u('uSea').add(.016),h)),half=normalize(l.add(view));
  const spec=pow(max(dot(normal,half),0),120).mul(water).mul(u('uSpec')).mul(smoothstep(0,.2,geo));
  color=color.add(u('uSea').greaterThanEqual(0).select(u('uSunColor').mul(spec).mul(.8).mul(shadow),vec3(0)));
  const fresnel=pow(float(1).sub(max(dot(normal,view),0)),5).mul(water).mul(u('uSpec')).mul(.12);
  color=color.add(u('uSea').greaterThanEqual(0).select(vec3(.12,.25,.42).mul(fresnel).mul(smoothstep(-.1,.2,geo)),vec3(0)));
  color=color.add(albedo.mul(float(1).sub(smoothstep(.08,.2,h))).mul(u('uLava')));
  if('USE_CITY' in source.defines){const cell=uv().mul(vec2(620,310)),district=floor(cell.div(5)),settlement=step(.9,fract(sin(dot(district,vec2(127.1,311.7))).mul(43758.5453)));const lamp=fract(cell).sub(.5),lights=exp(dot(lamp,lamp).mul(-48)).mul(settlement),land=smoothstep(u('uSea').add(.018),u('uSea').add(.05),h).mul(float(1).sub(smoothstep(.8,.88,h)));color=color.add(vec3(1,.65,.25).mul(lights).mul(land).mul(float(1).sub(smoothstep(-.25,.05,geo))).mul(.75));}
 }else if(kind==='cloud'){
  const t=tex('uMap',vec2(uv().x.add(u('uOffset')),uv().y)),lit=max(dot(n,normalize(u('uSunDirV'))),0);
  color=t.rgb.mul(u('uSunColor').mul(lit).add(u('uAmbient')));alpha=t.a.mul(.72);
 }else if(kind==='atmosphere'){
  const oc=cameraPosition.sub(u('uCenter')),rd=normalize(positionWorld.sub(cameraPosition)),tc=dot(oc,rd).negate(),b2=dot(oc,oc).sub(tc.mul(tc));
  const ra=u('uRa'),rp=u('uRp'),half=ra.mul(ra).sub(b2).max(0).sqrt(),start=max(tc.sub(half),0);
  const end=min(tc.add(half),b2.lessThan(rp.mul(rp)).select(tc.sub(max(rp.mul(rp).sub(b2),0).sqrt()),tc.add(half))),distance=max(end.sub(start),0),height=ra.sub(rp).mul(.38),dt=distance.div(4);
  let acc:V=vec3(0);
  for(let i=0;i<4;i++){const p=oc.add(rd.mul(start.add(dt.mul(i+.5)))),alt=max(length(p).sub(rp),0),density=exp(alt.negate().div(height)),mu=dot(normalize(p),u('uSunDirW')),lit=smoothstep(-.22,.35,mu),warm=float(1).sub(smoothstep(0,.45,abs(mu.add(.04))));acc=acc.add(mix(u('uColor'),u('uSunset'),warm.mul(.85)).mul(density).mul(lit).mul(dt));}
  color=vec3(1).sub(exp(acc.mul(u('uStrength')).mul(-.075).div(height)));material.toneMapped=false;
 }else if(kind==='ring'){
  const local=positionLocal.xy,r=length(local),coordinate=r.sub(u('uRingIn')).div(u('uRingOut').sub(u('uRingIn'))),t=tex('uRingTex',vec2(coordinate,.5));
  const sun=u('uRingInv').mul(u('uSunDirW')),p=vec3(local.x,0,local.y),along=dot(p,sun),closest=length(p.sub(sun.mul(along)));
  const shadow=along.lessThan(0).and(closest.lessThan(u('uPlanetR'))).select(float(.14),float(1));
  color=t.rgb.mul(u('uSunColor')).mul(float(.28).add(abs(sun.y).mul(.72))).mul(shadow);alpha=t.a;
 }else if(kind==='sun'){
  const p=normalize(positionLocal),time=u('uTime').mul(.04),gran=fbm(p.mul(7).add(vec3(time,time.mul(-.7),time.mul(.5)))),cell=noise(p.mul(18).add(vec3(0,time.mul(2),0))),spots=smoothstep(.58,.72,noise(p.mul(2.6).add(vec3(5,time.mul(.3),1))));
  color=mix(u('uEdge'),u('uCore'),smoothstep(.25,.8,mix(gran,cell,.3))).mul(float(1).sub(spots.mul(.55))).mul(float(.32).add(pow(max(dot(n,view),0),.6).mul(.68))).mul(1.45);
 }else if(kind==='sky'){
  const direction=normalize(positionLocal),coordinates=vec2(fract(atan(direction.z,direction.x.negate()).div(2*PI)),float(1).sub(acos(direction.y.clamp(-1,1)).div(PI)));
  color=tex('uSky',coordinates).rgb.mul(u('uBright'));
 }else if(kind==='surface-sky'){
  material.depthNode=float(1);
  const d=normalize(positionLocal),height=dot(d,u('uUp')),day=smoothstep(-.18,.12,dot(u('uUp'),u('uSun')));
  color=mix(vec3(.005,.009,.023),mix(vec3(.50,.65,.76),vec3(.055,.25,.53),pow(max(0,height),.45)),day);
  const warm=float(1).sub(smoothstep(.02,.45,abs(dot(u('uUp'),u('uSun'))))).mul(float(1).sub(smoothstep(0,.5,abs(height))));
  color=mix(color,vec3(.72,.30,.12),warm.mul(.55)).add(vec3(1,.88,.65).mul(smoothstep(.99986,.99995,dot(d,u('uSun')))).mul(day));alpha=u('uOpacity');
 }else if(kind==='stars'){
  // The bridge supplies instanced quads so bright stars keep their soft multi-pixel footprint.
  const centre=attribute('starCentre','vec3'),magnitude=attribute('aMag','float'),clip=cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(centre,1)));
  const pixels=float(1.2).add(magnitude.mul(2.6)).mul(u('uScale'));
  material.vertexNode=clip.add(vec4(positionLocal.xy.mul(pixels).div(viewportSize.xy).mul(clip.w).mul(2),0,0));
  const fall=pow(smoothstep(.5,0,length(uv().sub(.5))),2);color=attribute('aColor','vec3').mul(float(.25).add(magnitude.mul(1.15))).mul(fall);
 }else if(kind==='dust'){
  const end=attribute('aEnd','float'),base=attribute('aSeed','vec3').mul(u('uBox')),p=base.sub(u('uCamMod')).mod(u('uBox')).sub(u('uBox').mul(.5));
  const fade=float(1).sub(smoothstep(.55,1,length(p).div(u('uBox').mul(.5)))).mul(smoothstep(2,14,length(p))).mul(float(1).sub(end.mul(.8)));
  material.positionNode=p.add(u('uVel').mul(u('uStreak')).mul(end));color=vec3(.72,.84,1).mul(fade).mul(u('uAlpha'));
 }
 material.fragmentNode=vec4(color,alpha);
 let version=source.version;
 return{material,sync(){for(const b of bindings)b.set(source.uniforms[b.name]?.value);if(version!==source.version){version=source.version;material.side=source.side;material.needsUpdate=true;}},dispose(){material.dispose();}};
}
