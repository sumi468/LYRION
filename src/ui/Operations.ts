import type { Game } from '../core/Game';
import { EXPEDITIONS, type ExpeditionDef } from '../data/expeditions';
import { INVESTIGATIONS } from '../data/homeworld';
import { expeditionAvailable } from '../systems/expeditions';
import { destinationLabel, missionProgress, missionStartReason } from '../systems/missionPresentation';
import { clear, h, setText } from './dom';

/** One compact mission list, one focused briefing, and explicit reasons for unavailable actions. */
export function operationsPanel(game: Game, refresh: () => void, resume: () => void, upgrades: () => void): HTMLElement {
  const progress = game.state.homecoming, docked = game.home.mode === 'docked';
  const previewOnly = game.phase === 'menu' && !game.menuHasSave;
  const eva = game.home.mode === 'eva';
  const resumeLabel = game.phase === 'menu' ? 'メニューへ戻る' : eva ? '船外活動へ戻る' : '操縦へ戻る';
  const startReason = (mission: ExpeditionDef) => missionStartReason(mission, progress, docked, eva);
  const accepted = progress.activeId !== null && progress.accepted.includes(progress.activeId);
  const activeMission = accepted ? EXPEDITIONS.find(mission => mission.id === progress.activeId) : null;
  const activeStep = activeMission ? missionProgress(activeMission, progress) : null;
  const stationState = game.home.mode === 'eva' ? '船外活動中' : docked ? 'ASTERIONに係留中' : '航行中';
  const action = (label: string, fn: () => void, disabled = false, describedBy?: string) => h('button', { class: 'btn', disabled, 'aria-describedby': describedBy, onclick: fn }, label);
  const detail = h('section', { class: 'mission-detail', id: 'mission-detail', 'aria-label': '選択した遠征の詳細' });
  const cards = h('div', { class: 'expedition-cards', 'aria-label': '6つの遠征' });
  const selection = new Map<string, HTMLElement>();
  const selectedHeading = h('p', { class: 'mission-selection-label', 'aria-live': 'polite' });

  const select = (mission: ExpeditionDef) => {
    const state = missionProgress(mission, progress), done = progress.completed[mission.id] !== undefined;
    const started = progress.accepted.includes(mission.id), available = expeditionAvailable(progress, mission);
    for (const [id, card] of selection) card.classList.toggle('selected', id === mission.id);
    setText(selectedHeading, `選択中：MISSION ${mission.number} — ${mission.title}`);
    clear(detail);
    detail.append(
      h('div', { class: 'mission-detail-kicker' }, `MISSION ${mission.number} / ${mission.codeName}`),
      h('h2', {}, mission.title),
      h('p', { class: 'mission-story' }, mission.briefing),
      h('div', { class: 'mission-detail-meta' },
        h('div', {}, h('span', {}, '目的地'), h('strong', {}, destinationLabel(state.next?.target))),
        h('div', {}, h('span', {}, '進行状況'), h('strong', {}, `${state.completed} / ${state.total}`)),
        h('div', {}, h('span', {}, '報告報酬'), h('strong', {}, `${mission.reward} DATA`))),
      h('div', { class: 'mission-next' }, h('span', {}, done ? '完了' : !available ? '解放条件' : !started ? '受注前' : '現在の目標'),
        h('strong', {}, done ? '成果を受領しました' : !available ? startReason(mission) : !started ? '基地で受注してから出発してください' : state.next?.text ?? '基地へ成果を報告してください'),
        h('p', {}, done ? mission.conclusion : !started ? startReason(mission) : state.next?.hint ?? '次の遠征を選択できます。')),
      h('h3', { class: 'mission-checklist-title' }, '達成する項目'),
      h('ol', { class: 'mission-checklist' }, ...mission.objectives.map(objective => {
        const complete = done || progress.objectives.includes(objective.id), current = started && state.next?.id === objective.id;
        return h('li', { class: complete ? 'done' : current ? 'current' : '', 'data-target': objective.target ?? '' },
          h('span', { class: 'objective-check', 'aria-hidden': true }, complete ? '✓' : current ? '→' : '○'),
          h('div', {}, h('span', { class: 'objective-state' }, complete ? '達成済み' : current ? '現在の目標' : '未達成'), h('strong', {}, objective.text)));
      })),
    );
  };

  for (const mission of EXPEDITIONS) {
    const done = progress.completed[mission.id] !== undefined, available = expeditionAvailable(progress, mission);
    const tracking = progress.activeId === mission.id && progress.accepted.includes(mission.id) && progress.tracked;
    const state = missionProgress(mission, progress), reasonId = `mission-access-${mission.id}`;
    const card = h('article', { class: `expedition-card${tracking ? ' active' : ''}`, 'data-mission': mission.id },
      h('div', { class: 'label' }, `MISSION ${mission.number} / ${mission.codeName}`),
      h('div', { class: `mission-status${done ? ' complete' : !available ? ' locked' : ''}` }, done ? 'クリア・報告済み' : tracking ? '進行中 / HUDで追跡' : available ? '受注可能' : '未解放'),
      h('h3', {}, h('a', { href: '#mission-detail', onclick: event => { event.preventDefault(); select(mission); detail.focus({ preventScroll: true }); if (matchMedia('(max-width: 800px)').matches) detail.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, mission.title)),
      h('p', { class: 'mission-card-summary' }, mission.briefing.split('。')[0] + '。'),
      h('div', { class: 'mission-card-meta' }, h('span', {}, `${state.completed} / ${state.total} 達成`), h('strong', {}, `${mission.reward} DATA`)),
      h('p', { class: 'exp-location' }, mission.location),
      done ? h('p', { class: 'mission-access-reason', id: reasonId }, '成果の受け取りは完了しています。') : action(tracking ? 'この遠征を追跡中' : '受注して追跡', () => { game.selectExpedition(mission.id); refresh(); }, !available || !docked || tracking, reasonId),
      !done ? h('p', { class: 'mission-access-reason', id: reasonId }, startReason(mission)) : null,
    );
    selection.set(mission.id, card); cards.append(card);
  }
  detail.tabIndex = -1;
  select(activeMission ?? EXPEDITIONS.find(mission => progress.completed[mission.id] === undefined && expeditionAvailable(progress, mission)) ?? EXPEDITIONS[0]);

  const reportReady = docked && activeStep?.next?.kind === 'report';
  const reportReason = eva ? '船外活動中は成果を報告できません。LX-07へ戻り、再搭乗してください。' : !activeMission ? 'まず遠征を受注してください。' : !docked ? '成果の受け取りにはASTERIONへの接岸が必要です。' : reportReady ? '調査と帰還が完了しています。報告して報酬を受け取れます。' : activeStep?.next ? `現在の目標「${activeStep.next.text}」を達成してから報告してください。` : 'この遠征の成果は受領済みです。次の遠征を選択できます。';
  const research = h('div', { class: 'research-log' });
  for (const def of INVESTIGATIONS) if (progress.investigated[def.id] !== undefined) research.append(h('article', {}, h('h4', {}, def.name), h('p', {}, def.result)));
  if (!research.children.length) research.append(h('p', {}, '点検・観測・修理・回収で得た記録がここに残ります。'));
  const stationServices = h('section', { class: 'station-services', 'aria-label': '基地サービス' },
    h('div', {}, h('h3', {}, '帰還・成果の受け取り'), h('p', { id: 'station-service-reason' }, eva ? '船外活動中は基地サービスを利用できません。LX-07へ戻り、再搭乗してください。' : docked ? '係留中：機体の修理・補給と成果報告を利用できます。' : 'PRIMEは帰る母星、ASTERIONは任務の受注・補給・報告を行う基地です。接岸後にサービスを利用できます。')),
    h('div', { class: 'station-service-actions' }, action('基地で修理・補給', () => { game.stationService(); refresh(); }, !docked, 'station-service-reason'), action('遠征成果を報告', () => { game.reportExpedition(); refresh(); }, !reportReady, 'report-reason')),
    h('p', { class: 'report-reason', id: 'report-reason' }, reportReason));

  return h('div', { class: 'operations-body' },
    h('header', { class: 'operations-intro' },
      h('div', { class: 'operations-home' }, h('span', {}, 'HOME / LYRION PRIME'), h('strong', {}, 'ASTERION STATION / MISSION CONTROL')),
      h('p', { class: 'campaign-name' }, 'EXPEDITION CAMPAIGN / 6 MISSIONS'),
      h('div', { class: 'operations-current' }, h('span', {}, stationState), h('strong', {}, activeMission ? `現在の遠征：${activeMission.title}` : '現在の遠征：未受注'), h('p', {}, activeStep?.next ? `次の目標：${activeStep.next.text}` : '任務を選び、接岸中に「受注して追跡」を選択してください。')),
      h('div', { class: 'operations-actions' }, action(resumeLabel, resume), action('基地へ誘導', () => game.navigateHome(), previewOnly || eva, 'home-guidance-reason'), action('機体アップグレード', upgrades)),
      h('p', { class: 'operations-guidance-reason', id: 'home-guidance-reason' }, previewOnly ? '開始前は一覧の確認のみです。「メニューへ戻る」から「新しい探査を開始」を選んでください。' : eva ? '船外活動中です。帰還支援でLX-07へ戻り、再搭乗してから船を操縦してください。' : docked ? '母星LYRION PRIMEの軌道基地です。受注と補給を済ませたら、操縦へ戻って出発できます。' : '「基地へ誘導」は帰還先を選択します。船を操縦して接近し、接岸してください。')),
    h('div', { class: 'homecoming-flow', 'aria-label': '遠征の流れ' }, ...['基地で受注', '出航・目標へ', '必要ならEVA調査', '船に戻る', '基地で報告'].map((label, index) => h('span', {}, h('b', {}, index + 1), label))),
    h('div', { class: 'mission-browser' }, h('section', { class: 'mission-overview' }, h('h2', {}, '遠征一覧'), selectedHeading, h('p', { class: 'mission-selection-help' }, '任務名を選ぶと、目的と手順を確認できます。'), cards), detail),
    stationServices,
    h('details', { class: 'operations-help' }, h('summary', {}, '接岸・船外活動の操作を確認'), h('p', { class: 'operations-controls' }, game.input.touchMode ? 'DOCK：接岸・離脱 / EVA：船外・搭乗 / 調査：設備で作業 / 帰還：機体へ戻る。左スティックで移動し、空いた画面をドラッグして向きを変えます。' : 'T：接岸・離脱 / H：船外・搭乗 / E：船外調査 / Y：帰還支援 / B：MISSION CONTROL。船外はWASDで移動、Space / Shiftで上下、マウス・矢印で向き、Xで制動します。'), h('p', {}, '接岸は惑星と反対側の誘導灯から150u以内・相対速度18u/s以下。船外に出るときは相対速度10u/s以下。宇宙服の酸素は6分、活動範囲は船から600uです。')),
    h('details', { class: 'operations-archive' }, h('summary', {}, `調査アーカイブ / ${Object.keys(progress.investigated).length}件`), research),
    h('div', { class: 'operations-tracking' }, action(progress.tracked ? '従来の探査目標を表示' : '遠征の目標を表示', () => { progress.tracked = !progress.tracked; game.saveNow(); refresh(); })),
  );
}
