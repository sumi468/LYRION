# 公開情報

- 公開サイト: https://lyrion-lilac.vercel.app
- GitHub: https://github.com/sumi468/LYRION
- Vercel: `lyrion` / `prj_UDIxXipaMWdZIBXvhlOMHy0TI4eY`
- 環境: Production、Vite、Node.js 24.x
- 検証したゲームのソースコミット: `d9b315e4c8441931793f7161b758f2723f6003d5`（v0.3.0）
- 本番デプロイ: `dpl_7R7qZAmPVd3LqkZdsX2GnSR6XA8d`（READY）
- 本番ビルド: `npm ci` → `npm run build` → `dist/`
- GitHub Actions CI: https://github.com/sumi468/LYRION/actions/runs/39835673020 （成功）

2026-10-23に、認証のない新規ブラウザセッションから正式な公開URLを検証しました。14項目すべて通過。HTTP 200、起動、UIからの開始と操縦、一時停止、スキャン報酬、保存復元、通常URLでデバッグAPIを公開しないことを確認しました。配信されたJS / CSS / Oxaniumはローカルの検証済みビルドとSHA-256が一致しました。faviconはWindowsのCRLFとLinuxのLFを正規化して一致しました。

本番でもOxanium / M PLUS 1のロード、効果音を0にしたBGM単独の波形、LX-07の17メッシュ描画、左右の平行移動なしで約39.6度のバンクを確認しました。旋回の位置検査では天体への追従アシストをOFFにして、公転に伴う移動を除いています。ブラウザのコンソール・ページエラーはありませんでした。

詳細は [本番確認データ](validation/production.json)。GitHubの `main` はVercelに接続されており、その後のプッシュも自動デプロイされます。本番の正式URLと、チーム用・個別デプロイの認証付きURLは別です。共有には上記の正式URLを使用してください。認証設定は変更していません。
