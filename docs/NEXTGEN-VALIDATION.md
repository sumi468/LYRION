# 次世代探査・開発版の検証記録

対象: `0.9.0-dev.1` / `codex/planetary-exploration`。公開中のv0.8.0とは別のローカル開発版です。
この記録は今回成立させた経路と限界を示すもので、依頼された全フェーズの最終完了宣言ではありません。

## 実装した経路

新規ゲームのASTERION近傍 → 実推進によるPRIMEへの接近 → 大気・高度12 kmの雲層を通過 → 実地形へ着陸 → Hで降機 → 重力下で歩行 → 岩石調査・試料採取 → 地上本部へ報告 → ハッチへ歩いて帰還・再搭乗 → 連続離陸 → 実推進で高度120 kmへ帰還 → FIRST STEPS報酬150 DATAを一度だけ受領。

ブラウザの検証では調査の完了フラグや報酬を直接書き換えていません。地上移動は通常の入力と衝突処理、調査・報告は範囲と作業時間の判定を通します。途中でページを再読込して、機内への安全復帰と調査進行の永続化も確認します。
軌道からの連続降下テストはQA用の姿勢制御で操舵し、位置は通常の飛行物理で積分します。初期位置からのテレポートは使いません。手動tickによる加速再生で、シミュレーション約98.4秒後に無傷で接地しました。

## 発見・修正した問題

| 再現・影響 | 原因 | 修正と再確認 |
|---|---|---|
| PRIMEに着陸できず、着陸中は降機もできない | 既存の着陸許可がホームワールドを除外し、地上操作モードが未実装 | 地形高度を使う着陸と独立したSurfaceSystemを追加。降機・歩行・搭乗をブラウザで通過 |
| 大きな天体への変更だけでは衝突・視点・保存位置が一致しない | 旧310単位のPRIMEと小さな座標系、近い遠クリップ、Y軸だけの着陸回転 | 半径・軌道・周期・リング・雲・クリップを同じ契約へ変換。軸傾斜と自転を共有し、描画前に原点を差し引く |
| WebGPUのベイク中に`ShaderMaterial is not compatible` | 小さなベイク用シーンが既存材質を差し替えると、材質変換キャッシュの更新を通らない | 動的材質シーンを明示。実デバイスのベイク・描画エラーがなくなることを確認 |
| GPUデバイス喪失テストで自動復帰しない | Threeの既定処理は明示的にdestroyされたデバイスを通知対象から除く | 所有デバイスのlostを監視し、進行を保存してWebGL 2で再起動。アダプター取得失敗時も復帰 |
| 地上の空が機体や地面を覆う | 背景用の透明描画が奥行きを無視していた | 空を最遠深度に限定。機体と地形を実画面で再確認 |
| WebGPUだけ地上の空が白くなる | NodeMaterialの既定fogがGLSL材質のfog=falseと異なり、大気に二重の霧がかかる | 元材質のfog設定を継承。地上の散乱と軌道の大気も連続して切り替える |
| 地上基地のパッドが表示されない | 再利用したLandingViewの初期visible=false | 常設基地のパッドを明示的に表示。実画面で確認 |
| ハンガー側壁を通り抜ける／地上の壁との接触で下へ押される | 外装に対応するコリジョンの不足と、無重力用カプセルが壁の下面へ抜ける解決経路 | 側壁と屋根を定義し、基礎を地下まで延長。側方へ押し戻し、中央の入口は通行可能とする回帰テスト |
| 地上で上を見ると宇宙服全体が傾く | 視線のピッチを身体と接地カプセルにも適用していた | ヘルメット視線と直立する身体の回転を分離。再現時の上方向内積0.796から、修正後は1を保つ回帰テスト |
| 軌道帰還の誘導が地表を指す／再開すると旧ミッションを追跡する | 地上任務の特殊な目的地を基地へフォールバックし、既存の開始時ターゲット設定を優先していた | ハッチ・高度120 kmの目標点を別々に算出。保存再開と任務切り替えも追跡先を同期し、ブラウザで再現テスト |
| 戦闘中に巡航ブーストで敵が消える | 新しい長距離用の倍率を交戦中にも適用 | 交戦中は通常のブースト。追撃・増援・撃破の既存テストを通過 |
| 低い地形でEVA帰還を拒否する | 地形より上でも、名目の球体半径だけで経路を遮断していた | 共通高さ関数による有界な経路サンプリング。谷・接触・反対側の拒否と安全回収を再検証 |
| オフラインでHTMLだけ開き、JS・CSS・フォントが失敗する | 配信側のVary: Originとプリキャッシュのリクエストが一致しない | 同一オリジンの既知の静的ファイルだけ、正規化したキーとignoreVaryで取得。オフライン起動・セーブ復帰を通過 |

