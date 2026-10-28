import { EXPEDITIONS, EXPEDITION_BY_ID, OBJECTIVE_IDS, type ExpeditionDef, type ExpeditionObjective } from '../data/expeditions';
import { INVESTIGATION_BY_ID } from '../data/homeworld';
import type { DockingMode } from './docking';

/** Plain persistent data, kept independent of the original missionIndex. */
export interface HomecomingProgress {
  activeId: string | null;
  tracked: boolean;
  accepted: string[];
  completed: Record<string, number>;
  objectives: string[];
  investigated: Record<string, number>;
  stabilizeSeconds: number;
  docked: boolean;
  wasEva: boolean;
}
export function createHomecomingProgress(tracked = true): HomecomingProgress {
  return { activeId: tracked ? EXPEDITIONS[0].id : null, tracked, accepted: [], completed: {}, objectives: [], investigated: {}, stabilizeSeconds: 0, docked: false, wasEva: false };
}
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;

export function sanitizeHomecoming(raw: unknown): HomecomingProgress {
  const progress = createHomecomingProgress(false);
  if (!raw || typeof raw !== 'object') return progress;
  const data = raw as Record<string, unknown>;
  if (typeof data.activeId === 'string' && EXPEDITION_BY_ID[data.activeId]) progress.activeId = data.activeId;
  progress.tracked = data.tracked === true && progress.activeId !== null;
  if (Array.isArray(data.accepted)) progress.accepted = [...new Set(data.accepted.filter((id): id is string => typeof id === 'string' && !!EXPEDITION_BY_ID[id]))];
  if (Array.isArray(data.objectives)) progress.objectives = [...new Set(data.objectives.filter((id): id is string => typeof id === 'string' && OBJECTIVE_IDS.has(id)))];
  if (data.completed && typeof data.completed === 'object') for (const [id, time] of Object.entries(data.completed)) {
    if (EXPEDITION_BY_ID[id] && validTime(time)) progress.completed[id] = time;
  }
  if (data.investigated && typeof data.investigated === 'object') for (const [id, time] of Object.entries(data.investigated)) {
    if (INVESTIGATION_BY_ID[id] && validTime(time)) progress.investigated[id] = time;
  }
  progress.stabilizeSeconds = typeof data.stabilizeSeconds === 'number' && Number.isFinite(data.stabilizeSeconds) ? Math.max(0, Math.min(2, data.stabilizeSeconds)) : 0;
  progress.docked = data.docked === true; progress.wasEva = data.wasEva === true;
  return progress;
}

export function expeditionAvailable(progress: HomecomingProgress, mission: ExpeditionDef): boolean {
  return !mission.prerequisite || progress.completed[mission.prerequisite] !== undefined;
}
export function activeExpedition(progress: HomecomingProgress): ExpeditionDef | null { return progress.activeId ? EXPEDITION_BY_ID[progress.activeId] ?? null : null; }
export function currentObjective(progress: HomecomingProgress): ExpeditionObjective | null {
  const mission = activeExpedition(progress);
  return mission?.objectives.find(objective => !progress.objectives.includes(objective.id)) ?? null;
}
export function acceptExpedition(progress: HomecomingProgress, id: string): boolean {
  const mission = EXPEDITION_BY_ID[id];
  if (!mission || !expeditionAvailable(progress, mission) || progress.completed[id] !== undefined) return false;
  progress.activeId = id; progress.tracked = true; progress.stabilizeSeconds = 0;
  if (!progress.accepted.includes(id)) progress.accepted.push(id);
  return true;
}

export interface ExpeditionContext {
  eva: boolean;
  docking: DockingMode;
  stationDistance: number;
  relativeSpeed: number;
  distances: Readonly<Record<string, number>>;
  scanned: ReadonlyMap<string, number>;
  landings: ReadonlySet<string>;
}

function objectiveReady(objective: ExpeditionObjective, progress: HomecomingProgress, ctx: ExpeditionContext, dt: number): boolean {
  const distance = objective.target ? ctx.distances[objective.target] ?? Infinity : Infinity;
  switch (objective.kind) {
    case 'brief': return progress.accepted.includes(progress.activeId!);
    case 'depart': return !ctx.eva && ctx.docking === 'flight' && ctx.stationDistance > 200;
    case 'approach': return distance <= (objective.range ?? 100);
    case 'stabilize':
      progress.stabilizeSeconds = distance <= 70 && ctx.relativeSpeed <= 8 && !ctx.eva ? progress.stabilizeSeconds + dt : 0;
      return progress.stabilizeSeconds >= 2;
    case 'dock': return !ctx.eva && ctx.docking === 'docked';
    case 'eva': return ctx.eva;
    case 'visit': return (ctx.eva && distance <= (objective.range ?? 5)) || (objective.target !== undefined && progress.investigated[objective.target] !== undefined);
    case 'investigate': return objective.target !== undefined && progress.investigated[objective.target] !== undefined;
    case 'board': return !ctx.eva;
    case 'scan-body': return objective.target !== undefined && ctx.scanned.has(objective.target);
    case 'land': return objective.target !== undefined && ctx.landings.has(objective.target);
    case 'report': return false; // An intentional report action at a docked ship pays the reward.
  }
}

/** Ordered, monotonic objective advancement. A result is allocated only when progress changes. */
export function advanceExpedition(progress: HomecomingProgress, ctx: ExpeditionContext, dt: number): ExpeditionObjective[] | null {
  const mission = activeExpedition(progress);
  if (!mission || progress.completed[mission.id] !== undefined) return null;
  let completed: ExpeditionObjective[] | null = null;
  for (const objective of mission.objectives) {
    if (progress.objectives.includes(objective.id)) continue;
    if (!objectiveReady(objective, progress, ctx, dt)) break;
    progress.objectives.push(objective.id);
    (completed ??= []).push(objective);
    if (objective.kind === 'stabilize') progress.stabilizeSeconds = 0;
  }
  return completed;
}

export function reportExpedition(progress: HomecomingProgress, ctx: ExpeditionContext, time: number): ExpeditionDef | null {
  const mission = activeExpedition(progress), objective = currentObjective(progress);
  if (!mission || !objective || objective.kind !== 'report' || ctx.eva || ctx.docking !== 'docked' || progress.completed[mission.id] !== undefined) return null;
  progress.objectives.push(objective.id); progress.completed[mission.id] = time;
  progress.tracked = true;
  return mission;
}
