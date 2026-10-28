export type ObjectiveKind = 'brief' | 'depart' | 'approach' | 'stabilize' | 'dock' | 'eva' | 'visit' | 'investigate' | 'board' | 'scan-body' | 'land' | 'report';
export interface ExpeditionObjective { id: string; kind: ObjectiveKind; text: string; hint: string; target?: string; range?: number }
export interface ExpeditionDef {
  id: string; number: string; codeName: string; category: string; title: string; location: string; briefing: string;
  reward: number; prerequisite?: string; objectives: readonly ExpeditionObjective[]; conclusion: string;
}

export const EXPEDITIONS: readonly ExpeditionDef[] = [
  { id: 'first-departure', number: '01', codeName: 'FIRST DEPARTURE', category: '航行訓練', title: '最初の出発', location: 'ASTERION / LYRION PRIME', reward: 30,
    briefing: 'ここが私たちの母星、リリオン・プライム。遠征の第一歩は、帰る場所を覚えることです。基地から外側の航行標へ向かい、相対速度を落としてから帰還してください。自由な探索はいつでも続けられます。',
    objectives: [
      { id: 'departure-brief', kind: 'brief', text: '最初の遠征ブリーフィングを受ける', hint: 'T / DOCKで接岸し、B / MISSION CONTROLで「受注して追跡」を選びます。', target: 'asterion' },
      { id: 'departure-clear', kind: 'depart', text: '基地の外へ出航する', hint: '係留中ならTで離脱。Wで推進し、基地から200u離れてください。', target: 'nav' },
      { id: 'departure-nav', kind: 'approach', text: '近傍の航行標へ向かう', hint: '青い航行標を追い、55u以内へ接近してください。', target: 'nav', range: 55 },
      { id: 'departure-stable', kind: 'stabilize', text: '航行標で相対速度8u/s以下を2秒保つ', hint: 'X / BRAKEで減速。飛行アシストONなら、その場に留まれます。', target: 'nav' },
      { id: 'departure-return', kind: 'dock', text: 'アステリオンへ帰還しドッキングする', hint: '外側の接舷灯へ接近。相対速度18u/s以下でT / DOCKを押します。', target: 'asterion' },
      { id: 'departure-report', kind: 'report', text: '基地へ航行結果を報告する', hint: 'B / 遠征の「成果を報告」で遠征を完了します。', target: 'asterion' },
    ], conclusion: '初航行を完了。航行記録を受領しました。次は船外から基地を点検します。' },
  { id: 'orbital-inspection', number: '02', codeName: 'ORBITAL INSPECTION', category: '船外活動', title: '軌道上の点検', location: 'ASTERION STATION', reward: 40, prerequisite: 'first-departure',
    briefing: '船を接舷したまま、LX-07のハッチから船外へ出ます。保守パネルと環境観測センサーを点検し、必ず船へ戻ってください。酸素と船までの距離は船外計器で確認できます。',
    objectives: [
      { id: 'inspection-brief', kind: 'brief', text: '船外点検の説明を確認する', hint: '調査の順序と帰還経路を確認して、遠征を受諾してください。', target: 'asterion' },
      { id: 'inspection-dock', kind: 'dock', text: 'アステリオンに接舷して船を安定させる', hint: 'T / DOCKで接舷支援を開始します。', target: 'asterion' },
      { id: 'inspection-exit', kind: 'eva', text: 'LX-07から船外へ出る', hint: 'H / EVA。船は基地に係留されたまま残ります。', target: 'maintenance-panel' },
      { id: 'inspection-visit', kind: 'visit', text: '外部保守パネルへ移動する', hint: '船外ではW/Sで前後、A/Dで横、Space/Shiftで上下へ移動します。', target: 'maintenance-panel', range: 5 },
      { id: 'inspection-panel', kind: 'investigate', text: '保守パネルを点検する', hint: '3.6u以内でE / 調査。範囲内に留まると点検が進みます。', target: 'maintenance-panel' },
      { id: 'inspection-sensor', kind: 'investigate', text: '環境観測センサーを観測する', hint: '観測点へ移り、E / 調査で科学データを取得してください。', target: 'station-sensor' },
      { id: 'inspection-board', kind: 'board', text: '船のハッチへ戻り再入船する', hint: 'ハッチ4u以内でH / 再入船。Y / 帰還支援も使えます。', target: 'ship' },
      { id: 'inspection-report', kind: 'report', text: '基地へ点検結果を報告する', hint: '係留した船からB / 遠征で成果を報告します。', target: 'asterion' },
    ], conclusion: '船外点検が完了しました。基地の外側にも、手を伸ばして調べられる世界があります。' },
  { id: 'repair-operation', number: '03', codeName: 'REPAIR OPERATION', category: '軌道保守', title: '通信システムの修復', location: 'ASTERION STATION', reward: 50, prerequisite: 'orbital-inspection',
    briefing: '外部アンテナの受信利得が低下しています。船外の診断端末で原因を特定し、増幅器を交換、検証センサーで通信を確認してください。基地の保守作業には研究報酬が支給されます。',
    objectives: [
      { id: 'repair-brief', kind: 'brief', text: '通信障害の報告を受ける', hint: '遠征を受諾し、アンテナ側の船外ポイントを追ってください。', target: 'asterion' },
      { id: 'repair-dock', kind: 'dock', text: '基地に接舷する', hint: '修理の前に、船を接舷してください。', target: 'asterion' },
      { id: 'repair-exit', kind: 'eva', text: '船外活動を開始する', hint: 'H / EVAでハッチから出ます。', target: 'antenna-diagnosis' },
      { id: 'repair-diagnose', kind: 'investigate', text: 'アンテナの不具合を診断する', hint: '診断端末へ近づき、E / 調査。原因を確認してから修理します。', target: 'antenna-diagnosis' },
      { id: 'repair-module', kind: 'investigate', text: '通信増幅器を修理する', hint: '上部の増幅器でE / 調査。交換作業の完了まで位置を保ちます。', target: 'antenna-repair' },
      { id: 'repair-confirm', kind: 'investigate', text: '通信が復旧したことを確認する', hint: '検証センサーで信号を測定してください。', target: 'communications-test' },
      { id: 'repair-board', kind: 'board', text: 'LX-07へ戻る', hint: 'Hで再入船。帰り道に迷ったらY / 帰還支援を使えます。', target: 'ship' },
      { id: 'repair-report', kind: 'report', text: '基地へ修理結果を報告する', hint: 'B / 遠征から成果を報告してください。', target: 'asterion' },
    ], conclusion: '通信は復旧。ただし、古い遠征識別子を含む微かな信号が混じっています。まずは近傍の月を調べましょう。' },
  { id: 'lunar-expedition', number: '04', codeName: 'LUNAR EXPEDITION', category: '月面探査', title: '初の衛星探査', location: 'LUMEN', reward: 70, prerequisite: 'repair-operation',
    briefing: 'タラッサを周回する衛星ルーメンで、軌道観測を行い、調査データを基地へ持ち帰ってください。既存のスキャナーを使用します。着陸は任意で行えます。',
    objectives: [
      { id: 'lunar-brief', kind: 'brief', text: '月探査の計画を受ける', hint: 'ルーメンまでの航路を確認し、遠征を受諾します。', target: 'lumen' },
      { id: 'lunar-depart', kind: 'depart', text: '基地を出航する', hint: 'Tで離脱後、WとFで遠征を開始します。', target: 'lumen' },
      { id: 'lunar-approach', kind: 'approach', text: 'ルーメンへ接近する', hint: '惑星タラッサの近くにある衛星です。誘導マーカーを追ってください。', target: 'lumen', range: 400 },
      { id: 'lunar-scan', kind: 'scan-body', text: 'ルーメンの観測データを取得する', hint: '通常のR / SCANを使用。既存のスキャン記録も有効です。', target: 'lumen' },
      { id: 'lunar-return', kind: 'dock', text: 'アステリオンへ帰還する', hint: 'Gで離陸し、母星へ帰還。接舷支援を使ってください。', target: 'asterion' },
      { id: 'lunar-report', kind: 'report', text: '月の研究データを提出する', hint: 'B / 遠征から成果を報告します。', target: 'asterion' },
    ], conclusion: 'ルーメンの調査記録を受領。基地は、復旧したアンテナで探査機WAYFARER-3の古い信号を捕捉しました。' },
  { id: 'lost-signal', number: '05', codeName: 'LOST SIGNAL', category: '信号調査', title: '失われた信号', location: 'WAYFARER-3 / GLACIA', reward: 90, prerequisite: 'lunar-expedition',
    briefing: 'グラキア周辺の探査機WAYFARER-3は、最終送信のあと沈黙しました。機体の近くで相対速度を落とし、船外活動でレコーダーと記憶素子を回収してください。記録を破壊せずに母星へ持ち帰ることが目的です。',
    objectives: [
      { id: 'signal-brief', kind: 'brief', text: '受信した信号を解析する', hint: '遠征を受諾するとWAYFARER-3を追跡できます。', target: 'wayfarer' },
      { id: 'signal-approach', kind: 'approach', text: 'WAYFARER-3へ接近する', hint: 'アウレリオンの衛星グラキア周辺。90u以内へ接近してください。', target: 'wayfarer', range: 90 },
      { id: 'signal-eva', kind: 'eva', text: '船を安定させ、船外活動を行う', hint: 'Xで相対速度を落としてH / EVA。探査機と同じ基準系を引き継ぎます。', target: 'wayfarer-recorder' },
      { id: 'signal-recorder', kind: 'investigate', text: '探査機のデータレコーダーを回収する', hint: 'レコーダーへ近づき、E / 調査で回収してください。', target: 'wayfarer-recorder' },
      { id: 'signal-component', kind: 'investigate', text: '保護された記憶素子を回収する', hint: 'レコーダーで見つかった記憶素子も回収します。', target: 'probe-component' },
      { id: 'signal-board', kind: 'board', text: '船へ戻り、回収品を保管する', hint: 'ハッチへ戻ってH / 再入船。Yで帰還支援も利用できます。', target: 'ship' },
      { id: 'signal-return', kind: 'dock', text: 'アステリオンへ帰還する', hint: '基地へ帰還し接舷してください。', target: 'asterion' },
      { id: 'signal-report', kind: 'report', text: '回収した記録を提出する', hint: 'B / 遠征で成果を報告すると、遠方の調査区域が判明します。', target: 'asterion' },
    ], conclusion: '記録に残された座標は、既知の外縁航路よりも遠い。そこでは、かつての人類の遠征が何かを見つけていました。' },
  { id: 'unknown-horizons', number: '06', codeName: 'UNKNOWN HORIZONS', category: '深宇宙探査', title: '未知の領域', location: 'DEEP SPACE / OBSERVATION SITE', reward: 120, prerequisite: 'lost-signal',
    briefing: '記憶素子から復元した座標へ向かいます。現地には旧遠征の観測ブイが残されているはずです。異常な読みを調べ、試料を回収してください。武力ではなく、観測と記録が頼りになる遠征です。',
    objectives: [
      { id: 'horizon-brief', kind: 'brief', text: '復元された深宇宙座標を確認する', hint: '受諾すると遠方の観測地点を追跡します。', target: 'deep' },
      { id: 'horizon-depart', kind: 'depart', text: '母星の基地を出航する', hint: '補給と必要な強化を済ませ、Tで離脱してください。', target: 'deep' },
      { id: 'horizon-approach', kind: 'approach', text: '遠方の観測区域へ到達する', hint: 'ヴェスパーの軌道より先へ。調査地点の220u以内へ接近してください。', target: 'deep', range: 220 },
      { id: 'horizon-eva', kind: 'eva', text: '観測ブイのそばで船外活動を開始する', hint: 'Xで安定させ、H / EVAを選びます。', target: 'deep-readings' },
      { id: 'horizon-readings', kind: 'investigate', text: '観測ブイの異常な信号を測定する', hint: 'E / 調査で、同じ間隔のパルスを記録してください。', target: 'deep-readings' },
      { id: 'horizon-evidence', kind: 'investigate', text: '過去の遠征が残した証拠を回収する', hint: '付近の保管容器を回収。旧遠征の足跡を確かめてください。', target: 'deep-evidence' },
      { id: 'horizon-board', kind: 'board', text: '発見を船へ持ち帰る', hint: '船へ戻り再入船します。探索を続けることもできます。', target: 'ship' },
      { id: 'horizon-return', kind: 'dock', text: '新たな発見とともに母星へ帰還する', hint: 'アステリオンの研究班が、帰還を待っています。', target: 'asterion' },
      { id: 'horizon-report', kind: 'report', text: '発見した星図を研究班へ渡す', hint: 'B / 遠征から成果を報告し、この遠征計画を完了してください。', target: 'asterion' },
    ], conclusion: '帰還、おかえりなさい。星図が示すのは、まだ名前のない次の目的地。基地の灯は、これからの旅でもここにあります。' },
];
export const EXPEDITION_BY_ID = Object.assign(Object.create(null), Object.fromEntries(EXPEDITIONS.map(def => [def.id, def]))) as Record<string, ExpeditionDef>;
export const OBJECTIVE_IDS = new Set(EXPEDITIONS.flatMap(def => def.objectives.map(objective => objective.id)));
