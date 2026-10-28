export interface BuildInfo { version: string; sourceRevision: string; sourceHash: string; uncommittedChanges: boolean; builtAt: string }
declare const __LYRION_BUILD__: BuildInfo;
export const BUILD_INFO: BuildInfo = typeof __LYRION_BUILD__==='undefined'
  ? {version:'development',sourceRevision:'unavailable',sourceHash:'not-built',uncommittedChanges:true,builtAt:''}
  : __LYRION_BUILD__;
