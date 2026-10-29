import { Quaternion, Vector3 } from 'three';
import { HARDWARE_SOLIDS, SHIP_SOLIDS, STATION_SOLIDS, type FrameId, type SolidBox } from '../data/homeworld';
import { ReferenceFrame } from './frames';
import { collideLocalBoxes } from './localCollision';

/** Contains the whole posed suit and collision envelope, including the boot sphere. */
export const EVA_ROUTE_RADIUS=1.38;
const MAX_NODES=96,EPS=1e-5;
const NONE:readonly SolidBox[]=[];

/** Bounded visibility graph around expanded station/hardware AABBs and the parked ship OBB.
 * Constructed once for Y, with no per-frame allocations or accumulated orbital integration.
 */
export class EvaReturnRoute {
  readonly points=Array.from({length:MAX_NODES},()=>new Vector3());
  length=0;
  private nodes=Array.from({length:MAX_NODES},()=>new Vector3());
  private distance=new Float64Array(MAX_NODES);
  private parent=new Int16Array(MAX_NODES);
  private visited=new Uint8Array(MAX_NODES);
  private reverse=new Int16Array(MAX_NODES);
  private scene:readonly SolidBox[]=NONE;
  private ship=new ReferenceFrame();
  private identity=new ReferenceFrame();
  private inverse=new Quaternion();
  private localA=new Vector3();
  private localB=new Vector3();
  private safeStart=new Vector3();
  private safeGoal=new Vector3();
  private candidate=new Vector3();
  private zero=new Vector3();
  private count=0;

  plan(start:Vector3,hatch:Vector3,parkedPosition:Vector3,parkedRotation:Quaternion,frameId:FrameId):boolean {
    this.length=0;this.count=2;
    this.scene=frameId==='asterion'?STATION_SOLIDS:frameId==='wayfarer'||frameId==='satellite'||frameId==='deep'?HARDWARE_SOLIDS[frameId]:NONE;
    this.ship.position.copy(parkedPosition);this.ship.rotation.copy(parkedRotation);this.inverse.copy(parkedRotation).invert();
    this.safeStart.copy(start);this.safeGoal.copy(hatch);
    this.escape(this.safeStart);this.escape(this.safeGoal);
    // Auto boarding must stay inside the real hatch threshold, even if the hull blocks a direct endpoint.
    if(this.safeGoal.distanceToSquared(hatch)>1.3**2||!this.free(this.safeGoal)||!this.free(this.safeStart))return false;
    this.nodes[0].copy(this.safeStart);this.nodes[1].copy(this.safeGoal);
    this.addCorners(this.scene,false);this.addCorners(SHIP_SOLIDS,true);
    this.distance.fill(Infinity);this.parent.fill(-1);this.visited.fill(0);this.distance[0]=0;
    for(let iteration=0;iteration<this.count;iteration++){
      let at=-1,best=Infinity;
      for(let i=0;i<this.count;i++)if(!this.visited[i]&&this.distance[i]<best){at=i;best=this.distance[i];}
      if(at<0)break;if(at===1)break;this.visited[at]=1;
      for(let next=0;next<this.count;next++){
        if(next===at||this.visited[next])continue;
        const cost=best+this.nodes[at].distanceTo(this.nodes[next]);
        if(cost<this.distance[next]&&this.clear(this.nodes[at],this.nodes[next])){this.distance[next]=cost;this.parent[next]=at;}
      }
    }
    if(!Number.isFinite(this.distance[1]))return false;
    let reverseCount=0,at=1;
    while(at>0&&reverseCount<MAX_NODES){this.reverse[reverseCount++]=at;at=this.parent[at];}
    if(at!==0)return false;
    if(start.distanceToSquared(this.safeStart)>.01)this.points[this.length++].copy(this.safeStart);
    for(let i=reverseCount-1;i>=0;i--)this.points[this.length++].copy(this.nodes[this.reverse[i]]);
    return this.length>0;
  }

  private escape(point:Vector3):void {
    for(let pass=0;pass<6;pass++){
      this.zero.set(0,0,0);
      const a=collideLocalBoxes(this.identity,point,this.zero,EVA_ROUTE_RADIUS+.02,this.scene);
      const b=collideLocalBoxes(this.ship,point,this.zero,EVA_ROUTE_RADIUS+.02,SHIP_SOLIDS);
      if(!a&&!b)break;
    }
  }
  private addCorners(boxes:readonly SolidBox[],ship:boolean):void {
    for(const box of boxes)for(let bits=0;bits<8;bits++){
      this.candidate.set(
        bits&1?box.max[0]+EVA_ROUTE_RADIUS+.03:box.min[0]-EVA_ROUTE_RADIUS-.03,
        bits&2?box.max[1]+EVA_ROUTE_RADIUS+.03:box.min[1]-EVA_ROUTE_RADIUS-.03,
        bits&4?box.max[2]+EVA_ROUTE_RADIUS+.03:box.min[2]-EVA_ROUTE_RADIUS-.03,
      );
      if(ship)this.ship.toWorld(this.candidate,this.candidate);
      if(!this.free(this.candidate))continue;
      let duplicate=false;for(let i=0;i<this.count;i++)if(this.nodes[i].distanceToSquared(this.candidate)<1e-8){duplicate=true;break;}
      if(!duplicate&&this.count<MAX_NODES)this.nodes[this.count++].copy(this.candidate);
    }
  }
  private free(point:Vector3):boolean {
    for(const box of this.scene)if(this.inside(point,box))return false;
    this.localA.copy(point).sub(this.ship.position).applyQuaternion(this.inverse);
    for(const box of SHIP_SOLIDS)if(this.inside(this.localA,box))return false;
    return true;
  }
  private inside(p:Vector3,b:SolidBox):boolean {
    const r=EVA_ROUTE_RADIUS-EPS;
    return p.x>b.min[0]-r&&p.x<b.max[0]+r&&p.y>b.min[1]-r&&p.y<b.max[1]+r&&p.z>b.min[2]-r&&p.z<b.max[2]+r;
  }
  private clear(a:Vector3,b:Vector3):boolean {
    for(const box of this.scene)if(this.intersects(a,b,box))return false;
    this.localA.copy(a).sub(this.ship.position).applyQuaternion(this.inverse);this.localB.copy(b).sub(this.ship.position).applyQuaternion(this.inverse);
    for(const box of SHIP_SOLIDS)if(this.intersects(this.localA,this.localB,box))return false;
    return true;
  }
  private intersects(a:Vector3,b:Vector3,box:SolidBox):boolean {
    let enter=0,exit=1;
    for(let axis=0;axis<3;axis++){
      const start=a.getComponent(axis),delta=b.getComponent(axis)-start,min=box.min[axis]-EVA_ROUTE_RADIUS+EPS,max=box.max[axis]+EVA_ROUTE_RADIUS-EPS;
      if(Math.abs(delta)<1e-9){if(start<=min||start>=max)return false;}
      else {const x=(min-start)/delta,y=(max-start)/delta;enter=Math.max(enter,Math.min(x,y));exit=Math.min(exit,Math.max(x,y));if(enter>=exit)return false;}
    }
    return enter<1-EPS&&exit>EPS;
  }
}
