import { Vector3 } from 'three';
import { INVESTIGATIONS, INVESTIGATION_BY_ID, NAV_WAYPOINT, STATION_SAFE_RADIUS, STATION_SOLIDS, SHIP_SOLIDS, HARDWARE_SOLIDS, type FrameId } from '../data/homeworld';
import { ExpeditionFrames, ReferenceFrame } from '../physics/frames';
import { collideLocalBoxes } from '../physics/localCollision';
import type { PositionTable } from '../physics/orbits';
import type { GameState } from '../core/state';
import { DockingSystem } from './docking';
import { EvaSystem, type EvaInput } from './eva';
import { advanceExpedition, type ExpeditionContext } from './expeditions';
import { InvestigationSystem } from './investigations';
import { BODY_DEFS } from '../data/starSystem';

const point = new Vector3(), nav = new Vector3().fromArray(NAV_WAYPOINT);
const hardwareFrames=['wayfarer','satellite','deep'] as const;

/** Coordinates the new modes; rendering, DOM and legacy mission state remain outside. */
export class HomecomingSystem {
  readonly frames = new ExpeditionFrames();
  readonly docking = new DockingSystem();
  readonly eva = new EvaSystem();
  readonly investigations = new InvestigationSystem();
  readonly shipFrame = new ReferenceFrame();
  readonly points: Record<string, Vector3> = { nav: new Vector3(), asterion: new Vector3(), ship: new Vector3() };
  readonly distances: Record<string, number> = {};
  stationDistance = Infinity;
  private positions: PositionTable = {};
  constructor() { for (const d of INVESTIGATIONS) this.points[d.id] = new Vector3(); }
  get mode(): 'eva' | 'flight' | 'aligning' | 'docked' | 'undocking' { return this.eva.active ? 'eva' : this.docking.mode; }
  get protected(): boolean { return this.stationDistance < STATION_SAFE_RADIUS || this.mode !== 'flight'; }

  update(time: number, positions: PositionTable, velocities: PositionTable): void {
    this.positions=positions;
    this.frames.update(time, positions, velocities);
    this.points.asterion.copy(this.frames.asterion.position);
    this.frames.asterion.toWorld(nav, this.points.nav);
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
        collideLocalBoxes(this.frames.asterion, this.eva.position, this.eva.velocity, .42, STATION_SOLIDS);
        this.shipFrame.position.copy(s.pos); this.shipFrame.rotation.copy(s.quat); this.shipFrame.velocity.copy(s.vel);
        collideLocalBoxes(this.shipFrame, this.eva.position, this.eva.velocity, .42, SHIP_SOLIDS);
        for(const id of hardwareFrames)collideLocalBoxes(this.frames.get(id),this.eva.position,this.eva.velocity,.42,HARDWARE_SOLIDS[id]);
        for(const body of BODY_DEFS){
          if(body.radius<=0)continue;
          point.copy(this.eva.position).sub(this.positions[body.id]);
          const radius=body.radius+.6,distance=point.length();
          if(distance<radius){this.eva.position.copy(this.positions[body.id]).addScaledVector(point,distance>1e-6?radius/distance:0);if(distance<1e-6)this.eva.position.y+=radius;frame.toLocal(this.eva.position,point);frame.pointVelocity(point,this.eva.velocity);this.eva.returning=true;}
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
    const nearest = this.investigations.nearest(s.homecoming, this.distances);
    return nearest ? this.investigations.request(nearest.id, s.homecoming, this.distances[nearest.id], this.eva.active) : '調査対象の3.6u以内へ接近してください';
  }
  investigationName(): string { return this.investigations.activeId ? INVESTIGATION_BY_ID[this.investigations.activeId].name : ''; }
}
