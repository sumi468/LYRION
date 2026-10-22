# 公開情報

- 公開サイト: https://lyrion-lilac.vercel.app
- GitHub: https://github.com/sumi468/LYRION
- Vercel: `lyrion` / `prj_UDIxXipaMWdZIBXvhlOMHy0TI4eY`
- 環境: Production、Vite、Node.js 24.x
- 検証したゲームのソースコミット: `7bcc1902e27fd4bad219dbe0144ef68692fe036b`
- 本番ビルド: `npm ci` → `npm run build` → `dist/`
- GitHub Actions CI: https://github.com/sumi468/LYRION/actions/runs/39783602581 （成功）

2026-10-22に、認証のない新規ブラウザセッションから正式な公開URLを検証しました。HTTP 200、起動、UIからの開始と操縦、一時停止、スキャン報酬、保存復元、通常URLでデバッグAPIを公開しないことを確認しました。配信されたJS / CSS / faviconはローカルの検証済みビルドとSHA-256が一致し、ブラウザのコンソール・ページエラーはありませんでした。

詳細は [本番確認データ](validation/production.json)。GitHubの `main` はVercelに接続されており、その後のプッシュも自動デプロイされます。本番の正式URLと、チーム用・個別デプロイの認証付きURLは別です。共有には上記の正式URLを使用してください。認証設定は変更していません。
