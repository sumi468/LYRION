export const CRUISE_CLEARANCE=5000,CRUISE_MAX=1500,CRUISE_DRAIN=1;
export const BOOST_RESTART_FRACTION=.15;
export interface PropulsionState {
 locked:boolean; active:boolean; cruise:number; mode:'idle'|'boost'|'cruise'|'charging'|'braking'|'parked';
 clearance:number; drain:number;
}
/** Stable, inspectable rules shared by physics and the HUD. Braking always
 * cancels the accelerator, including F + X and both touch buttons held. */
export function updatePropulsion(out:PropulsionState,energy:number,energyMax:number,requested:boolean,braking:boolean,available:boolean,clearance:number,enemies:number,boostDrain:number):void{
 if(energy<=.5)out.locked=true;else if(energy>=energyMax*BOOST_RESTART_FRACTION)out.locked=false;
 out.clearance=Math.max(0,clearance);
 out.active=available&&requested&&!braking&&!out.locked&&energy>0;
 out.cruise=out.active&&enemies===0?Math.max(1,Math.min(CRUISE_MAX,out.clearance/CRUISE_CLEARANCE)):1;
 out.drain=out.active?(out.cruise>1?CRUISE_DRAIN:boostDrain):0;
 out.mode=!available?'parked':braking?'braking':out.locked?'charging':!out.active?'idle':out.cruise>1?'cruise':'boost';
}
export function createPropulsion():PropulsionState{return{locked:false,active:false,cruise:1,mode:'idle',clearance:0,drain:0};}
