import { describe, expect, it } from 'vitest';
import { EXPEDITIONS } from '../src/data/expeditions';
import { createHomecomingProgress } from '../src/systems/expeditions';
import { destinationLabel, missionProgress, missionStartReason } from '../src/systems/missionPresentation';

describe('mission presentation', () => {
  it('names real equipment and navigation destinations rather than leaking internal IDs', () => {
    expect(destinationLabel('maintenance-panel')).toBe('ASTERION外壁 / 外部保守パネル');
    expect(destinationLabel('nav')).toContain('航法ウェイポイント');
    expect(destinationLabel('ship')).toContain('乗降ハッチ');
    expect(destinationLabel('lumen')).toBe('ルーメン');
    expect(destinationLabel('deep')).toContain('旧遠征');
    expect(destinationLabel('not-a-target')).toBe('目的地を確認してください');
  });
  it('counts objective progress only for the selected expedition and identifies its next action', () => {
    const progress = createHomecomingProgress(), mission = EXPEDITIONS[1];
    progress.objectives.push('departure-brief', 'departure-clear', 'inspection-brief', 'inspection-dock');
    const view = missionProgress(mission, progress);
    expect(view.completed).toBe(2); expect(view.total).toBe(mission.objectives.length); expect(view.next?.id).toBe('inspection-exit');
  });
  it('shows completed records consistently even when older objective detail is absent', () => {
    const progress = createHomecomingProgress(); progress.completed['first-departure'] = 10;
    const view = missionProgress(EXPEDITIONS[0], progress);
    expect(view.completed).toBe(view.total); expect(view.next).toBeNull();
  });
  it('explains prerequisite, docking and already-tracked controls instead of silently doing nothing', () => {
    const progress = createHomecomingProgress();
    expect(missionStartReason(EXPEDITIONS[1], progress, true)).toContain('最初の出発');
    expect(missionStartReason(EXPEDITIONS[0], progress, false)).toContain('接岸');
    expect(missionStartReason(EXPEDITIONS[0], progress, false, true)).toContain('再搭乗');
    progress.accepted.push('first-departure');
    expect(missionStartReason(EXPEDITIONS[0], progress, false)).toContain('追跡中');
    expect(missionStartReason(EXPEDITIONS[0], progress, false, true)).toContain('船外活動へ戻る');
    progress.completed['first-departure'] = 2;
    expect(missionStartReason(EXPEDITIONS[0], progress, true)).toContain('完了');
  });
});
