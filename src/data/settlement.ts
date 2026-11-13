import type {SolidBox} from './homeworld';

export const SETTLEMENT_NAME='PORT LYRA';
export const PAD_RADIUS=16;
export const PAD_LANDING_RADIUS=8;
export const SETTLEMENT_FLAT_RADIUS=1820;
export const CITY_COLLISION_RANGE=2600;
export function cityLandingRestricted(x:number,z:number):boolean{return x>-1030&&x<1030&&z< -105&&z> -1530;}
export interface SettlementBuilding {
 id:string; district:'civic'|'habitat'|'research'|'industry'; x:number; z:number; w:number; d:number; floors:number;
}
// Metres in the same rotating surface frame as PAD 01. The port remains an
// open apron; the denser town begins beyond the pedestrian/service boundary.
const portBuildings:SettlementBuilding[]=[
 {id:'administration',district:'civic',x:-42,z:-156,w:36,d:28,floors:5},
 {id:'medical',district:'civic',x:42,z:-156,w:32,d:28,floors:3},
 {id:'exchange',district:'civic',x:-51,z:-229,w:42,d:34,floors:7},
 {id:'transit',district:'civic',x:53,z:-225,w:38,d:40,floors:4},
 {id:'civic-tower',district:'civic',x:-50,z:-332,w:30,d:34,floors:13},
 {id:'archive',district:'civic',x:48,z:-335,w:34,d:32,floors:8},
 {id:'hab-a1',district:'habitat',x:145,z:-153,w:28,d:32,floors:6},
 {id:'hab-a2',district:'habitat',x:211,z:-153,w:28,d:32,floors:7},
 {id:'hab-b1',district:'habitat',x:145,z:-231,w:28,d:40,floors:9},
 {id:'hab-b2',district:'habitat',x:211,z:-231,w:28,d:40,floors:8},
 {id:'hab-c1',district:'habitat',x:143,z:-335,w:30,d:34,floors:10},
 {id:'hab-c2',district:'habitat',x:211,z:-335,w:30,d:34,floors:11},
 {id:'hab-d1',district:'habitat',x:144,z:-417,w:30,d:34,floors:7},
 {id:'hab-d2',district:'habitat',x:211,z:-417,w:30,d:34,floors:6},
 {id:'lab-a',district:'research',x:-144,z:-150,w:36,d:30,floors:3},
 {id:'lab-b',district:'research',x:-144,z:-226,w:36,d:36,floors:4},
 {id:'observatory',district:'research',x:-146,z:-332,w:38,d:38,floors:5},
 {id:'bio-lab',district:'research',x:-146,z:-416,w:38,d:30,floors:3},
 {id:'freight-a',district:'industry',x:-262,z:-151,w:42,d:38,floors:2},
 {id:'freight-b',district:'industry',x:-262,z:-227,w:42,d:38,floors:2},
 {id:'water-plant',district:'industry',x:-261,z:-332,w:40,d:36,floors:3},
 {id:'power-control',district:'industry',x:-262,z:-416,w:40,d:30,floors:2},
 {id:'community',district:'civic',x:-50,z:-418,w:36,d:30,floors:4},
 {id:'food-market',district:'civic',x:48,z:-418,w:36,d:30,floors:3},
];
/** Planned blocks leave continuous streets, sidewalks and civic squares.
 * Stable IDs and integer generation keep every load/save on the same city. */
