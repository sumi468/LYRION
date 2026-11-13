import type {SolidBox} from './homeworld';

export const SETTLEMENT_NAME='PORT LYRA';
export const PAD_RADIUS=16;
export const PAD_LANDING_RADIUS=8;
export const SETTLEMENT_FLAT_RADIUS=610;
export function cityLandingRestricted(x:number,z:number):boolean{return x>-340&&x<292&&z< -105&&z> -478;}
export interface SettlementBuilding {
 id:string; district:'civic'|'habitat'|'research'|'industry'; x:number; z:number; w:number; d:number; floors:number;
}
// Metres in the same rotating surface frame as PAD 01. The port remains an
// open apron; the denser town begins beyond the pedestrian/service boundary.
export const SETTLEMENT_BUILDINGS:readonly SettlementBuilding[]=[
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
export const BUILDING_FLOOR_HEIGHT=3.6;
export const SETTLEMENT_ROADS=[
 {x:0,z:-263,w:12,d:374}, {x:96,z:-263,w:10,d:374},
 {x:-96,z:-263,w:10,d:374}, {x:-205,z:-263,w:10,d:374}, {x:264,z:-263,w:10,d:374},
 {x:-26,z:-100,w:598,d:10}, {x:-26,z:-190,w:598,d:10},
 {x:-26,z:-280,w:598,d:12}, {x:-26,z:-375,w:598,d:10}, {x:-26,z:-456,w:598,d:10},
] as const;
export const SETTLEMENT_SOLIDS:readonly SolidBox[]=[
 ...SETTLEMENT_BUILDINGS.map(b=>({min:[b.x-b.w/2-.6,-20,b.z-b.d/2-.6] as [number,number,number],max:[b.x+b.w/2+.6,b.floors*BUILDING_FLOOR_HEIGHT+1,b.z+b.d/2+.6] as [number,number,number]})),
 // Closed cargo and utility equipment also have physical exterior volumes.
 {min:[-326,-20,-165],max:[-306,5.4,-138]},
 {min:[-328,-20,-349],max:[-307,9,-315]},
 {min:[-319,-20,-438],max:[-257,2.5,-393]},
 ...[[-58,53],[-290,-117],[63,-263]].map(([x,z])=>({min:[x-1.7,-20,z-2.8] as [number,number,number],max:[x+1.7,2.6,z+2.8] as [number,number,number]})),
];

export const CORE_PATHS=[[-28,23,28,3.5],[-29,-24,27,3.5],[26,-29,3.5,26],[28,24,3.5,26]] as const;
/** Physical walking surfaces relative to the base frame; terrain is -0.35m. */
export function settlementDeckHeight(x:number,z:number):number{
 let top=-Infinity;
 if(x*x+z*z<PAD_RADIUS**2)top=.365;
 else if(Math.abs(x)<47&&Math.abs(z)<47)top=-.12;
 for(const r of SETTLEMENT_ROADS){
  if(Math.abs(x-r.x)<r.w/2+2&&Math.abs(z-r.z)<r.d/2+2)top=Math.max(top,-.14);
  if(Math.abs(x-r.x)<r.w/2&&Math.abs(z-r.z)<r.d/2)top=Math.max(top,-.06);
 }
 if(Math.abs(x+12)<2&&Math.abs(z+74)<27.5)top=Math.max(top,-.07);
 for(const p of CORE_PATHS)if(Math.abs(x-p[0])<p[2]/2&&Math.abs(z-p[1])<p[3]/2)top=Math.max(top,.1);
 for(const b of SETTLEMENT_BUILDINGS)if(Math.abs(x-b.x)<4.5&&Math.abs(z-b.z-b.d/2-4)<4)top=Math.max(top,-.14);
 return top;
}
