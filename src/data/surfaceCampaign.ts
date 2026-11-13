import type {SolidBox} from './homeworld';
import {SETTLEMENT_SOLIDS} from './settlement';
export const PRIME_BASE_ID='prime-base';
export const BASE_FACILITIES=[
 {id:'control',name:'MISSION CONTROL',description:'任務の受注・成果報告',position:[-35,0,22]},
 {id:'research',name:'SURFACE LAB',description:'地上観測記録・探査アーカイブ',position:[-34,0,-24]},
 {id:'repair',name:'SERVICE BAY',description:'LX-07の修理・燃料と電力の補給',position:[28,0,8]},
 {id:'comms',name:'COMMS ARRAY',description:'軌道基地との通信・機体アップグレード',position:[35,0,-32]},
 {id:'geology',name:'COASTAL OUTCROP',description:'地質調査・岩石試料の採取',position:[23,0,-38]},
] as const;
export const BASE_SOLIDS:readonly SolidBox[]=[
 ...SETTLEMENT_SOLIDS,
 // Foundations extend below terrain: a grounded capsule must resolve sideways,
 // rather than taking a shorter depenetration path underneath a wall.
 {min:[20.6,-20,-.5],max:[25.4,4.2,8.5]}, {min:[21.3,-20,10.6],max:[24.7,2.2,13.4]},
 {min:[-49,-20,17],max:[-38,7,31]}, {min:[-49,-20,-34],max:[-38,6,-17]},
 {min:[34,-20,27],max:[48,6,42]}, {min:[36,-20,-40],max:[39,15,-37]},
 {min:[-21.55,-20,42],max:[-20.45,12.5,66]}, {min:[-.55,-20,42],max:[.55,12.5,66]},
 {min:[-21.5,11.5,42],max:[.5,12.7,66]},
];
export const FIRST_STEPS_REWARD=150;
export const FIRST_STEPS=[
 {text:'PRIMEの港町PORT LYRAへ向かい、大気に入る',hint:'PAD 01マーカーへ飛行。F長押しで加速、Xで制動。接近すると巡航倍率が下がります',target:'base'},
 {text:'PAD 01または障害物のない平坦な陸地に着陸する',hint:'着陸案内が緑になったらG / LAND。高度450 m以下・地表速度100 m/s以下',target:'base'},
 {text:'LX-07から降り、地面に立つ',hint:'着陸後にH / EVAで地上探索を開始',target:'ship'},
 {text:'宇宙服で12 m以上歩く',hint:'WASDで歩行、マウス・矢印で視点、Spaceで小さく跳びます',target:'geology'},
 {text:'海岸の岩石露頭を調査する',hint:'マーカーの3.5 m以内でE / 調査。作業中は近くで待ちます',target:'geology'},
 {text:'露頭から岩石試料を採取する',hint:'同じ場所でもう一度E / 調査。試料を容器に密封します',target:'geology'},
 {text:'地上MISSION CONTROLで成果を報告する',hint:'コントロール端末の3.5 m以内でE / 調査',target:'control'},
 {text:'LX-07のハッチへ戻り、搭乗する',hint:'機体左側のハッチから5 m以内でH / 搭乗',target:'ship'},
 {text:'離陸し、高度120 kmから軌道を確認する',hint:'G / LANDで離陸。機首を空へ向け、W / Fで上昇します',target:'orbit'},
] as const;
