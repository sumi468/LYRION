import { EXPEDITION_BY_ID, type ExpeditionDef } from '../data/expeditions';
import { INVESTIGATION_BY_ID } from '../data/homeworld';
import { BODY_BY_ID } from '../data/starSystem';
import type { HomecomingProgress } from './expeditions';
import { expeditionAvailable } from './expeditions';

/** Names for the same destination IDs used by world-space guidance. */
export function destinationLabel(id?: string): string {
  if (!id) return 'ASTERION STATION / MISSION CONTROL';
  if (id === 'asterion') return 'ASTERION STATION';
  if (id === 'nav') return 'ASTERION外側 / 航法ウェイポイント';
  if (id === 'ship') return 'LX-07 / 乗降ハッチ';
  if (id === 'deep') return '深宇宙 / 旧遠征の観測地点';
  const investigation = INVESTIGATION_BY_ID[id];
  if (investigation) {
    const frame = investigation.frame === 'asterion' ? 'ASTERION外壁' : investigation.frame === 'wayfarer' ? 'WAYFARER-3' : investigation.frame === 'deep' ? '深宇宙観測地点' : '母星の観測衛星';
    return `${frame} / ${investigation.name}`;
  }
  return BODY_BY_ID[id]?.nameJa ?? '目的地を確認してください';
}

export function missionProgress(mission: ExpeditionDef, progress: HomecomingProgress): { completed: number; total: number; next: ExpeditionDef['objectives'][number] | null } {
  if (progress.completed[mission.id] !== undefined) return { completed: mission.objectives.length, total: mission.objectives.length, next: null };
  const completed = mission.objectives.reduce((count, objective) => count + Number(progress.objectives.includes(objective.id)), 0);
  return { completed, total: mission.objectives.length, next: mission.objectives.find(objective => !progress.objectives.includes(objective.id)) ?? null };
}

/** Disabled controls always have a concrete, visible explanation. */
export function missionStartReason(mission: ExpeditionDef, progress: HomecomingProgress, docked: boolean, eva = false): string {
  if (progress.completed[mission.id] !== undefined) return '成果の報告と報酬の受け取りは完了しています。';
  if (!expeditionAvailable(progress, mission)) {
    const previous = mission.prerequisite ? EXPEDITION_BY_ID[mission.prerequisite] : null;
    return `先に「${previous?.title ?? '前の遠征'}」を完了し、基地へ成果を報告してください。`;
  }
  if (progress.activeId === mission.id && progress.accepted.includes(mission.id) && progress.tracked) return `この遠征を追跡中です。「${eva ? '船外活動へ戻る' : '操縦へ戻る'}」で現在の目標を進めてください。`;
  if (eva) return '船外活動中です。LX-07へ戻り、再搭乗してから受注してください。';
  if (!docked) return '受注にはASTERIONへの接岸が必要です。「基地へ誘導」で帰還先を選び、接近して接岸してください。';
  return '受注するとHUDと青い誘導マーカーが、この遠征の次の目標を示します。';
}