const cityBuildings:SettlementBuilding[]=[];
for(let col=0;col<10;col++)for(let row=0;row<5;row++){
 const cx=-900+col*200,cz=-600-row*200;
 if((col===4||col===5)&&row===2)continue; // Central park and transit square.
 const district:SettlementBuilding['district']=col<2?'industry':col<4?'research':col<6?'civic':'habitat';
 for(let sx=0;sx<2;sx++)for(let sz=0;sz<2;sz++){
  const seed=col*47+row*17+sx*7+sz*3;
  cityBuildings.push({id:`city-${col}-${row}-${sx}-${sz}`,district,x:cx+(sx?43:-43),z:cz+(sz?43:-43),
   w:district==='industry'?70:46+seed%4*4,d:district==='industry'?66:48+seed%3*5,
   floors:district==='industry'?3+seed%4:district==='research'?5+seed%9:district==='civic'?18+seed%21:10+seed%24});
 }
}
for(const side of [-1,1])for(let col=0;col<3;col++)for(let row=0;row<2;row++)for(const dz of [-36,36]){
 cityBuildings.push({id:`waterfront-${side}-${col}-${row}-${dz}`,district:side<0?'research':'habitat',x:side*(450+col*200),z:-190-row*200+dz,w:60,d:45,floors:6+col*4+row*3});
}
Object.assign(cityBuildings.find(b=>b.id==='city-5-3-0-1')!,{id:'lyra-spire',floors:58});
Object.assign(cityBuildings.find(b=>b.id==='city-4-3-1-1')!,{id:'orbital-exchange',floors:46});
export const SETTLEMENT_BUILDINGS:readonly SettlementBuilding[]=[...portBuildings,...cityBuildings];
export const CITY_STOPS=[
 {id:'port',name:'宇宙港 / PAD 01',x:-22,z:-74,detail:'LX-07への搭乗、地上本部、修理・補給'},
 {id:'civic',name:'行政・商業センター',x:-18,z:-505,detail:'任務の受注・報告、タワー群と大通り'},
 {id:'market',name:'セントラルパーク / マーケット',x:18,z:-1000,detail:'公園、商業広場、都市の展望'},
 {id:'habitat',name:'東部住宅街',x:618,z:-905,detail:'集合住宅、緑道、コミュニティ施設'},
 {id:'research',name:'研究キャンパス',x:-582,z:-905,detail:'観測アーカイブ、機体アップグレード'},
 {id:'industry',name:'西部物流・エネルギー港',x:-982,z:-1305,detail:'倉庫街と発電施設、LX-07の遠隔補給'},
] as const;
export function cityDistrict(x:number,z:number):string{
 if(z> -110)return '宇宙港 / PAD 01';
 if(x< -650)return '物流・エネルギー区';if(x< -250)return '研究キャンパス';if(x>250)return '東部住宅街';
 return z< -850&&z> -1100?'セントラルパーク':'行政・商業センター';
}
export const BUILDING_FLOOR_HEIGHT=3.6;
export const SETTLEMENT_ROADS:readonly {x:number;z:number;w:number;d:number}[]=[
 {x:0,z:-263,w:12,d:374}, {x:96,z:-263,w:10,d:374},
 {x:-96,z:-263,w:10,d:374}, {x:-205,z:-263,w:10,d:374}, {x:264,z:-263,w:10,d:374},
 {x:-26,z:-100,w:598,d:10}, {x:-26,z:-190,w:598,d:10},
 {x:-26,z:-280,w:598,d:12}, {x:-26,z:-375,w:598,d:10}, {x:-26,z:-456,w:598,d:10},
 ...Array.from({length:11},(_,i)=>({x:-1000+i*200,z:-1000,w:i===5?24:14,d:1010})),
 ...Array.from({length:6},(_,i)=>({x:0,z:-500-i*200,w:2020,d:i===2?24:14})),
 ...[-400,-600,-800,-1000,400,600,800,1000].map(x=>({x,z:-300,w:14,d:400})),
 ...[-120,-280].map(z=>({x:0,z,w:2020,d:12})),
];
export const SETTLEMENT_SOLIDS:readonly SolidBox[]=[
 ...SETTLEMENT_BUILDINGS.map(b=>({min:[b.x-b.w/2-.6,-20,b.z-b.d/2-.6] as [number,number,number],max:[b.x+b.w/2+.6,b.floors*BUILDING_FLOOR_HEIGHT+(b.floors>22?8:1),b.z+b.d/2+.6] as [number,number,number]})),
 // Closed cargo and utility equipment also have physical exterior volumes.
 {min:[-326,-20,-165],max:[-306,5.4,-138]},
 {min:[-328,-20,-349],max:[-307,9,-315]},
 {min:[-319,-20,-438],max:[-257,2.5,-393]},
 ...[[-58,53],[-290,-117],[63,-263]].map(([x,z])=>({min:[x-1.7,-20,z-2.8] as [number,number,number],max:[x+1.7,2.6,z+2.8] as [number,number,number]})),
 ...CITY_STOPS.map(({x,z})=>({min:[x-5.5,-20,z-5.15] as [number,number,number],max:[x+5.5,3.65,z-4.85] as [number,number,number]})),
];

export const CORE_PATHS=[[-28,23,28,3.5],[-29,-24,27,3.5],[26,-29,3.5,26],[28,24,3.5,26]] as const;
/** Physical walking surfaces relative to the base frame; terrain is -0.35m. */
export function settlementDeckHeight(x:number,z:number):number{
 let top=Math.hypot(x,z)<SETTLEMENT_FLAT_RADIUS?-.35:-Infinity;
 if(x*x+z*z<PAD_RADIUS**2)top=.365;
 else if(Math.abs(x)<47&&Math.abs(z)<47)top=-.12;
 for(const r of SETTLEMENT_ROADS){
  if(Math.abs(x-r.x)<r.w/2+2&&Math.abs(z-r.z)<r.d/2+2)top=Math.max(top,-.14);
  if(Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.z)<r.d/2)top=Math.max(top,-.06);
 }
 if(Math.abs(x+12)<2&&Math.abs(z+74)<27.5)top=Math.max(top,-.07);
 for(const p of CORE_PATHS)if(Math.abs(x-p[0])<p[2]/2&&Math.abs(z-p[1])<p[3]/2)top=Math.max(top,.1);
 for(const b of SETTLEMENT_BUILDINGS)if(Math.abs(x-b.x)<4.5&&Math.abs(z-b.z-b.d/2-4)<4)top=Math.max(top,-.14);
 for(const stop of CITY_STOPS)if(Math.abs(x-stop.x)<7&&Math.abs(z-stop.z)<7)top=Math.max(top,-.12);
 return top;
}
