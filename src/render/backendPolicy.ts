export type RendererPreference='auto'|'webgpu'|'webgl2';
export type RendererBackend='webgpu'|'webgl2';
export interface BackendChoice<T>{driver:T;backend:RendererBackend;reason:string|null}
export interface BackendFactories<T>{webgpu:()=>Promise<T>;webgl2:()=>Promise<T>}

/** Capability flags only permit an attempt. A successful adapter/device/renderer
 * initialization is required before a WebGPU choice is returned. */
export async function initializeBackend<T>(preference:RendererPreference,secure:boolean,hasApi:boolean,factories:BackendFactories<T>):Promise<BackendChoice<T>>{
  let reason:string|null=null;
  if(preference!=='webgl2'){
    if(!secure)reason='WebGPUにはHTTPSまたはlocalhostが必要です。WebGL 2で起動します';
    else if(!hasApi)reason='この環境にはWebGPUがないため、WebGL 2で起動します';
    else {
      try{return{driver:await factories.webgpu(),backend:'webgpu',reason:null};}
      catch(error){reason=`WebGPUの初期化に失敗したためWebGL 2へ切り替えました：${error instanceof Error?error.message:String(error)}`;}
    }
  }
  return{driver:await factories.webgl2(),backend:'webgl2',reason};
}
