import { INVESTIGATIONS, INVESTIGATION_BY_ID, type InvestigationDef } from '../data/homeworld';
import type { HomecomingProgress } from './expeditions';

export type InvestigationStatus = 'available' | 'in-range' | 'in-progress' | 'completed' | 'locked';
export const INVESTIGATION_RANGE = 3.6;

export class InvestigationSystem {
  activeId: string | null = null;
  progress = 0;
  private elapsed = 0;
  cancel(): void { this.activeId = null; this.elapsed = this.progress = 0; }
  status(def: InvestigationDef, state: HomecomingProgress, distance: number): InvestigationStatus {
    if (state.investigated[def.id] !== undefined) return 'completed';
    if (def.requires && state.investigated[def.requires] === undefined) return 'locked';
    if (this.activeId === def.id) return 'in-progress';
    return distance <= INVESTIGATION_RANGE ? 'in-range' : 'available';
  }
  nearest(state: HomecomingProgress, distances: Readonly<Record<string, number>>): InvestigationDef | null {
    let nearest: InvestigationDef | null = null, completed: InvestigationDef | null = null, best = 80, completedDistance = 80;
    for (const def of INVESTIGATIONS) {
      const distance = distances[def.id] ?? Infinity;
      if(state.investigated[def.id]!==undefined){if(distance<completedDistance){completedDistance=distance;completed=def;}continue;}
      if (distance < best) { best = distance; nearest = def; }
    }
    return nearest??completed;
  }
  request(id: string, state: HomecomingProgress, distance: number, eva: boolean): string {
    if (!eva) return 'この設備は船外活動で調査します';
    const def = INVESTIGATION_BY_ID[id]; if (!def) return '調査対象がありません';
    const status = this.status(def, state, distance);
    if (status === 'completed') return '調査済みです。記録は遠征ボードから確認できます';
    if (status === 'locked') return '先に関連する設備の調査を完了してください';
    if (distance > INVESTIGATION_RANGE) return '設備の3.6u以内へ接近してください';
    if (this.activeId === id) { this.cancel(); return '調査を中断しました'; }
    this.activeId = id; this.elapsed = this.progress = 0;
    return `${def.name}の作業を開始`;
  }
  /** Completion is persisted before a reward is returned, preventing duplicate payouts. */
  step(dt: number, state: HomecomingProgress, distances: Readonly<Record<string, number>>, eva: boolean, time: number): InvestigationDef | null {
    if (!this.activeId) return null;
    const def = INVESTIGATION_BY_ID[this.activeId];
    if (!eva || !def || (distances[def.id] ?? Infinity) > INVESTIGATION_RANGE || state.investigated[def.id] !== undefined) { this.cancel(); return null; }
    this.elapsed += dt; this.progress = Math.min(1, this.elapsed / def.seconds);
    if (this.progress < 1) return null;
    state.investigated[def.id] = time; this.cancel(); return def;
  }
}
