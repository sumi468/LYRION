# v0.6.0 公開情報

- 公開サイト: https://lyrion-lilac.vercel.app
- GitHub: https://github.com/sumi468/LYRION
- Vercel: `lyrion` / `prj_UDIxXipaMWdZIBXvhlOMHy0TI4eY`
- 環境: Production / Vite / Node.js 24.x
- 検証したゲームのソースコミット: `23bf255f1e282904f7fdbb160a70b48e2e79e1a9`
- 本番デプロイ: `dpl_BdgZEDXoPYfxzjUp1CgRULsSEAfo`（READY）
- GitHub Actions CI: https://github.com/sumi468/LYRION/actions/runs/39985804334 （成功）
- 本番ビルド: `npm ci` → `npm run build` → `dist/`

2026-10-24に、認証のない新規ブラウザから正式な公開URLを検証。**55項目すべて通過**しました（基本15・仕上げ12・戦闘着陸15・追撃13）。ソースの変更に対するローカルの45単体・109 E2E、2種類のGPU測定、5分の連続戦闘も通過しています。

## 公開アセットと通常の起動

HTTP 200、UIからの新規開始・操縦・一時停止、スキャン報酬・保存復元を確認。通常URLではデバッグAPIを公開しません。公開された2本のJS・CSS・Oxanium・M PLUS 1は検証済みのローカルビルドとSHA-256が一致。faviconはWindows / Linux間の改行だけを正規化して一致しました。

同梱の日本語・英数字フォント、BGM単独の波形、20メッシュの機体、横移動なしのバンク旋回を確認しています。[基本の生データ](validation/production.json)。

## 仕上げ・戦闘・着陸

- 旧設定からもFPS・フレーム時間・画質を初期表示し、OFF保存・再読込み・再度ONを確認。
- 基地7バッチ・探査機4バッチ・敵機の形状予算・最大12閃光と120火花を検査。全11天体を描画し、最小の衛星での基礎の長さも検査。
- 390×844 / 800×360でFPSと体力・戦闘・タッチボタンが重ならず、縦画面の目標・速度・着陸案内も独立。
- Hardの5機、敵弾による被弾、Easy敵の撃破報酬、難易度OFFを確認。
- 降下・接地・着陸脚・修理補給・公転自転への追従・保存復元・離陸・降下中止が公開サイトでも通過。
- Normalの3役、棒立ち連射で撃破0・敵3機が残ること、予告・連射・回避・離脱、ブースト後の追撃、増援、狙い直した撃破とFXまで確認。
- コンソール・ページエラー0件。敵編隊20回再生成でもGPUリソース数は増えませんでした。

[仕上げ](validation/production-polish.json) / [戦闘着陸](validation/production-combat-landing.json) / [追撃](validation/production-dogfight.json)。デバッグAPIは移動・検査用の配置と時間短縮に使い、AI・弾・操縦・報酬・保存は実装された通常ロジックを通しています。

## 性能

このPCのRTX 4060 / 通常Chrome / 1080p / Highで、3場面の平均167.4〜170.6 FPS。FPSはブラウザのフレーム頻度であり、端末・画面更新頻度・負荷に依存します。測定条件・未検証の環境は [検証レポート](VALIDATION.md) にあります。

GitHub `main` はVercelへ接続され、プッシュで自動公開されます。共有には先頭の正式URLを使用してください。チーム用URL・個別デプロイの認証設定は変更していません。