## 主な変更ファイル

- スケール・基準系: `physics/worldScale.ts`, `surfaceFrame.ts`, `data/starSystem.ts`, `homeworld.ts`。
- 共有地形・衝突・LOD: `physics/terrain.ts`, `terrainLod.ts`, `terrainSegment.ts`, `render/PlanetTerrain.ts`, `terrainTexture.ts`。
- 実WebGPUとフォールバック: `RendererRuntime.ts`, `backendPolicy.ts`, `ShaderBridge.ts`, `shaderRegistry.ts`, `tslPrograms.ts`。GLSLのベイク・惑星・雲・大気・リング・恒星・背景・星・宇宙塵にネイティブのTSL経路を用意。
- 地上・基地・任務: `systems/surface.ts`, `surfaceCampaign.ts`, `render/PrimeBase.ts`, `SurfaceSky.ts`, `AstronautModel.ts`, `data/surfaceCampaign.ts`。
- 統合・操作: `core/Game.ts`, `core/state.ts`, `ui/Operations.ts`, `Ui.ts`, `Hud.ts`, `TouchControls.ts`。
- 保存: `systems/save.ts`。旧セーブを原文のまま一度バックアップし、天体付近では安全な地表クリアランス、機材付近ではローカル位置と向きを保つ。元の8ミッションと6遠征のID・進捗・報酬は維持。
- 配布: `public/favicon.svg`, `favicon.ico`, `icons/`, `manifest.webmanifest`, `scripts/export-icons.mjs`, `write-service-worker.mjs`。

## 画面

すべてゲーム本体または同じゲームシーンの点検カメラから取得した画像です。アイコンは独自SVGをブラウザでラスタライズしました。

| 確認対象 | 画像 |
|---|---|
| 軌道上のPRIME | [軌道](screenshots/nextgen-descent-orbit.png) |
| 接近 | [接近](screenshots/nextgen-descent-approach.png) |
| 大気・雲への進入 | [大気](screenshots/nextgen-descent-atmosphere.png) |
| 低い目線の地平線 | [地平線](screenshots/nextgen-final-webgpu-coast.png) |
| 海岸・海面 | [海岸](screenshots/nextgen-final-webgl2-coast.png) |
| 地上基地 | [基地](screenshots/nextgen-base.png) |
| 着陸したLX-07 | [着陸](screenshots/nextgen-final-webgpu-surface.png) |
| 宇宙飛行士の歩行 | [地上歩行](screenshots/nextgen-walking.png) |
| ASTERION | [ステーション](screenshots/nextgen-final-webgpu-station.png) |
| 実WebGPUの表示 | [WebGPU](screenshots/nextgen-final-webgpu-eva.png) |
| アプリアイコン | [512 px](../public/icons/icon-512.png) |

スーツの[正面](screenshots/90-astronaut-front.png)・[側面](screenshots/90-astronaut-side.png)・[背面](screenshots/90-astronaut-back.png)・[機体横](screenshots/90-astronaut-beside-lx07.png)・[ステーションEVA](screenshots/90-astronaut-station-eva.png)も既存の視覚回帰で取得します。

## 検証環境と結果

Windows / NVIDIA GeForce RTX 4060 / Chrome 156 / Node 24。WebGL 2はANGLE D3D11、WebGPUは実アダプター`nvidia / lovelace`と実デバイス・実ドローを確認。ソフトウェアGPUによる結果ではありません。

