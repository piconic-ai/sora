# Sora

**https://sora.piconic.ai**

A web app that generates a print layout for making paper flashcards: print on a
single A4 sheet, cut into vertical strips, and accordion-fold.

Enter pairs of a front (word) and back (translation), and Sora produces a
single-sided A4 layout. Print → cut into strips → accordion-fold each strip, and
your flashcard booklet is done.

- Single-sided, single black ink, minimal marks — just small dots where the fold
  and cut lines cross
- Zero page margin (borderless)
- No login, no database
- No settings (fixed 4 bands, 20 mm panel height; long words auto-shrink to fit)
- Automatic Japanese/English UI (from the browser's Accept-Language)

"Sora" comes from the Japanese _sora de oboeru_ (そらで覚える) — to learn
something by heart.

## Tech stack

- Cloudflare Workers
- Hono
- [BarefootJS](https://github.com/piconic-ai/barefootjs)

## Development

```sh
bun install
bun run dev
```

`bun run dev` builds once (`vite build` + `unocss`), then runs three
watchers in parallel (`vite dev` / `unocss --watch` /
`wrangler dev --live-reload`). Open http://localhost:8787.

```sh
bun run test      # Vitest (parser + layout logic in src/lib)
bunx tsc --noEmit # type check
bun run build     # production build (vite build && unocss)
```

## Deploy

Production and preview deploys are both handled by Cloudflare Workers
Builds (Cloudflare's own Git integration) — no Cloudflare credential
lives in this repo or in GitHub.

- **Production** (`sora.piconic.ai`): deploys automatically when a
  [tagpr](https://github.com/Songmu/tagpr) release PR is merged — that
  cuts a tag and advances a dedicated `release` branch to it (see
  `.github/workflows/tagpr.yml`), which is what Cloudflare Workers
  Builds actually watches.
- **Preview** (try your own branch): every other branch gets its own
  automatic preview on push, at
  `https://<branch-name>-sora.<subdomain>.workers.dev` (dots in the
  branch name become dashes, e.g. a branch named `fix/foo` becomes
  `fix-foo-sora...`). After pushing, check the "Workers Builds: sora"
  check run on your commit (or Cloudflare dashboard → sora Worker →
  Deployments) for the exact URL — it's also printed as
  `Preview Alias URL` in that check's summary.

```sh
bun run deploy   # vite build && unocss && wrangler deploy — manual/local fallback
```

Adjust `name` / `compatibility_date` in `wrangler.jsonc` as needed.

## Docs

- [Specification & design](docs/DESIGN.md)
- [Layout diagram](docs/layout-diagram.html) (open in a browser)
