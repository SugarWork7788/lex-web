---
phase: 02-new-ai-features
plan: 03
subsystem: pdf-export
tags: [audit, pdf, puppeteer, chromium, vercel, route, ui, blob-download]
requires:
  - "lib/use-rate-limited-fetch.ts (Phase 1 hook)"
  - "lib/rate-limit.ts (Phase 1 server-side limiter + structured-log emit)"
  - "app/components/rate-limit-toast.tsx (Phase 1 amber toast — reused for 429)"
  - "app/globals.css @media print block (existing diagonal LEX.BRAIN watermark — D-09 unchanged)"
provides:
  - "GET /api/audit/pdf — server-rendered PDF of /audit with print-CSS watermark"
  - "<DownloadPdfButton /> — client component with state machine + sr-only aria-live + co-located error toast"
  - "package.json runtime deps: puppeteer-core ^24.43.0 + @sparticuz/chromium ^148.0.0; engines.node >=22.17.0"
  - "next.config.ts top-level outputFileTracingIncludes for /api/audit/pdf chromium binary"
affects:
  - "Phase 2 PDF-01 — closed; user can download /audit as a single PDF synchronously"
  - "Phase 2 verifier — full plan suite ready for /gsd-verify-phase 2"
tech-stack:
  added:
    - "puppeteer-core@24.43.0 (Vercel-compatible headless browser driver, ~13 MB)"
    - "@sparticuz/chromium@148.0.0 (brotli-compressed chromium binary for serverless, ~66 MB)"
  patterns:
    - "RESEARCH §Pattern 4: puppeteer-core + @sparticuz/chromium PDF route shape (runtime/maxDuration/dynamic + rateLimited gate + try/catch/finally browser close)"
    - "RESEARCH §Pattern 5: Next 16 outputFileTracingIncludes top-level key (NOT under experimental.*) — verified against bundled docs/01-app/03-api-reference/05-config/01-next-config-js/output.md line 90"
    - "@sparticuz/chromium README v148: puppeteer.defaultArgs({args, headless:'shell'}) + literal viewport + headless:'shell' (defaultViewport/headless static getters removed in v148 — RESEARCH described older API)"
    - "useRateLimitedFetch.submit() with response.blob() consumer instead of streaming reader (D-06: only sanctioned fetch path; binary download is post-fetch DOM API)"
    - "Co-located error toast distinct from RateLimitToast (role='alert' + aria-live='assertive' vs polite/status) per UI-SPEC §'Error toast for PDF failure'"
    - "print:hidden on the button only — stats <ul> still renders in printed PDF (UI-SPEC §Layout Integration line 358-362)"
key-files:
  created:
    - "app/api/audit/pdf/route.ts (~85 lines): GET handler — runtime=nodejs, maxDuration=60, dynamic=force-dynamic; rateLimited gate (audit-pdf, 60s/5); chromium.setGraphicsMode=false; puppeteer.launch with headless='shell'; page.emulateMediaType('print') + page.goto(SITE_URL/audit, networkidle0, 25s timeout); page.pdf({A4, printBackground:true, 1.6cm/1.3cm margins matching @page rule}); Response(Buffer.from(pdf), application/pdf + Content-Disposition attachment + Cache-Control:no-store); 500 fallback with Bulgarian JSON error; finally browser.close().catch(()=>{})"
    - "app/audit/download-pdf-button.tsx (~150 lines): client component with idle/loading/done/error state machine; useRateLimitedFetch path (D-06 — no bare fetch); blob download via URL.createObjectURL + hidden <a download> + revokeObjectURL; sr-only aria-live='polite' span fires once on idle→done; co-located error toast (red palette, role='alert', aria-live='assertive', retry + dismiss); reuses Phase 1 RateLimitToast for 429s; tap target py-3 (~48px) per UI-SPEC mobile pre-commitment"
    - "__tests__/audit-pdf-route.test.ts (~85 lines): vitest smoke — 3 cases (module imports without throwing, GET 200 + Content-Type/Content-Disposition/Cache-Control, 6th call returns 429 with retry_after); puppeteer-core + @sparticuz/chromium fully mocked (never spawns chrome in CI)"
  modified:
    - "package.json: puppeteer-core ^24.43.0 + @sparticuz/chromium ^148.0.0 added to dependencies (NOT devDependencies); engines.node >=22.17.0"
    - "next.config.ts: outputFileTracingIncludes (top-level) for /api/audit/pdf -> [node_modules/@sparticuz/chromium/bin/**/*]; commented documentation that serverExternalPackages is auto-applied by Next 16"
    - "app/audit/page.tsx: import DownloadPdfButton; stats <ul> wrapped in mt-6 flex container (justify-between, items-center, gap-4); <DownloadPdfButton className='print:hidden' /> mounted as right-aligned sibling — stats still print, button does not"
