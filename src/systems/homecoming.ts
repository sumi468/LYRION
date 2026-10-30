import { Vector3 } from 'three';
import { INVESTIGATIONS, INVESTIGATION_BY_ID, NAV_WAYPOINT, DOCK_SHIP, STATION_SAFE_RADIUS, STATION_SOLIDS, SHIP_SOLIDS, HARDWARE_SOLIDS, type FrameId } from '../data/homeworld';
import { ExpeditionFrames, ReferenceFrame } from '../physics/frames';
import { collideLocalBoxes, collideEvaCapsule } from '../physics/localCollision';
import { EVA_ROUTE_RADIUS } from '../physics/evaRoute';
import { segmentIntersectsSphere } from '../physics/segmentSphere';
import type { PositionTable } from '../physics/orbits';
import type { GameState } from '../core/state';
import { DockingSystem } from './docking';
import { EvaSystem, type EvaInput } from './eva';
import { advanceExpedition, currentObjective, type ExpeditionContext } from './expeditions';
import { InvestigationSystem } from './investigations';
import { BODY_DEFS } from '../data/starSystem';

const point = new Vector3(), nav = new Vector3().fromArray(NAV_WAYPOINT), dock = new Vector3().fromArray(DOCK_SHIP);
const returnStart=new Vector3(),returnEnd=new Vector3();
const hardwareFrames=['wayfarer','satellite','deep'] as const;

/** Coordinates the new modes; rendering, DOM and legacy mission state remain outside. */
export class HomecomingSystem {
  readonly frames = new ExpeditionFrames();
  readonly docking = new DockingSystem();
  readonly eva = new EvaSystem();
  readonly investigations = new InvestigationSystem();
  readonly shipFrame = new ReferenceFrame();
  readonly points: Record<string, Vector3> = { nav: new Vector3(), asterion: new Vector3(), dock: new Vector3(), ship: new Vector3() };
  readonly distances: Record<string, number> = {};
  stationDistance = Infinity;
  private positions: PositionTable = {};
  private velocities: PositionTable = {};
  constructor() { for (const d of INVESTIGATIONS) this.points[d.id] = new Vector3(); }
  get mode(): 'eva' | 'flight' | 'aligning' | 'docked' | 'undocking' { return this.eva.active ? 'eva' : this.docking.mode; }
  get protected(): boolean { return this.stationDistance < STATION_SAFE_RADIUS || this.mode !== 'flight'; }

