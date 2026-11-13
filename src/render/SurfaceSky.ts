import {BackSide,Color,FogExp2,Mesh,Scene,SphereGeometry,Vector3,Quaternion,type PerspectiveCamera} from 'three';
import {sceneShader} from './shaderRegistry';
import type {BodyDef} from '../data/types';
const direction=new Vector3();
/** Altitude/sun-dependent sky over the actual curved world, with a continuous
 * optical-depth blend back into the orbital atmosphere and star field. */
export class SurfaceSky{
 readonly mesh:Mesh;
 private readonly material=sceneShader('surface-sky',{
  side:BackSide,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
  uniforms:{uUp:{value:new Vector3(0,1,0)},uSun:{value:new Vector3(1,0,0)},uOpacity:{value:0}},
  vertexShader:'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`varying vec3 vDirection;uniform vec3 uUp;uniform vec3 uSun;uniform float uOpacity;
  void main(){vec3 d=normalize(vDirection);float h=dot(d,uUp);float daylight=smoothstep(-.18,.12,dot(uUp,uSun));
  vec3 sky=mix(vec3(.50,.65,.76),vec3(.055,.25,.53),pow(max(0.,h),.45));
  sky=mix(vec3(.005,.009,.023),sky,daylight);float warm=(1.-smoothstep(.02,.45,abs(dot(uUp,uSun))))*(1.-smoothstep(0.,.5,abs(h)));
  sky=mix(sky,vec3(.72,.30,.12),warm*.55);float disc=smoothstep(.99986,.99995,dot(d,uSun));sky+=vec3(1.,.88,.65)*disc*daylight;
  gl_FragColor=vec4(sky,uOpacity);gl_FragDepth=1.0;}`
 });
 private readonly fog=new FogExp2(new Color(.48,.63,.74),.000045);
 constructor(){this.mesh=new Mesh(new SphereGeometry(800,32,16),this.material);this.mesh.renderOrder=-8;this.mesh.frustumCulled=false;}
 update(scene:Scene,camera:PerspectiveCamera,world:Vector3,center:Vector3,body:BodyDef,sun:Vector3):void{
  const altitude=world.distanceTo(center)-body.radius,opacity=Math.max(0,Math.min(1,Math.exp(-Math.max(0,altitude)/35000)));
  this.mesh.visible=opacity>.003;this.mesh.position.copy(camera.position);this.mesh.quaternion.copy(identity);
  direction.copy(world).sub(center).normalize();this.material.uniforms.uUp.value.copy(direction);this.material.uniforms.uSun.value.copy(sun).sub(center).normalize();this.material.uniforms.uOpacity.value=opacity;
  const day=Math.max(.03,Math.min(1,direction.dot(this.material.uniforms.uSun.value)*3+.3));this.fog.color.setRGB(.48*day,.63*day,.74*day);this.fog.density=.000045*opacity;
  scene.fog=opacity>.03?this.fog:null;
 }
 dispose(){this.mesh.geometry.dispose();this.material.dispose();}
}
const identity=new Quaternion();