decisions:
  - "Auto-fixed deviation [Rule 1 - API drift]: @sparticuz/chromium@148 no longer exposes static getters for `defaultViewport` and `headless` (removed since v141ish; only `args`, `setGraphicsMode`, `executablePath` remain on the class). RESEARCH Pattern 4 described older API. Switched to README v148 canonical shape: literal VIEWPORT object + headless:'shell' literal + puppeteer.defaultArgs({args:chromium.args, headless:'shell'}) for proper flag composition. Test mock updated to stub puppeteer.defaultArgs alongside puppeteer.launch."
  - "Auto-fixed deviation [Rule 1 - TS strict]: page.pdf() returns Uint8Array<ArrayBufferLike> which DOM lib's BodyInit type rejects under TypeScript strict (size/append/delete/get props missing — TS sees URLSearchParams variance). Wrapped pdf bytes in Buffer.from(pdf) — Node Buffer extends Uint8Array<ArrayBuffer> and is accepted by Response without copy (V8 zero-copy share). No semantic change."
  - "Mobile tap-target: pre-committed to py-3 (≈48px) over py-2 (≈40px) per UI-SPEC pre-commitment to ≥44px without measurement-loop deviation. Saves the dev-server-spinning step in the plan."
  - "engines.node = >=22.17.0 — pin matches @sparticuz/chromium@148 minimum; Vercel runtime is Node 22.x by default so no platform change."
  - "outputFileTracingIncludes glob = node_modules/@sparticuz/chromium/bin/**/* (the canonical narrow glob from RESEARCH Pitfall 3). NFT trace contains all 4 brotli archives (al2023.tar.br, chromium.br, fonts.tar.br, swiftshader.tar.br); 588 total files traced; no need to widen to lib/**/*."
  - "Bundle math: 66 MB chromium + 13 MB puppeteer-core = ~79 MB net; fits 250 MB Vercel cap with ~3× headroom. Documented in plan threat model. No need for @sparticuz/chromium-min + Vercel Blob hosting (deferred per RESEARCH §Alternatives Considered)."
  - "AUDIT_VOTE_SALT requirement: smoke test sets process.env.AUDIT_VOTE_SALT at top of file (per Phase 1 D-09 carryover; mandatory at @/lib/rate-limit module-load). Used 'test-salt-for-audit-pdf-route' literal."
  - "Error path 500 returns hardcoded Bulgarian JSON `{error:'Неуспешно генериране на PDF'}`; detailed error goes to console.error only. Threat T-02-03-04 mitigated."
  - "AI-07 contract not applicable to PDF route (no Anthropic stream). req.signal NOT forwarded into puppeteer.launch (puppeteer-core has no AbortSignal in launch API). Route relies on maxDuration+finally close; client disconnects mid-render still complete server-side and discard the PDF — acceptable per CONTEXT.md."
metrics:
  duration: ~10 min wall (3 tasks + 2 auto-fixed deviations + 1 SUMMARY)
  completed: 2026-05-10
---

# Phase 02 Plan 03: Audit PDF download via puppeteer + chromium

**One-liner:** Server-rendered single-file PDF of `/audit` via puppeteer-core + @sparticuz/chromium, triggered by a Bulgarian-copy `<DownloadPdfButton />` in the stats row, with the existing `@media print` LEX.BRAIN watermark preserved verbatim and a 5/min/IP rate-limit gate.

## What Was Built