  update(time: number, positions: PositionTable, velocities: PositionTable): void {
    this.positions=positions;
    this.velocities=velocities;
    this.frames.update(time, positions, velocities);
    this.points.asterion.copy(this.frames.asterion.position);
    this.frames.asterion.toWorld(nav, this.points.nav);
    this.frames.asterion.toWorld(dock, this.points.dock);
    for (const d of INVESTIGATIONS) this.frames.get(d.frame).toWorld(point.fromArray(d.position), this.points[d.id]);
  }
  measure(s: GameState): void {
    const focus = this.eva.active ? this.eva.position : s.pos;
    this.points.ship.copy(this.eva.active ? this.eva.hatchPosition : s.pos);
    this.stationDistance = s.pos.distanceTo(this.frames.asterion.position);
    this.docking.measure(s, this.frames.asterion);
    for (const id in this.points) this.distances[id] = focus.distanceTo(this.points[id]);
    this.distances.wayfarer = focus.distanceTo(this.frames.wayfarer.position);
    this.distances.deep = focus.distanceTo(this.frames.deep.position);
    this.shipFrame.position.copy(s.pos); this.shipFrame.rotation.copy(s.quat); this.shipFrame.velocity.copy(s.vel);
    if(this.eva.active)this.shipFrame.angularVelocity.copy(this.frames.get(this.eva.frameId).angularVelocity);else this.shipFrame.angularVelocity.set(0,0,0);
  }
  restore(s: GameState): void {
    this.eva.reset(); this.investigations.cancel();
    this.docking.restore(s.homecoming.docked, s, this.frames.asterion);
    this.persist(s); this.measure(s);
  }
  persist(s: GameState): void { s.homecoming.docked = this.docking.mode === 'docked'; s.homecoming.wasEva = this.eva.active; }
  toggleEva(s: GameState): string {
    if (this.eva.active) {
      if (!this.eva.board()) return 'ハッチの4u以内で再搭乗。Y / 帰還で船へ戻れます';
      this.investigations.cancel(); this.persist(s); return 'LX-07へ再搭乗しました';
    }
    if (s.landed || this.docking.mode === 'aligning' || this.docking.mode === 'undocking') return '着陸・ドッキング動作が終了してから船外へ出てください';
    let id: FrameId = 'inertial';
    if (this.stationDistance < 1100) id = 'asterion';
    else if (s.pos.distanceTo(this.frames.wayfarer.position) < 250) id = 'wayfarer';
    else if (s.pos.distanceTo(this.frames.deep.position) < 450) id = 'deep';
    else if (s.pos.distanceTo(this.frames.satellite.position) < 200) id = 'satellite';
    const frame = this.frames.get(id);
    frame.toLocal(s.pos, point); frame.pointVelocity(point, point);
    if (id !== 'inertial' && point.sub(s.vel).length() > 10) return '基地・調査対象との相対速度を10u/s以下に落としてください';
    if (id === 'inertial') { frame.position.copy(s.pos); frame.velocity.copy(s.vel); }
    this.eva.launch(s, id, frame); this.persist(s);
    return '船外活動開始。WASDで移動、Space / Shiftで上下、Eで調査、Yで帰還';
  }
  requestReturn():string {
    if(!this.eva.active)return '帰還支援は船外活動中に使用します。船外へ出る操作はH / EVAです';
    if(this.eva.emergency>0)return '酸素・行動範囲の安全装置による緊急回収中です。そのままお待ちください';
    if(!this.eva.returnToShip())return this.eva.routeBlocked?'安全な帰還経路を計算できません。外殻から離れて再度Y / 帰還を押してください':'帰還支援を中止。宇宙服の手動操作へ戻ります';
    const frame=this.frames.get(this.eva.frameId);
    returnStart.copy(this.eva.position);
    for(let i=0;i<this.eva.returnRoute.length;i++){
      frame.toWorld(this.eva.returnRoute.points[i],returnEnd);
      for(const body of BODY_DEFS){
        if(body.radius<=0||body.kind==='anomaly')continue;
        if(segmentIntersectsSphere(returnStart,returnEnd,this.positions[body.id],body.radius+EVA_ROUTE_RADIUS))return this.blockReturn(body.nameJa);
      }
      returnStart.copy(returnEnd);
    }
    return 'ハッチへの帰還支援を開始しました';
  }
  private blockReturn(bodyName:string):string {
    this.eva.returning=false;this.eva.routeBlocked=true;this.eva.returnRoute.length=0;this.eva.localVelocity.set(0,0,0);
    return `${bodyName}が帰還経路を遮っています。支援を中止しました。手動で回り込み、船が見える位置でY / 帰還を再試行してください。4u以内ならH / 搭乗。`;
  }
  /** Consumes mode-specific movement and timed interactions. Returns events only on changes. */
  step(dt: number, s: GameState, input: EvaInput): { message?: string; reward?: number } | null {
    let message: string | undefined;
    if (this.eva.active) {
      if (this.eva.frameId === 'inertial') this.frames.inertial.position.addScaledVector(this.frames.inertial.velocity, dt);
      const frame = this.frames.get(this.eva.frameId);
      const recovered = this.eva.step(dt, input, s, frame);
      this.eva.sync(s, frame);
      if (recovered) { message = '船外活動を終了。機体へ安全に回収しました'; this.investigations.cancel(); }
      else {
        collideEvaCapsule(this.frames.asterion, this.eva.position, this.eva.velocity, this.eva.rotation, STATION_SOLIDS);
        this.shipFrame.position.copy(s.pos); this.shipFrame.rotation.copy(s.quat); this.shipFrame.velocity.copy(s.vel);
        this.shipFrame.angularVelocity.copy(frame.angularVelocity);
        collideEvaCapsule(this.shipFrame, this.eva.position, this.eva.velocity, this.eva.rotation, SHIP_SOLIDS);
        for(const id of hardwareFrames)collideEvaCapsule(this.frames.get(id),this.eva.position,this.eva.velocity,this.eva.rotation,HARDWARE_SOLIDS[id]);
        for(const body of BODY_DEFS){
          // Small hardware has its own local solids; a bounding sphere would
          // push an EVA worker away from accessible recorder/control panels.
          if(body.radius<=0||body.kind==='anomaly')continue;
          point.copy(this.eva.position).sub(this.positions[body.id]);
          const radius=body.radius+EVA_ROUTE_RADIUS,distance=point.length();
          if(distance<radius){
            if(distance<1e-6)point.set(0,1,0);else point.multiplyScalar(1/distance);
            this.eva.position.copy(this.positions[body.id]).addScaledVector(point,radius);
            const v=this.eva.velocity,bodyVelocity=this.velocities[body.id];
            const inward=(v.x-bodyVelocity.x)*point.x+(v.y-bodyVelocity.y)*point.y+(v.z-bodyVelocity.z)*point.z;
            if(inward<0)v.addScaledVector(point,-inward);
            if(this.eva.returning&&this.eva.emergency===0)message=this.blockReturn(body.nameJa);
          }
        }
        this.eva.correctPosition(frame);
      }
    } else {
      const event = this.docking.update(dt, s, this.frames.asterion);
      if (event) message = event === 'docked' ? 'ASTERIONへ係留完了。B / 基地で補給と遠征報告' : '離脱完了。操縦を再開できます';
      if (this.docking.mode === 'flight') collideLocalBoxes(this.frames.asterion, s.pos, s.vel, 4, STATION_SOLIDS);
    }
    this.measure(s); this.persist(s);
    const completed = this.investigations.step(dt, s.homecoming, this.distances, this.eva.active, s.time);
    if (completed) { s.data += completed.reward; s.totalData += completed.reward; return { message: `${completed.name}：${completed.result}`, reward: completed.reward }; }
    return message ? { message } : null;
  }
  context(s: GameState): ExpeditionContext {
    return { eva: this.eva.active, docking: this.docking.mode, stationDistance: this.stationDistance, relativeSpeed: this.docking.relativeSpeed, distances: this.distances, scanned: s.scanned, landings: s.landings };
  }
  progress(s: GameState, dt: number): boolean { return advanceExpedition(s.homecoming, this.context(s), dt) !== null; }
  investigate(s: GameState): string {
    const objective=s.homecoming.tracked?currentObjective(s.homecoming):null;
    const target=objective?.target?INVESTIGATION_BY_ID[objective.target]:null;
    if(target&&(this.distances[target.id]??Infinity)<=3.6&&s.homecoming.investigated[target.id]===undefined)return this.investigations.request(target.id,s.homecoming,this.distances[target.id],this.eva.active);
    const nearest = this.investigations.nearest(s.homecoming, this.distances);
    return nearest ? this.investigations.request(nearest.id, s.homecoming, this.distances[nearest.id], this.eva.active) : '調査対象の3.6u以内へ接近してください';
  }
  investigationName(): string { return this.investigations.activeId ? INVESTIGATION_BY_ID[this.investigations.activeId].name : ''; }
}
