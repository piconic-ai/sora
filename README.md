# Sora

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
npm install
npm run dev
```

`npm run dev` runs three watchers in parallel (`bf build --watch` /
`unocss --watch` / `wrangler dev --live-reload`). Open http://localhost:8787.

```sh
npm run test        # Vitest (parser + layout logic in src/lib)
npx tsc --noEmit    # type check
npm run build       # production build (bf build --minify && unocss)
```

## Deploy

```sh
npm run deploy   # bf build --minify && unocss && wrangler deploy
```

Adjust `name` / `compatibility_date` in `wrangler.jsonc` as needed.

## Docs

- [Specification & design](docs/DESIGN.md)
- [Layout diagram](docs/layout-diagram.html) (open in a browser)