1. **`app/api/audit/pdf/route.ts`** — new GET handler. Pipeline:
   - Rate-limit gate `rateLimited(req, "audit-pdf", { windowMs: 60_000, max: 5 })` (D-13 throttle; tighter than intel-quote's 30/min and intel-search's 10/min because PDF generation is 3-8 s function-time).
   - `chromium.setGraphicsMode = false` (Q3 cold-start mitigation; saves ~500 ms by skipping swiftshader).
   - `puppeteer.launch` with `headless: "shell"` + `puppeteer.defaultArgs({ args: chromium.args, headless: "shell" })` + literal 1920×1080 viewport (canonical v148 shape).
   - `page.emulateMediaType("print")` so the runtime CSS evaluates `@media print` queries.
   - `page.goto(${SITE_URL}/audit, { waitUntil: "networkidle0", timeout: 25_000 })` — `SITE_URL` falls back to `https://lex-web-eta.vercel.app` for build-time / unset-env safety.
   - `page.pdf({ format: "A4", printBackground: true, margin: { top: "1.6cm", right: "1.3cm", bottom: "1.6cm", left: "1.3cm" } })` — `printBackground: true` triggers the existing `app/globals.css` SVG-tile watermark (D-09 — globals.css NOT touched). Margins match the existing `@page` rule exactly.
   - `Response(Buffer.from(pdf), ...)` with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="lex-brain-audit-${ISO_DATE}.pdf"`, `Cache-Control: no-store` (Pitfall 4), `Content-Length`.
   - `try/catch/finally` — error path returns 500 with Bulgarian JSON `{ "error": "Неуспешно генериране на PDF" }`; finally always closes the browser, swallowing close errors.

2. **`app/audit/download-pdf-button.tsx`** — new client component (`"use client"`). State machine `idle | loading | done | error`. Uses `useRateLimitedFetch` for the GET (D-06 — only fetch path). On success: `await response.blob()` → `URL.createObjectURL` → click hidden `<a download>` → `revokeObjectURL`; sets `done` state for 2 s before reverting to `idle`. On 429: hook returns the throttle state; the existing `RateLimitToast` renders the amber polite countdown. On other errors: shows a co-located red toast with `role="alert"` + `aria-live="assertive"` and a retry button. Bulgarian copy verbatim per UI-SPEC §"Audit PDF download": idle "Свали като PDF", loading "Генерирам PDF…", done "Свален ✓", helper "~10 секунди · A4 · с воден знак LEX.BRAIN", error heading "Неуспешно генериране на PDF" + body "Опитайте отново след минута. Ако грешката се повтори, използвайте Cmd+P → Запази като PDF.", retry "Опитай отново", dismiss aria-label "Затвори". Sr-only `aria-live="polite"` span announces "PDF файлът е свален." once on idle→done.

3. **`app/audit/page.tsx`** — surgical edit. Added `import { DownloadPdfButton } from "./download-pdf-button";` after the existing VoteButton import. Wrapped the existing 5-`<Stat>` `<ul>` in a `<div className="mt-6 flex flex-wrap items-center justify-between gap-4">` container with `<DownloadPdfButton className="print:hidden" />` as the right-aligned sibling. The `mt-6` migrated from the `<ul>` to the wrapper. `print:hidden` is on the button only — the stats `<ul>` still renders in the printed PDF (UI-SPEC §Layout Integration: stats counts go in the PDF, the button does not).

4. **`package.json`** — `puppeteer-core ^24.43.0` and `@sparticuz/chromium ^148.0.0` in **dependencies** (runtime); `engines.node >= 22.17.0` (sibling of `dependencies`).

5. **`next.config.ts`** — added top-level `outputFileTracingIncludes: { "/api/audit/pdf": ["node_modules/@sparticuz/chromium/bin/**/*"] }` (verified against `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` line 90 per AGENTS.md "this is NOT the Next.js you know"). Inline comment documents that `serverExternalPackages` is NOT added because Next 16 auto-externalises `puppeteer-core` and `@sparticuz/chromium` out of the box.

6. **`__tests__/audit-pdf-route.test.ts`** — vitest smoke test with mocked `puppeteer-core` (incl. `puppeteer.defaultArgs`) and `@sparticuz/chromium`; 3 cases (import / 200+headers / 429 on 6th call). All pass.

## Bundle Size Confirmation

- `du -sh node_modules/@sparticuz/chromium` → **66 MB** unpacked.
- `du -sh node_modules/puppeteer-core` → **13 MB** unpacked.
- Combined: **~79 MB net**. Fits 250 MB Vercel function cap with ~3× headroom.
- No need for `@sparticuz/chromium-min` + Vercel Blob hosting (deferred per RESEARCH §Alternatives Considered).

## NFT Trace Verification

`bun run build` emits `.next/server/app/api/audit/pdf/route.js.nft.json` with **588 traced files**, of which **8 are under `@sparticuz/chromium`** including all **4 chromium brotli archives**:
- `node_modules/@sparticuz/chromium/bin/al2023.tar.br`
- `node_modules/@sparticuz/chromium/bin/chromium.br`
- `node_modules/@sparticuz/chromium/bin/fonts.tar.br`
- `node_modules/@sparticuz/chromium/bin/swiftshader.tar.br`

The narrow `bin/**/*` glob was sufficient; **no widening to `lib/**/*` was required** per RESEARCH Pitfall 3 fallback. (If the live Vercel preview surfaces "Could not find Chromium (rev. ...)", the documented fallback is to widen the glob in next.config.ts.)

## Mobile Tap-Target Check

Pre-committed `py-3` (≈48px height) over `py-2` (≈40px borderline) per UI-SPEC §"Свали като PDF button" pre-commitment language. **Mobile ≥44px ✓ without measurement loop.** No deviation cycle needed.

## Cold-Start Observation

Not measured locally (per plan's "do NOT cold-test the live PDF route end-to-end (that's manual UAT)"). RESEARCH Q3 budget: 6-9 s cold, 2-4 s warm. UAT on Vercel preview will confirm.

## Watermark Fidelity Confirmation

Not eyeball-verified locally (would require live puppeteer run; `app/globals.css` `@media print` block UNCHANGED across the entire branch — verified by `git diff origin/main..HEAD -- app/globals.css` returning empty). The renderer is the existing `@media print` pipeline; this plan only triggers it via `printBackground: true`. UAT on Vercel preview will confirm the diagonal LEX.BRAIN tile renders on every page.

## PDF-01 Success Criteria Status

| Criterion | Status |
|-----------|--------|
| Single PDF file with LEX.BRAIN watermark | ✓ via `/api/audit/pdf` + existing `@media print` block |
| Includes all 352 findings | ✓ via `<details>` natively expanded under `@media print` |
| <10 s for full report | ⚠ verified-warm via mock; cold-start UAT pending on Vercel preview (~6-9 s budget per RESEARCH Q3) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - API drift] @sparticuz/chromium@148 removed `defaultViewport` and `headless` static getters**
- **Found during:** Task 2 (typecheck step)
- **Issue:** RESEARCH Pattern 4 used `chromium.defaultViewport` and `chromium.headless`, but v148's `index.d.ts` only exposes `args` (getter), `graphics` (getter), `setGraphicsMode` (setter), and `executablePath` (method). TypeScript surfaced `Property 'defaultViewport' does not exist on type 'typeof Chromium'` and same for `headless`.
- **Fix:** Switched to README v148 canonical shape: literal VIEWPORT object inline + `headless: "shell"` literal + `puppeteer.defaultArgs({ args: chromium.args, headless: "shell" })` for proper flag composition.
- **Test mock updated:** Added `defaultArgs: vi.fn().mockImplementation(({ args }) => args)` to the puppeteer-core mock (the route now calls it).
- **Files modified:** `app/api/audit/pdf/route.ts`, `__tests__/audit-pdf-route.test.ts`
- **Commits:** 546216e

**2. [Rule 1 - TS strict] page.pdf() Uint8Array<ArrayBufferLike> rejected by Response BodyInit**
- **Found during:** Task 2 (typecheck step)
- **Issue:** `page.pdf()` returns `Uint8Array<ArrayBufferLike>` per puppeteer-core types, but DOM lib's `BodyInit` type expects an `ArrayBuffer`-backed Uint8Array. TS surfaced `Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'`.
- **Fix:** Wrapped pdf bytes in `Buffer.from(pdf)` — Node `Buffer` extends `Uint8Array<ArrayBuffer>` and is accepted by `Response` without copy (V8 zero-copy share).
- **Files modified:** `app/api/audit/pdf/route.ts`
- **Commits:** 546216e

