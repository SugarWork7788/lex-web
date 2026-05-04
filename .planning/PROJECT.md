# lex-web

## What This Is

Public-facing reader for the entire body of Bulgarian law (1240 statutes, 65 832 articles), augmented with AI explanations, an Intel Center (sanctions, offshore, OLAF, prosecution, NAP), an EU regulations corpus, and a "National Legal Audit" — an AI-generated critical analysis of the Bulgarian legal system across 10 domains. Users (citizens, journalists, lawyers) read laws, ask questions of an in-page AI bound to that law, browse court practice, and see structured findings + reform recommendations. Live at `lex-web-eta.vercel.app`; deployed on Vercel; data lives in Supabase.

## Core Value

Every Bulgarian citizen can read, understand, and act on the law that affects them — without paying for a lawyer to translate it.

## Requirements

### Validated

<!-- These already shipped (v1.0 → v2.1) and are working in production. -->

- ✓ Browse all 1240 Bulgarian laws by category (`/laws`) — v1.0
- ✓ Read a full law with article-level navigation and search-highlight (`/laws/[slug]`) — v1.0
- ✓ Cross-reference between laws (15 364 cross-references mapped) — v1.0
- ✓ AI chat bound to a single law's text (`/api/chat/[slug]`, streaming, Bulgarian markdown) — v1.0
- ✓ Compare two laws side-by-side (`/compare/[slug1]/[slug2]`) — v1.0
- ✓ Per-law AI deep-analysis pipeline (`/analyze/[slug]`, multi-pass) — v1.0
- ✓ Court decisions reader (VKS / VAS / KS) with filters by year and act type (`/courts`) — v2.0
- ✓ AI summary + chat per court decision (`/api/courts/{summarize,chat}/[court]/[id]`) — v2.0
- ✓ EU regulations reader (CELEX) with summaries and chat (`/eu`, `/eu/[celex]`) — v2.0
- ✓ Intel Center: sanctions, offshore entities, OLAF cases, NAP rulings, prosecution, articles (`/intel/*`) — v2.0
- ✓ Intel AI search across all intel sources (`/api/intel/search`) — v2.0
- ✓ National Legal Audit page with 354→352 findings across 10 domains, severity-coded, votable (`/audit`, `/audit/finding/[id]`) — v2.1
- ✓ Reform timeline visualization on /audit (3 horizontal lanes, severity-colored squares, click-to-finding) — v2.1
- ✓ Print CSS with diagonal `LEX.BRAIN` SVG-tile watermark for PDF export of /audit — v2.1
- ✓ Email alerts subscription via Resend (`/api/alerts/{subscribe,unsubscribe}`) — v2.0
- ✓ Interactive legal-system map (`/map`) — v2.0
- ✓ Smart-scroll AI chat (sticky-bottom only when at bottom; jump-down pill; stop button; abort propagation to upstream Anthropic stream) — v2.1
- ✓ Security hardening: per-IP per-route rate limiting (`lib/rate-limit.ts`), 6 security headers (CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy), atomic `increment_audit_vote` Postgres RPC, `name_bg` header-injection sanitiser, generic-error unsubscribe (XSS fix), `AUDIT_VOTE_SALT` env var, idempotent `subscribe` — v2.1.x

### Active

<!-- Targeted for v2.2 — see `/gsd-new-milestone v2.2` artifacts. -->

