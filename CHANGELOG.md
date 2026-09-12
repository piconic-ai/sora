# Changelog

## [v0.1.1](https://github.com/piconic-ai/sora/compare/v0.1.0...v0.1.1) - 2026-09-12

- Migrate from npm to bun, matching koma/tate by @kfly8 in https://github.com/piconic-ai/sora/pull/32
- Add Renovate config, matching koma by @kfly8 in https://github.com/piconic-ai/sora/pull/34

## [v0.1.0](https://github.com/piconic-ai/sora/commits/v0.1.0) - 2026-09-12

- 単語プリント: 仕様・設計とレイアウト図 by @kfly8 in https://github.com/piconic-ai/sora/pull/2
- FB1: bump BarefootJS to 0.18.5, extract sheet geometry (innerHTML removal blocked upstream) by @kfly8 in https://github.com/piconic-ai/sora/pull/4
- Integrate FB2–FB5 into main (stacked PRs merged into their bases, not main) by @kfly8 in https://github.com/piconic-ai/sora/pull/9
- Persist the draft across reloads via IndexedDB (autosave + restore) by @kfly8 in https://github.com/piconic-ai/sora/pull/10
- Input history: snapshot on print/new, browse & load past lists (IndexedDB) by @kfly8 in https://github.com/piconic-ai/sora/pull/12
- History as a left sidebar of editable lists (/l/{id}) by @kfly8 in https://github.com/piconic-ai/sora/pull/14
- Wider editor, sidebar toggle/drawer, standalone /how-to page by @kfly8 in https://github.com/piconic-ai/sora/pull/15
- Rename lists via a three-dot menu (custom titles) by @kfly8 in https://github.com/piconic-ai/sora/pull/16
- Single-circle info button by @kfly8 in https://github.com/piconic-ai/sora/pull/17
- Editing & sidebar tweaks: Backspace symmetry, full-height divider, relocated toggle by @kfly8 in https://github.com/piconic-ai/sora/pull/18
- Fix scrollbar from the full-height sidebar divider by @kfly8 in https://github.com/piconic-ai/sora/pull/19
- Serve production from sora.piconic.ai (custom domain) by @kfly8 in https://github.com/piconic-ai/sora/pull/20
- Bump BarefootJS to 0.18.7 (innerHTML removal still blocked by barefootjs#2264) by @kfly8 in https://github.com/piconic-ai/sora/pull/21
- feat: How To ページにYouTube動画を埋め込み、手順を5ステップに更新 by @kfly8 in https://github.com/piconic-ai/sora/pull/22
- Add MIT license by @kfly8 in https://github.com/piconic-ai/sora/pull/23
- Add live print preview and streamline the editor UI by @kfly8 in https://github.com/piconic-ai/sora/pull/24
- Remove the on-screen preview; restore a single-column editor by @kfly8 in https://github.com/piconic-ai/sora/pull/25
- Keep the print tip on one line by @kfly8 in https://github.com/piconic-ai/sora/pull/26
- Serve each locale at its own URL and inline the how-to as a modal by @kfly8 in https://github.com/piconic-ai/sora/pull/27
- Add a copy-the-table action and round out paste import by @kfly8 in https://github.com/piconic-ai/sora/pull/28
- PWA化：オフライン対応と手元アプリとしてのインストール by @kfly8 in https://github.com/piconic-ai/sora/pull/29
- Set up tagpr release flow + Cloudflare Workers Builds deploy by @kfly8 in https://github.com/piconic-ai/sora/pull/30