- TypeScript、120単体テスト、ビルドが通過。旧セーブ、ステーション・衛星・深宇宙の位置と向き、地形継ぎ目の数学、チャンク数上限、重力、反復搭乗、基地壁、調査時間、報酬の一回性を含みます。
- 既存E2E一式が通過。新しい地上キャンペーンはWebGL 2 / WebGPUの双方で通過。
- エミュレートした390×844のタッチ操作で、降機・歩行・ジャンプと、歩行中に機体を操縦しないことを確認。スマホ実機の検証ではありません。
- WebGPUのデバイス喪失・初期化失敗、WebGLコンテキスト復帰、オフライン起動・セーブ復元を検証。
- 8場面のFPSと描画時間・リソース数は [測定JSON](validation/nextgen-performance.json)。1280×720・Medium・ヘッドレス・各約1.8秒です。ディスプレイの実表示FPS、スマホの性能保証、長時間の安定性を示す値ではありません。

### 8場面の最終測定

測定対象ソース: `644b33a6e4878b7912aed3960c5cc74c03299e682e56de021800f1902b2592fc`。
この測定後の配布物への変更はThree.jsの権利表示の同梱のみで、描画・操作の処理は同じです。
Chrome156.0.8078.76 / RTX4060 / 1280×720 / Medium。各シーン約1.8秒、ウォームアップ後のrAF周期から集計。

| 場面 | WebGL 2 FPS | WebGPU FPS |
|---|---:|---:|
| 宇宙 | 175.5 | 168.3 |
| PRIME軌道 | 174.6 | 167.3 |
| 大気進入 | 175.8 | 168.3 |
| 地上・基地 | 175.2 | 168.1 |
| 海岸 | 176.7 | 168.8 |
| ステーション | 175.9 | 168.3 |
| EVA | 171.7 | 169.0 |
| 戦闘 | 172.7 | 167.7 |

両方式のp95フレーム間隔は約6.1ms。WebGPUの実timestamp queryは約0.13〜0.39msで、ブラウザによる量子化を含みます。API間の優劣や実モニターの更新速度をこの短いヘッドレス試験だけで断定しません。
軌道へ戻った後の未使用地形チャンクは両方式とも0を確認しました。

### 連続飛行

[120秒の実時間テスト](validation/gpu-soak.json)は1920×1080・High・実GPUのWebGL2で実施。6天体の付近を繰り返し移動し、旋回・推進・制動を実行しました。約121秒・20測定点で全状態が有限、操作不能・fatal表示・ページ/コンソールエラーなし。約166.6〜178.4FPS、テクスチャ24で一定、終盤のリソースピークが初期の範囲に収まる判定を通過しました。
この連続試験は視線・身体の分離までを含む先行スナップショットであり、その後の任務誘導・基地壁の修正については個別E2Eと単体テストで再検証しています。

### 実行コマンド

`npm run typecheck` / `npm test` / `npm run build` / `npm run test:e2e`。
追加の検証は `tests/e2e/surface-expedition.mjs`（`RENDERER=webgpu`でも実行）、`descent-continuity.mjs`、`surface-touch.mjs`、`renderer-native.mjs`、`pwa.mjs`、`nextgen-performance.mjs`。連続試験は `node tests/e2e/soak.mjs`。

## 残っている作業・限界

- モバイル実機、Safari、別GPU、WebGPU非対応の実機、数時間規模の連続プレイは未検証。
- 地形は共有された3Dノイズの球面チャンクとスカート。全周のLOD境界・極付近・急斜面と段差の全組合せを視覚確認したわけではありません。地上の植生・岩肌の密度と造形はまだ改善の余地があります。
- 海は曲面とPBR反射光・法線アニメーションです。大規模な海洋シミュレーションや実景の反射、砕波は未実装。空・雲も負荷を抑えた近似であり、最終的な大気散乱品質の調整は残ります。
- ASTERIONは既存のISS風のモジュール・トラス・パネルと接岸機構を維持して新座標系で検証しています。追加の大規模なステーション再造形は今回完了していません。
- 地上基地は外装と近傍の端末が機能します。建物の内装やハンガー内部のゲームプレイは未実装です。
- PRIME以外の全地表について、軌道アルベドと詳細地形の完全な表現統一、生命維持・温度などの地上環境バランスは完了していません。今回の通し検証はPRIMEの経路が中心です。
- 従来の全機能・新しい地上探査を同じ条件で実機プレイし続けた最終バランス調整、音の聴感確認は残ります。
- 新しい開発版は本番未公開です。公開中のv0.8.0と旧配布ZIPを保持しています。
