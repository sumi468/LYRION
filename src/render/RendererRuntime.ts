import {WebGLRenderer,UnsignedByteType,type Camera,type ColorRepresentation,type RenderTarget,type Scene,type ToneMapping,type WebGLRenderTarget} from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import type {ShaderBridge} from './ShaderBridge';
import {initializeBackend,type RendererBackend,type RendererPreference} from './backendPolicy';

export interface RendererStatus{backend:RendererBackend;requested:RendererPreference;reason:string|null;adapter:string;hardware:boolean|null}
type Driver=WebGLRenderer|WebGPURenderer;
interface DriverInit{native:Driver;canvas:HTMLCanvasElement;bridge:ShaderBridge|null;device:GPUDevice|null;adapter:string;hardware:boolean|null}

/** One lifecycle/size/target/statistics boundary for both actual rendering APIs. */
export class RendererRuntime{
 readonly status:RendererStatus;
 readonly domElement:HTMLCanvasElement;
 readonly device:GPUDevice|null;
 readonly capabilities={getMaxAnisotropy:():number=>this.gl?this.gl.capabilities.getMaxAnisotropy():(this.native as WebGPURenderer).getMaxAnisotropy()};
 private readonly native:Driver;
 private readonly gl:WebGLRenderer|null;
 private readonly bridge:ShaderBridge|null;
 private disposed=false;
 private failed=false;
 private readonly gpuInfo={render:{calls:0,triangles:0,points:0,lines:0},memory:{geometries:0,textures:0}};
 onFailure:((message:string)=>void)|null=null;

 private constructor(init:DriverInit,requested:RendererPreference,backend:RendererBackend,reason:string|null){
  this.native=init.native;this.domElement=init.canvas;this.bridge=init.bridge;this.device=init.device;this.gl=backend==='webgl2'?init.native as WebGLRenderer:null;
  this.status={requested,backend,reason,adapter:init.adapter,hardware:init.hardware};
  if(backend==='webgpu'){
   const gpu=init.native as WebGPURenderer;gpu.info.autoReset=false;gpu.onDeviceLost=info=>this.failure(`WebGPUデバイスを失いました：${info.message}`);
   // Three intentionally ignores an externally destroyed device. Our lifecycle
   // must also recover from that loss, except during our own disposal.
   void this.device!.lost.then(info=>this.failure(`WebGPUデバイスを失いました：${info.message||info.reason}`));
   this.device!.addEventListener('uncapturederror',event=>this.failure(`WebGPU描画エラー：${event.error.message}`));
  }
 }
 static async create(initialCanvas:HTMLCanvasElement,preference:RendererPreference,antialias:boolean):Promise<RendererRuntime>{
  let canvas=initialCanvas;
  const choice=await initializeBackend<DriverInit>(preference,window.isSecureContext,!!navigator.gpu,{
   webgpu:async()=>{
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('使用できるGPUアダプターがありません');
    const device=await adapter.requestDevice({requiredFeatures:adapter.features.has('timestamp-query')?['timestamp-query']:[]});
    let native:WebGPURenderer|null=null;
    try{
     const [{WebGPURenderer:Gpu},{ShaderBridge:Bridge}]=await Promise.all([import('three/webgpu'),import('./ShaderBridge')]);
     native=new Gpu({canvas,antialias,device,trackTimestamp:true,logarithmicDepthBuffer:true,outputBufferType:UnsignedByteType});
     native.onDeviceLost=()=>{};await native.init();
     if(!('isWebGPUBackend' in native.backend))throw new Error('GPU初期化で別のバックエンドが選ばれました');
     const info=adapter.info,label=[info.vendor,info.architecture,info.description].filter(Boolean).join(' / ');
     return{native,canvas,bridge:new Bridge(),device,adapter:label,hardware:label? !/swiftshader|software|llvmpipe/i.test(label):null};
    }catch(error){native?.dispose();device.destroy();const replacement=canvas.cloneNode(false) as HTMLCanvasElement;canvas.replaceWith(replacement);canvas=replacement;throw error;}
   },
   webgl2:async()=>{
    const native=new WebGLRenderer({canvas,antialias,powerPreference:'high-performance',stencil:false,logarithmicDepthBuffer:true});
    const gl=native.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info'),label=extension?String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)):String(gl.getParameter(gl.RENDERER));
    return{native,canvas,bridge:null,device:null,adapter:label,hardware:!/swiftshader|software|llvmpipe|basic render/i.test(label)};
   }
  });
  return new RendererRuntime(choice.driver,preference,choice.backend,choice.reason);
 }
 private failure(message:string):void{if(this.disposed||this.failed)return;this.failed=true;this.onFailure?.(message);}
 get info(){return this.gl?this.gl.info:this.gpuInfo;}
 get autoClear(){return this.native.autoClear;}set autoClear(v:boolean){this.native.autoClear=v;}
 get outputColorSpace(){return this.native.outputColorSpace;}set outputColorSpace(v:string){this.native.outputColorSpace=v;}
 get toneMapping(){return this.native.toneMapping;}set toneMapping(v:ToneMapping){this.native.toneMapping=v;}
 get toneMappingExposure(){return this.native.toneMappingExposure;}set toneMappingExposure(v:number){this.native.toneMappingExposure=v;}
 setClearColor(color:ColorRepresentation,alpha=1):void{this.native.setClearColor(color,alpha);}
 setPixelRatio(value:number):void{this.native.setPixelRatio(value);}
 setSize(width:number,height:number,style=false):void{this.native.setSize(width,height,style);}
 getRenderTarget():RenderTarget|null{return this.native.getRenderTarget();}
 setRenderTarget(target:RenderTarget|null):void{if(this.gl)this.gl.setRenderTarget(target as WebGLRenderTarget|null);else(this.native as WebGPURenderer).setRenderTarget(target);}
 getContext():WebGL2RenderingContext{if(!this.gl)throw new Error('現在の描画方式はWebGPUです');return this.gl.getContext() as WebGL2RenderingContext;}
 render(scene:Scene,camera:Camera):void{
  if(this.disposed||this.failed)return;
  if(this.bridge){this.bridge.prepare(scene);(this.native as WebGPURenderer).info.reset();}
  try{this.native.render(scene,camera);}catch(error){if(this.gl)throw error;this.failure(error instanceof Error?error.message:String(error));throw error;}
  if(!this.gl){const info=(this.native as WebGPURenderer).info;this.gpuInfo.render.calls=info.render.drawCalls;this.gpuInfo.render.triangles=info.render.triangles;this.gpuInfo.render.points=info.render.points;this.gpuInfo.render.lines=info.render.lines;this.gpuInfo.memory.geometries=info.memory.geometries;this.gpuInfo.memory.textures=info.memory.textures;}
 }
 async gpuTime():Promise<number|null>{if(this.gl)return null;const native=this.native as WebGPURenderer;await native.resolveTimestampsAsync();return native.info.render.timestamp;}
 dispose():void{if(this.disposed)return;this.disposed=true;this.bridge?.dispose();this.native.dispose();this.device?.destroy();}
}
