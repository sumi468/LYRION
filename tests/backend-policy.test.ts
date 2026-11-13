import {describe,it,expect} from 'vitest';
import {initializeBackend} from '../src/render/backendPolicy';
describe('Actual renderer initialization gate',()=>{
 it('does not count API presence as a usable GPU',async()=>{
  let attempted=0;const r=await initializeBackend('auto',true,true,{webgpu:async()=>{attempted++;throw new Error('No adapter');},webgl2:async()=>({live:true})});
  expect(attempted).toBe(1);expect(r.backend).toBe('webgl2');expect(r.reason).toContain('No adapter');expect(r.driver.live).toBe(true);
 });
 it('accepts GPU only after asynchronous initialization completes',async()=>{
  const r=await initializeBackend('webgpu',true,true,{webgpu:async()=>{await Promise.resolve();return'initialized';},webgl2:async()=>{throw new Error('Unexpected fallback');}});
  expect(r.backend).toBe('webgpu');expect(r.driver).toBe('initialized');
 });
 it('preserves explicit WebGL and skips unsafe/unavailable GPU contexts',async()=>{
  for(const [mode,secure,api] of [['webgl2',true,true],['auto',false,true],['webgpu',true,false]] as const){
   const r=await initializeBackend(mode,secure,api,{webgpu:async()=>{throw new Error('Should not request device');},webgl2:async()=>42});
   expect(r.backend).toBe('webgl2');expect(r.driver).toBe(42);
  }
 });
});
