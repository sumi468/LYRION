# 公開情報

- 公開サイト: https://lyrion-lilac.vercel.app
- GitHub: https://github.com/sumi468/LYRION
- Vercel: `lyrion` / `prj_UDIxXipaMWdZIBXvhlOMHy0TI4eY`
- 環境: Production、Vite、Node.js 24.x
- 検証したゲームのソースコミット: `bba7fea36648362dc1bb0a0280867563bd10771d`（v0.4.0）
- 本番デプロイ: `dpl_HzDyKQS3PjbQhTpBb1WYEGc2YM1D`（READY）
- 本番ビルド: `npm ci` → `npm run build` → `dist/`
- GitHub Actions CI: https://github.com/sumi468/LYRION/actions/runs/39972666916 （成功）

2026-10-23に、認証のない新規ブラウザセッションから正式な公開URLを検証しました。14項目すべて通過。HTTP 200、起動、UIからの開始と操縦、一時停止、スキャン報酬、保存復元、通常URLでデバッグAPIを公開しないことを確認しました。配信されたJS / CSS / Oxaniumはローカルの検証済みビルドとSHA-256が一致しました。faviconはWindowsのCRLFとLinuxのLFを正規化して一致しました。

本番でもOxanium / M PLUS 1のロード、効果音を0にしたBGM単独の波形、LX-07の20メッシュ描画、左右の平行移動なしで約39.6度のバンクを確認しました。旋回の位置検査では天体への追従アシストをOFFにして、公転に伴う移動を除いています。ブラウザのコンソール・ページエラーはありませんでした。

さらに本番で戦闘・着陸の15項目を確認しました。Hardの敵3機が出現し、敵弾でシールドが減少、Jから発射して撃破と報酬を取得。Gで降下・接地・修理と補給・公転中の接地維持・保存復元・離陸まで通過しました。敵20回再生成でGeometry38 / Texture15は一定。詳細は [本番の戦闘・着陸データ](validation/production-combat-landing.json)。

詳細は [本番確認データ](validation/production.json)。GitHubの `main` はVercelに接続されており、その後のプッシュも自動デプロイされます。本番の正式URLと、チーム用・個別デプロイの認証付きURLは別です。共有には上記の正式URLを使用してください。認証設定は変更していません。
