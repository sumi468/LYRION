# 公開情報

- 公開サイト: https://lyrion-lilac.vercel.app
- GitHub: https://github.com/sumi468/LYRION
- Vercel: `lyrion` / `prj_UDIxXipaMWdZIBXvhlOMHy0TI4eY`
- 環境: Production、Vite、Node.js 24.x
- 検証したゲームのソースコミット: `26fe5e68aa8a2160c0a3ca0468799dd227b91ccc`（v0.5.0）
- 本番デプロイ: `dpl_HkgdD1rogEgTSUzqkvktQg6ic7gU`（READY）
- 本番ビルド: `npm ci` → `npm run build` → `dist/`
- GitHub Actions CI: https://github.com/sumi468/LYRION/actions/runs/39978335658 （成功）

2026-10-24に、認証のない新規ブラウザセッションから正式な公開URLを検証しました。14項目すべて通過。HTTP 200、起動、UIからの開始と操縦、一時停止、スキャン報酬、保存復元、通常URLでデバッグAPIを公開しないことを確認しました。配信されたJS / CSS / Oxaniumはローカルの検証済みビルドとSHA-256が一致しました。faviconはWindowsのCRLFとLinuxのLFを正規化して一致しました。

本番でもOxanium / M PLUS 1のロード、効果音を0にしたBGM単独の波形、LX-07の20メッシュ描画、左右の平行移動なしで約39.6度のバンクを確認しました。旋回の位置検査では天体への追従アシストをOFFにして、公転に伴う移動を除いています。ブラウザのコンソール・ページエラーはありませんでした。

本番の追撃戦13項目もすべて通過。Normalの3役編隊と後方追跡、6秒の棒立ち連射で撃破0・敵3機が残ること、射撃予告・連射・敵の回避と離脱を確認。Vのコストと冷却、ブースト後の追撃、増援、狙い直しての撃破と爆発まで通過しました。1080pの通常ループで最小4機を確認しながら測定。詳細は [本番の追撃戦データ](validation/production-dogfight.json)。

前版v0.4の着陸・再離陸の公開記録は [戦闘・着陸データ](validation/production-combat-landing.json) に保持しています。v0.5のローカルE2Eでも着陸・修理・保存復元・再離陸を再確認しています。

詳細は [本番確認データ](validation/production.json)。GitHubの `main` はVercelに接続されており、その後のプッシュも自動デプロイされます。本番の正式URLと、チーム用・個別デプロイの認証付きURLは別です。共有には上記の正式URLを使用してください。認証設定は変更していません。
