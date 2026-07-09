# Sora（そらで覚える）

A4用紙に印刷して、縦に切って蛇腹に折るだけで単語帳ができる、印刷用レイアウト生成Webアプリ。

表面（単語）と裏面（訳）のペアを入力すると、A4片面印刷用のレイアウトを生成します。印刷 → 縦に切って帯に分ける → 各帯を蛇腹（アコーディオン）に折る、で単語帳が完成します。

- 片面印刷のみ・黒一色・最小限インク（折る／切る位置は端の目印だけ）
- 用紙マージン0（フチなし）
- ログイン不要・DB不要
- 設定不要（帯4本・パネル高さ20mm固定、長い語はフォントサイズを自動調整）
- 日英UI自動切替（ブラウザのAccept-Languageを判定）

## 技術スタック

- Cloudflare Workers
- Hono
- BarefootJS

## 開発

```sh
npm install
npm run dev
```

`npm run dev` は3プロセスを並行起動します（`bf build --watch` / `unocss --watch` / `wrangler dev --live-reload`）。`http://localhost:8787` で確認できます。

```sh
npm run test       # Vitest（src/lib のパーサ・レイアウト計算ロジック）
npx tsc --noEmit    # 型チェック
npm run build       # 本番ビルド（bf build --minify && unocss）
```

## デプロイ

```sh
npm run deploy   # bf build --minify && unocss && wrangler deploy
```

`wrangler.jsonc` の `name` / `compatibility_date` を必要に応じて調整してください。

## ドキュメント

- [仕様・設計](docs/DESIGN.md)
- [レイアウト図](docs/layout-diagram.html)（ブラウザで開いて参照）
