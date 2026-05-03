# lex-web — current status

A Next.js 16.2 + React 19 + Tailwind v4 web app reading from the lex-brain
Supabase project. Bulgarian UI throughout. Deploy target: Vercel.

## Routes (all server components, all return 200, all verified)

- `/` — homepage: hero search box (GETs to `/search`) + 6 category tiles
  with live counts from `laws`. Total displayed: **1,240** (1+24+385+385+385+60).
  `revalidate = 3600`.
- `/laws` — list of all 1,240 laws, sortable by name. `?category=<key>`
  filter via pill nav. `revalidate = 3600`.
- `/laws/[slug]` — single law reader. Fetches metadata, articles
  (grouped chapter → section in display order), and cross-references in
  parallel. Article anchors `#art-<number>` linkable from search.
  `revalidate = 3600`. **Verified** with `konstitutsiya-na-republika-balgariya`
  (10 chapters render correctly).
- `/search?q=…` — full-text search via the `search_articles` Postgres RPC.
  Renders 50 top-ranked hits with `<mark>`-highlighted snippets.
  **Verified** with `договор` (50 hits, 126 highlight marks).

## Lib

- `lib/supabase.ts` — Supabase JS client + shared row types.
- `lib/queries.ts` — typed query helpers. **`getCategoryCounts` and
  `listLaws` paginate in 1000-row chunks** to work around PostgREST's
  `db-max-rows=1000` cap (otherwise the corpus silently truncates to 1,000).
- `lib/categories.ts` — single source of truth for the 6 category keys
  and Bulgarian display names.

## Data layer (in `~/Desktop/lex-brain`)

- `db/schema.sql` — added a `law_articles` table (slug, ordinal,
  chapter_title, section_title, article_number, text_content + a
  generated `tsvector` column using PG's `simple` config — no Bulgarian
  stemmer exists in PG, but `simple` works fine for token matching across
  Cyrillic). GIN index on the tsv. Plus a `search_articles(q, lim)` SQL
  function returning ranked hits with `ts_headline` snippets joined to
  `laws` for display name + category.
- `scripts/load_articles.py` — flattens every law's chapters → sections
  → articles → paragraphs into rows and bulk-loads via psycopg2.
  Idempotent (TRUNCATEs and reloads).

**Already applied to production Supabase: 65,832 article rows across
1,203 laws.**

## Known gaps

- **37 source JSONs have no extractable articles** (out of 1,240). Their
  `chapters` and `orphan_articles` are both empty in the parsed output —
  this is a lex-brain parser limitation, not a lex-web bug. They split:
  ~19 are pharmacotherapy / medical-standard ordinances whose body lives
  in a PDF appendix; ~17 are declaratory laws (ratifications, treaty
  denunciations, agency abolitions) that use `§`-numbered transitional
  provisions rather than `Чл.`. The reader page shows a graceful
  fallback. Fix would go in `lex-brain/src/lex_scraper/parser.py`.

## Deploy

Push to GitHub, import on Vercel, set env vars `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `.env.example` is committed.
`bun run build` is green.
