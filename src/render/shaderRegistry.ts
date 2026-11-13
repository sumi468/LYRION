import {ShaderMaterial,type ShaderMaterialParameters} from 'three';

export type ShaderProgram='bake'|'planet'|'cloud'|'atmosphere'|'ring'|'sun'|'sky'|'stars'|'dust'|'surface-sky';
const programs=new WeakMap<ShaderMaterial,ShaderProgram>();
let revision=0;

/** Keep the proven GLSL path and its uniform contract. WebGPU prepares native
 * node-material equivalents without changing the owning view's update/dispose API. */
export function sceneShader(program:ShaderProgram,parameters:ShaderMaterialParameters):ShaderMaterial {
  // Explicit logarithmic-depth outputs for the custom GLSL path. NodeMaterial
  // emits its own equivalent. Avoid the common chunk's PI macro in legacy noise.
  const pars='#include <logdepthbuf_pars_vertex>\n';
  const write='\n#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\nvFragDepth=1.0+gl_Position.w;\nvIsPerspective=float(projectionMatrix[2][3]==-1.0);\n#endif\n';
  parameters={...parameters,
    vertexShader:pars+parameters.vertexShader!.replace(/}\s*$/,write+'}'),
    fragmentShader:'#include <logdepthbuf_pars_fragment>\n'+parameters.fragmentShader!.replace(/void main\(\)\s*{/,match=>match+'\n#include <logdepthbuf_fragment>\n')};
  const material=new ShaderMaterial(parameters);programs.set(material,program);revision++;return material;
}
export const shaderProgram=(material:ShaderMaterial):ShaderProgram|undefined=>programs.get(material);
export const shaderRevision=():number=>revision;
