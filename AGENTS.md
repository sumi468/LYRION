# AGENTS.md — LYRION 作業ガイド（Codex / 他のコーディングエージェント向け）

LYRION は TypeScript + Three.js + Vite のブラウザ3D宇宙探索ゲーム。全体像・操作・機能一覧・既知の問題は **README.md** を先に読むこと。
このファイルは「どう作業し、何を壊してはいけないか」だけを書く。

## 必須コマンド（変更後に必ず通す）

```bash
npm install
npm run typecheck && npm test && npm run build
```

描画（`src/render/`）・入力（`src/input/`, `src/ui/TouchControls.ts`）・`Game.ts` に触れたら、さらに E2E:

```bash
npx playwright install chromium   # 初回のみ。Windowsはインストール済みChromeも利用可
npm run build && npm run test:e2e                         # 探査・タッチ・回帰・操縦・戦闘着陸
```

- E2E は `?debug` で公開される `window.__lyrion`（Game）を使い、`tick()` を手動で進める決定的な方式。GPU が無い環境(SwiftShader)でも動くよう、画質 low・小さい画面で走る。
- 実GPUの測定結果は `docs/VALIDATION.md` と `docs/validation/*.json`。ヘッドレスのrAF頻度をディスプレイFPSと同一視しないこと。新しい性能の主張には再測定を添える。

## 構成の約束

- `src/data/` … 天体・ミッション・アップグレードの定義。**コンテンツ追加はまずここ**。`tests/logic.test.ts` が参照整合性と進行可能性を検査する。
- `src/systems/`, `src/physics/` … three/DOM に依存しない純粋ロジック。**単体テストを書ける形を保つ**（DOMを持ち込まない）。
- `src/render/` … 描画。`quality.ts` の `QUALITY_LADDER` が画質を一元管理。新しい負荷の高い効果は必ずここの段階に紐づける。
- `src/ui/` … DOM は `dom.ts` の `h()` で組む（innerHTML 禁止。文字列は常にテキスト扱い）。
- `src/core/Game.ts` … 統括。肥大化しているので、新機能は可能な限り別モジュールに切り出す。

## 守ること

1. **Floating Origin**: 描画座標は常に原点相対。ワールド座標を直接 Three のオブジェクトに入れない（`origin` を引く）。
2. **天体位置は時刻の純関数**（`orbits.ts`）。状態を持つ積分に変えない。セーブ互換が壊れる。
3. **セーブ互換**: `SaveData` の形を変えるときは `SAVE_VERSION` を上げ、`deserialize` で旧版を読めるか、安全に捨てること。破損データで落ちないテストがある。
4. **毎フレームの割り当て禁止**: ループ内で `new Vector3()` 等を作らない（`_v1` のような再利用変数を使う）。
5. **リソース破棄**: Geometry / Material / Texture / RenderTarget を作ったら `dispose()` 経路を用意する。
6. **ブラウザ操作と競合するキー**は `Input.ts` の `PREVENT`（プレイ中のみ）で処理済み。キーを足すときもここに入れる。
7. **未検証を完了扱いしない**。確認できなかった項目は README の「検証状況」に「未検証」と書く。

## 次の拡張で優先すること

1. 別GPU・スマホ実機でのFPS計測と `QUALITY_LADDER` / `AutoQuality` の調整
2. タッチ操作の実機確認（スティック径、`LOOK_GAIN`、ボタン配置、iOS Safari）
3. 操作感の調整（`physics/flight.ts`）— 実際に遊んで判断
4. 数時間以上の連続プレイと音の聴感確認
5. Safari / Firefoxの実機確認

v0.2でテクスチャの段階生成・進捗表示、雲・大気の調整、Web Audioを実装済み。音は `src/audio/` に集約し、ユーザー操作・一時停止・リソース破棄の検証を維持する。

`npm run test:gpu` は実GPUが必須。`npm run test:soak` は既定120秒の実時間飛行、`npm run test:launcher` は配布版サーバーを検査する。画質変更の非同期ベイクは `game.texturesReady` を待ってからリソース数を測る。

## 既知の落とし穴

- `debugTeleport()` は天体位置を即時更新する。進行テストでは報酬やスキャン済み状態を直接書き換えず、通常APIを使う。
- 大気シェーダーは `ATMO_THIN` で薄さを決めている。値を上げると円盤全体が白く塗りつぶされる（過去に修正した不具合）。
- ソフトウェアGLでは High・高解像度の描画が極端に遅い/停止する。実GPUでの再現は不明。

## v0.4の機体システム

`systems/combat.ts` は敵3機・弾96発の固定プール。描画は `render/CombatView.ts` のInstancedMesh。`systems/landing.ts` は接地位置を公転・自転に追従させる。着陸時は衝突反発と戦闘を止め、再離陸時に通常飛行へ戻す。セーブv2はv1を読み込める。`npm run test:combat`、`SOAK_COMBAT=1 npm run test:soak` で新機能を検証できる。