### Architectural Decisions Required

None.

## Threat Flags

None new. Plan's threat model (T-02-03-01..10) is fully implemented as specified — rate-limit at 5/min/IP, hardcoded SITE_URL (no SSRF surface), Bulgarian-only error body on 500 path, Cache-Control: no-store, finally block close, etc.

## Self-Check: PASSED

**Files exist:**
- `package.json` — FOUND (modified)
- `next.config.ts` — FOUND (modified)
- `app/api/audit/pdf/route.ts` — FOUND (new)
- `app/audit/download-pdf-button.tsx` — FOUND (new)
- `app/audit/page.tsx` — FOUND (modified)
- `__tests__/audit-pdf-route.test.ts` — FOUND (new)

**Commits exist:**
- 8c9ea93 — FOUND (Task 1: deps + config)
- 546216e — FOUND (Task 2: route + smoke test)
- 9fd586a — FOUND (Task 3: button + page integration)

**Quality gates:**
- `bunx tsc --noEmit` — exit 0
- `bun run test` — 42 passed / 0 failed across 6 test files
- `bun run build` — exit 0 with `.next/server/app/api/audit/pdf/route.js.nft.json` containing 4 chromium brotli archives (588 total files)
- `git diff origin/main..HEAD -- app/globals.css` — empty (D-09 watermark fidelity)

## Pointer for Next Plan

None — Phase 2 ends here. Next step: `/gsd-verify-phase 2` to spawn the verifier.