- [ ] Stream OpenSanctions CSV ingestion instead of loading the full ~300-500 MB file into memory (audit LOW #10)
- [ ] Tighter per-IP rate limit tuning + observability (currently flat 10/min for chat, 3/5min for analyze) — surface `Retry-After` in UI
- [ ] Intel AI search v2 (`/intel/search`): better ranking, multi-source quote-style results
- [ ] Audit PDF export — server-rendered single-file PDF with watermark (currently print-CSS only)
- [ ] Mobile UI improvements (audit page card density, intel filters, reader font scaling)
- [ ] CodeRabbit GitHub App installed on the repo so every PR auto-reviews

### Out of Scope

- Native mobile app — web-first; reader works on mobile, app would 5x scope — defer indefinitely
- User accounts / login — anonymous reader app; only optional email opt-in for alerts — keeps friction zero
- Comments / discussion threads on laws — moderation cost dwarfs reader value; alerts cover the "tell me when X changes" use case
- Editorial CMS — laws come from scrapers (lex-brain), not human-authored content
- Paid tier / subscriptions — non-commercial public service
- Languages other than Bulgarian — corpus is BG; translation is a separate product

## Context

- **Stack:** Next.js 16.2.4 (App Router) + React 19.2.4 + Tailwind 4 + TypeScript 5 + bun. Backend: Anthropic SDK (`@anthropic-ai/sdk`) for streaming chat/summary/audit, Supabase (`@supabase/supabase-js`) for Postgres + RLS, Resend for transactional email, Vercel for hosting + Edge.
- **Data source:** the `lex-brain` repo (sibling project) runs the scrapers (VKS/VAS/KS courts, EUR-Lex, ICIJ, OpenSanctions, OLAF, EPPO, NAP, PRB, Bivol) and writes into the same Supabase Postgres. lex-web is a read-mostly consumer; only audit votes, alert subscriptions, and the per-day generated audit findings are written from the web side.
- **Routing:** App Router with async `searchParams` (Next 16 convention). 22 routes; ~half are `ƒ` (server-rendered on demand), the rest static or ISR.
- **Auth model:** anon-key Supabase client by default; service-role key only used by `/api/audit/vote` (which has its own IP-rate-limit + fingerprint dedupe + atomic RPC).
- **AI surface:** 9 Anthropic-using API routes, all streaming, all using `claude-sonnet-4-6`, all now propagate client-disconnect to abort the upstream stream (saves token spend on user navigation away).
- **Security baseline (post-v2.1.x audit):** rate-limit-then-stream pattern, no XSS reflection in `unsubscribe` errors, header-injection-proof email subjects, atomic vote increment, full security-headers set on all responses.
- **Cron / orchestration:** none on lex-web side. All ingestion + AI audit generation runs in lex-brain (cron + Telegram-controlled).

## Constraints

- **Tech stack**: Next.js 16 + React 19 — these are NOT the Next.js most LLM training data describes (`AGENTS.md` flags this). Read `node_modules/next/dist/docs/` before writing routing/data-fetching code.
- **Hosting**: Vercel. Edge functions can't stream Anthropic SDK calls — all streaming routes are `runtime: "nodejs"` with `maxDuration` set explicitly.
- **Anthropic budget**: shared with lex-brain. `/api/analyze/[slug]` is the most expensive route (300s maxDuration, 4 chained calls, up to 16k tokens each) — kept gated by 3-req/5-min IP rate limit.
- **Bulgarian text**: all UI + AI prompts are Bulgarian Cyrillic. Tokenization is denser than ASCII; output token budgets must allow for that.
- **No login** — every safety/abuse mitigation must work without user identity (IP + fingerprint hashing, rate limits, RLS).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js 16 App Router (not Pages Router) | New routing model, cleaner data-fetching, Server Components | ✓ Good |
| Supabase Postgres (not Vercel Postgres) | Already paid for via lex-brain ingestion; one DB serves both repos | ✓ Good |
| `lex-brain` writes corpus, `lex-web` reads | Clean separation; web stays stateless and cheap | ✓ Good |
| Streaming Anthropic responses (not buffered) | UX requires <2s first token on chat; long generations would hit Vercel function timeout | ✓ Good |
| Tool-use schema in audit generation (lex-brain) instead of freeform JSON parse | Bulgarian text broke naive JSON parsing; tool-use forces structure | ✓ Good (also added `json-repair` fallback) |
| In-memory rate limiter, not Vercel KV | Single-IP cost-control is sufficient; no distributed-attack defence yet | ⚠️ Revisit when traffic warrants |
| `AUDIT_VOTE_SALT` mandatory | Predictable hashes enable IP-stuffing of votes | ✓ Good |
| PR-only workflow on `main` | All edits via branch + CodeRabbit review + squash-merge | — Pending (rule is in user memory; tooling not enforced yet) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-04 after GSD initialization (auto mode, brownfield from session context)*
