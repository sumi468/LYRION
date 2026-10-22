import { MISSIONS, type MissionDef, type MissionProgress } from '../data/missions';

export interface MissionContext extends MissionProgress {
  missionIndex: number;
}

export function currentMission(index: number): MissionDef | null {
  return index >= 0 && index < MISSIONS.length ? MISSIONS[index] : null;
}

export interface MissionAdvance {
  completed: MissionDef[];
  newIndex: number;
  reward: number;
}

/**
 * 条件を満たしている限りミッションを進める(複数同時達成にも対応)。
 * 純粋関数。報酬や状態更新は呼び出し側で行う。
 */
export function advanceMissions(ctx: MissionContext): MissionAdvance {
  const completed: MissionDef[] = [];
  let idx = ctx.missionIndex;
  let reward = 0;
  while (idx < MISSIONS.length && MISSIONS[idx].isComplete(ctx)) {
    completed.push(MISSIONS[idx]);
    reward += MISSIONS[idx].reward;
    idx++;
  }
  return { completed, newIndex: idx, reward };
}

export function missionTarget(ctx: MissionContext): string | null {
  const m = currentMission(ctx.missionIndex);
  return m ? m.resolveTarget(ctx) : null;
}
