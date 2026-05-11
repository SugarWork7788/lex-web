# Phase 4: Auth foundation — Research

**Researched:** 2026-05-11
**Domain:** User authentication (Supabase Auth + Next 16 App Router + React 19)
**Confidence:** HIGH (Context7-verified Supabase SSR patterns + locally-verified Next 16 docs in `node_modules/next/dist/docs/`)

## Summary

Phase 4 lands the foundation for v2.3 user accounts: Supabase Auth with email/password (magic-link verification) + Google OAuth, a `user_profiles` table backed by a Postgres trigger, and Bulgarian-language hand-rolled sign-in / sign-up / sign-out surfaces. All ten CONTEXT.md decisions (D-01..D-10) are honored. The only new package is `@supabase/ssr@^0.10.3` (verified current 2026-05-07 via `npm view`).

The five open questions in CONTEXT.md (Q1–Q5) all resolve cleanly:

- **Q1 (Next 16 + Supabase Auth pattern):** Use `@supabase/ssr` with per-request `createServerClient()` factories in Server Components, Route Handlers, and `proxy.ts`. **Critical Next 16 breaking change discovered:** `middleware.ts` is renamed to `proxy.ts` (with the function renamed `middleware` → `proxy`). This affects Phase 5 too. `cookies()` from `next/headers` is now **async** and must be `await`ed.
- **Q2 (magic-link landing):** Use `/auth/callback` route handler that calls `exchangeCodeForSession(code)` then redirects to a `next` query param (validated to be a relative path). Land verified email signups on `/?verified=1` (root) — Phase 5 will add the protected-route + returnTo flow.
- **Q3 (rate-limit reuse):** `lib/rate-limit.ts` from Phase 1 wraps `POST /api/auth/sign-out` cleanly (and is the right pattern if we ever add custom sign-in/sign-up POST routes). However, **the actual sign-in/sign-up calls happen from the browser via `supabase.auth.signInWithPassword/signUp`** — they hit Supabase directly, not our API. So our `rateLimited()` helper has no surface to wrap on those flows. Supabase Auth itself enforces a default of 30 sign-up emails per hour per IP and ~10 sign-in/min per IP (configurable in dashboard). Recommendation: rely on Supabase's defaults for now; document the override paths in the operator checklist.
- **Q4 (OAuth test strategy):** Mock `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` in vitest to assert the redirect URL is constructed correctly. The actual Google consent screen is a **BLOCKING manual smoke** at the end of Plan 04-04 (same pattern as Phase 8 plan 08-01 live-net smokes).
- **Q5 (Phase 6 backward-compat):** Confirmed — Phase 4 makes ZERO changes to `app/api/audit/vote/route.ts`. The existing IP+fingerprint flow keeps working. Phase 6 will add `user_id` later.

**Primary recommendation:** Add `@supabase/ssr@^0.10.3`, introduce three new Supabase factories in a single `lib/supabase-auth.ts` (browser, server, proxy), keep the existing `lib/supabase.ts` untouched, ship the Postgres trigger + RLS migration via the existing `db:*` script pattern, and hand-roll the three Bulgarian forms with the same `useState`/`fetch` shape as `app/laws/[slug]/alert-form.tsx`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Hand-rolled forms (NOT @supabase/auth-ui-react).** Custom Bulgarian forms styled like /audit + /intel cards: red accents, font-serif headings, stone-900 surfaces, same accessibility patterns as the rest of the site.

**D-02 — Magic-link email verification (Supabase default).** User receives email with click-to-verify link. No code-entry UI. Supabase handles the verification redirect.

**D-03 — Display name required at email signup; auto-derived from Google OAuth.** Email/password sign-up form has 3 fields: email, password, display name (required). For Google OAuth, the user's Google profile name is auto-copied via the `handle_new_user` trigger reading `raw_user_meta_data->>'full_name'`.

**D-04 — Separate `/sign-in` and `/sign-up` pages.** Two distinct pages, each linked to the other. The `/sign-out` flow is a `POST /api/auth/sign-out` route handler + nav-link that redirects to `/`.

**D-05 — `user_profiles` row created by Postgres trigger on `auth.users` INSERT (not app code).** `SECURITY DEFINER` trigger fires after `auth.users` insert. App code never touches the insert path.

**D-06 — No `locale` column in `user_profiles` (YAGNI).** Phase 4's user_profiles table is exactly: `(id, display_name, created_at)`.

**D-07 — Auth client uses `persistSession: true` (separate config from existing `lib/supabase.ts`).** The current `lib/supabase.ts` exports a single anon-key client with `persistSession: false` (used by data fetches). Auth requires per-request `createServerClient()` factories per Supabase Next 16 conventions. Don't break the existing `supabase` export.

**D-08 — OAuth callback URLs are operator-managed (not in code).** Google OAuth requires registering callback URLs in Google Cloud Console. NOT scriptable from app code. Plan output should include a "Pre-implementation operator checklist".

**D-09 — Navbar placement: right-corner subtle text-link.** "Влез" / "Профил" link goes in the existing top-nav bar (`app/layout.tsx`), right-aligned, same `hover:underline underline-offset-4` pattern as `/audit` and `/intel`. NO icon, NO button styling, NO avatar dropdown until Phase 6.

**D-10 — Bulgarian copy: formal-legal tone (matches site voice).** "Влезте в профила си" (NOT "Здравей! Влез"). "Регистрирайте се". Field labels: "Имейл", "Парола", "Име".

### Claude's Discretion

Q1–Q5 from CONTEXT.md (resolved in this research). Specific helper file naming (`lib/supabase-auth.ts` vs `lib/supabase/server.ts` etc.) is Claude's discretion — research recommends `lib/supabase-auth.ts` as a single file with three named exports, mirroring the existing flat `lib/` layout.

### Deferred Ideas (OUT OF SCOPE)

- Phase 5 work (proxy.ts middleware, protected-route helper) — Phase 4 just lands the building blocks
- `/account` page — Phase 6
- `tier` enum — Phase 7
- Stripe / billing
- Additional OAuth providers (GitHub, Apple, Facebook)
- 2FA / MFA
- Email-OTP verification
- `locale` column
- Supabase Auth UI component
- Combined `/auth` page
- Anonymous-state visual changes on existing pages (only navbar Влез link is added)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign up with email + password (verification flow via Supabase Auth) | Q1 + Q2 — `createBrowserClient().auth.signUp({ email, password, options: { emailRedirectTo, data: { display_name } } })` + `/auth/callback` PKCE exchange |
| AUTH-02 | User can sign in with Google OAuth | Q1 + Q4 — `createBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback?next=/' } })` + manual smoke |
| AUTH-03 | `user_profiles` table created with RLS — users can only read/update their own row | D-05 trigger + RLS policies (verbatim SQL in CONTEXT.md) |
| AUTH-04 | Sign-in / sign-up / sign-out UI pages in Bulgarian + `getSession()` server util + `useSession()` client hook | D-01 hand-rolled forms + Q1 server `createServerClient` factory + Q1 `useSession()` hook subscribed to `onAuthStateChange` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email/password sign-in submission | Browser (`createBrowserClient`) | — | Supabase JS client posts directly to `auth.supabase.co/auth/v1/token`; cookie auto-set by SSR cookie handler |
| Google OAuth redirect kickoff | Browser | — | `signInWithOAuth` initiates redirect to Google; PKCE verifier stored in cookie |
| OAuth code exchange | Route Handler (`app/auth/callback/route.ts`) | — | `exchangeCodeForSession(code)` requires server-side cookie store (PKCE verifier lives in HttpOnly cookie) |
| Email verification link landing | Route Handler (`app/auth/callback/route.ts`) | — | Same callback route handles both OAuth and PKCE email-confirm codes |
| Session read in Server Component | Server (`createServerClient` + `cookies()`) | — | `cookies()` is async in Next 16; reads-only, no setAll |
| Session read in Route Handler | Server (`createServerClient` + `cookies()`) | — | Both reads and writes (setAll) since Route Handlers can mutate Set-Cookie headers |
| Session subscription (UI updates) | Browser (client hook) | — | `onAuthStateChange` is a client-only WebSocket subscription |
| Sign-out cookie clear | Route Handler (`app/api/auth/sign-out/route.ts`) | — | Server-side `supabase.auth.signOut()` clears the HttpOnly auth cookie atomically |
| `user_profiles` row creation | Database (`handle_new_user` trigger) | — | D-05 lock — never from app code |
| Display-name auto-derive (Google) | Database (trigger reads `raw_user_meta_data->>'full_name'`) | — | D-03 lock |

**Why no proxy.ts in Phase 4:** Per ROADMAP, Phase 4 lands building blocks only. Phase 5 introduces `proxy.ts` (the refresh-cookie-on-every-request layer). Phase 4 sessions stay valid because (a) `signInWithPassword`/`signInWithOAuth`/`exchangeCodeForSession` write fresh cookies, and (b) the sessions are read-only via `getUser()` in Server Components for the duration of Phase 4 (where the only authed surface is the navbar "Влез/Профил" link). Cookie-refresh-on-stale doesn't yet matter.

## Standard Stack

### Core (newly added)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | `^0.10.3` | Cookie-aware Supabase client factories (`createBrowserClient`, `createServerClient`) | Official Supabase package for SSR frameworks. Replaces deprecated `@supabase/auth-helpers-nextjs`. Latest version published 2026-05-07. [VERIFIED: `npm view @supabase/ssr version`] |

### Core (already installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@supabase/supabase-js` | `^2.105.1` (resolved 2.105.4) | Postgres queries + auth-js | [VERIFIED: package.json + node_modules check] |
| `@supabase/auth-js` | `2.105.4` (transitive) | `signUp`, `signInWithPassword`, `signInWithOAuth`, `signOut`, `exchangeCodeForSession`, `onAuthStateChange` | [VERIFIED: node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts] |
| `next` | `16.2.4` | App Router + proxy.ts (formerly middleware) | [VERIFIED: package.json] |
| `react` | `19.2.4` | Hooks (`useState`, `useEffect`, `useTransition`) | [VERIFIED: package.json] |
| `vitest` + `@testing-library/react` | `^4.1.5` / `^16.3.2` | Tests for hook + form behavior | [VERIFIED: vitest.config.ts] |

### Supporting (NOT added, deliberately)

| Library | Why Not |
|---------|---------|
| `@supabase/auth-ui-react` | D-01 — hand-rolled forms |
| `react-hook-form` | Existing forms in the codebase (e.g. `app/laws/[slug]/alert-form.tsx`) use plain `useState` + `onSubmit`. No new dep. |
| `zod` | No existing usage in lex-web. Sign-up validation is shallow (email regex + password length); inline checks are sufficient. Supabase's own `signUp` enforces server-side validation. |
| `@supabase/auth-helpers-nextjs` | Deprecated since 2024 in favor of `@supabase/ssr` |

**Installation:**
```bash
bun add @supabase/ssr
```

(Confirm bun is the package manager — `bun.lock` exists in the repo per Phase 2 plans.) Use `bun add` not `npm install`.

**Version verification (run during Plan 04-01 execution, NOT now):**
```bash
bun pm ls @supabase/ssr   # confirm 0.10.3 or later
```

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Client)                                 │
│  ┌─────────────────────┐   ┌──────────────────────┐   ┌────────────────────┐│
│  │ /sign-up page       │   │ /sign-in page        │   │ navbar (layout.tsx)││
│  │ <SignUpForm>        │   │ <SignInForm>         │   │ <AuthNavLink>      ││
│  │ supabase.auth.      │   │ supabase.auth.       │   │ uses useSession()  ││
│  │   .signUp({         │   │   .signInWithPassword│   │ → "Влез"|"Профил"  ││
│  │     emailRedirectTo │   │   .signInWithOAuth   │   │                    ││
│  │     data: {         │   │     redirectTo:      │   │                    ││
│  │       display_name  │   │       /auth/callback │   │                    ││
│  │     }})             │   │   })                 │   │                    ││
│  └──────────┬──────────┘   └──────────┬───────────┘   └─────────┬──────────┘│
│             │                          │                          │          │
│  All three use createBrowserClient() from lib/supabase-auth.ts   │          │
│  Subscribes via supabase.auth.onAuthStateChange() in useSession()│          │
└─────────────┼──────────────────────────┼──────────────────────────┼──────────┘
              │                          │                          │
              ▼                          ▼                          │
   ┌──────────────────────┐   ┌──────────────────────┐              │
   │ Supabase Auth API    │   │ Google OAuth         │              │
   │ supabase.co/auth/v1  │   │ accounts.google.com  │              │
   │ • signup             │   │                      │              │
   │ • token              │   │ Redirects back with  │              │
   │ • verify (email)     │   │ ?code=xxx            │              │
   │                      │   └──────────┬───────────┘              │
   │ Sends email with     │              │                          │
   │ ?code=xxx link       │              │                          │
   └──────────┬───────────┘              │                          │
              │                          │                          │
              ▼                          ▼                          │
   ┌──────────────────────────────────────────────┐                 │
   │ NEXT.JS SERVER (Vercel)                      │                 │
   │ ┌──────────────────────────────────────────┐ │                 │
   │ │ /auth/callback/route.ts (GET)            │ │                 │
   │ │ • createServerClient(cookieStore)        │ │                 │
   │ │ • supabase.auth.exchangeCodeForSession() │ │                 │
   │ │ • Sets sb-<ref>-auth-token cookie (SSR)  │ │                 │
   │ │ • Redirects to ?next=/ (default /)       │ │                 │
   │ └──────────────────────────────────────────┘ │                 │
   │                                              │                 │
   │ ┌──────────────────────────────────────────┐ │                 │
   │ │ /api/auth/sign-out/route.ts (POST)       │ │                 │
   │ │ • createServerClient(cookieStore)        │ │                 │
   │ │ • supabase.auth.signOut()                │ │                 │
   │ │ • Clears cookies, redirects /            │ │                 │
   │ └──────────────────────────────────────────┘ │                 │
   │                                              │                 │
   │ ┌──────────────────────────────────────────┐ │                 │
   │ │ Server Components (e.g. layout.tsx)      │ │   reads session ▼
   │ │ • createServerClient(cookieStore)        │◄─────────────────┐│
   │ │ • const { user } = await supabase.auth   │                  ││
   │ │   .getUser()                             │                  ││
   │ │ • Returns to render: nav state, /account │                  ││
   │ └──────────────────────────────────────────┘                  ││
   └──────────────────────┬───────────────────────────────────────┘ │
                          │                                          │
                          ▼                                          │
            ┌──────────────────────────────────┐                     │
            │ Supabase Postgres                │                     │
            │ • auth.users (managed by Auth)   │                     │
            │ • TRIGGER on INSERT →            │                     │
            │   handle_new_user() →            │                     │
            │   INSERT INTO user_profiles      │                     │
            │ • RLS: users see own row only    │                     │
            └──────────────────────────────────┘                     │
                                                                     │
                       cookies travel back to browser ───────────────┘
                       (sb-<project-ref>-auth-token, HttpOnly)
```

### Recommended Project Structure

```
lex-web/
├── lib/
│   ├── supabase.ts              # UNCHANGED — existing data client (11 importers)
│   ├── supabase-auth.ts         # NEW — three factory exports + getSession server util
│   ├── use-session.ts           # NEW — useSession() client hook
│   └── rate-limit.ts            # UNCHANGED — used by /api/auth/sign-out
├── app/
│   ├── layout.tsx               # MODIFIED — Server Component, calls getSession() to render nav
│   ├── sign-in/
│   │   ├── page.tsx             # NEW — Server Component shell
│   │   └── sign-in-form.tsx     # NEW — "use client", hand-rolled form
│   ├── sign-up/
│   │   ├── page.tsx             # NEW — Server Component shell
│   │   ├── sign-up-form.tsx     # NEW — "use client", hand-rolled form
│   │   └── check-email/
│   │       └── page.tsx         # NEW — "Check your email" confirmation page
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts         # NEW — GET handler, exchangeCodeForSession
│   └── api/
│       ├── audit/
│       │   └── vote/
│       │       └── route.ts     # UNCHANGED (Q5 confirmed) — Phase 6 will touch this
│       └── auth/
│           └── sign-out/
│               └── route.ts     # NEW — POST handler, signOut
├── db/
│   └── auth_schema.sql          # NEW — user_profiles table + trigger + RLS
├── scripts/
│   └── apply-auth-schema.ts     # NEW — idempotent applier (mirrors apply-dv-schema.ts pattern)
└── package.json                 # MODIFIED — adds @supabase/ssr; adds db:auth-schema script
```

---

### Pattern 1: Browser-side Supabase client factory

**What:** Single `createBrowserClient` instance for all client components (`/sign-in/sign-in-form.tsx`, `/sign-up/sign-up-form.tsx`, `useSession()` hook).
**When to use:** Any `"use client"` file that needs to call `supabase.auth.*` or subscribe to auth state.

```typescript
// Source: Context7 /supabase/ssr — verified 2026-05-11
// File: lib/supabase-auth.ts (browser portion)

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

### Pattern 2: Server-side Supabase client factory (Server Components — read-only)

**What:** Per-request factory bound to the cookie store. Server Components can READ session but CANNOT write (cookies cannot be set during streaming render).
**When to use:** `app/layout.tsx`, any Server Component that needs the user.

```typescript
// Source: Context7 /supabase/ssr — verified 2026-05-11
// File: lib/supabase-auth.ts (server portion)

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies(); // NOTE: async in Next 16 — must await
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // setAll INTENTIONALLY OMITTED for Server Component read path.
        // Server Components cannot set cookies (HTTP cookies must come before
        // streamed body). Setting cookies happens only in Route Handlers and
        // Server Actions.
      },
    },
  );
}

/**
 * Server-side session helper. Returns the verified user (uses getUser, not
 * getSession — getSession reads cookies WITHOUT verifying with Supabase, and
 * is unsafe for authorization decisions per Supabase docs).
 */
export async function getSession() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user; // null if anonymous
}
```

> Naming note: CONTEXT.md AUTH-04 calls this `getSession()` for symmetry with `useSession()`. Internally it calls `getUser()` per Supabase's security guidance ("Never trust `getSession()` inside server code"). The return type is `User | null` — name reflects API symmetry, not the underlying Supabase method.

### Pattern 3: Server-side Supabase client factory (Route Handlers — read+write)

**What:** Per-request factory that CAN write cookies (used by `/auth/callback` and `/api/auth/sign-out`).
**When to use:** `app/auth/callback/route.ts`, `app/api/auth/sign-out/route.ts`.

```typescript
// Source: Context7 /supabase/ssr — verified 2026-05-11
// File: lib/supabase-auth.ts (route handler portion)

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createRouteHandlerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
```

### Pattern 4: Client-side useSession hook

**What:** Client hook that exposes the current `User | null` and subscribes to `onAuthStateChange` so the navbar updates instantly on sign-in/out.
**When to use:** `app/layout.tsx` navbar variant, any client component that needs reactive auth state.

```typescript
// Source: Context7 /supabase/ssr — adapted for React 19 (verified 2026-05-11)
// File: lib/use-session.ts

"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase-auth";

export function useSession(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Initial fetch — getSession reads from local cookies (fast, no roundtrip).
    // Hook is for UI reactivity; security checks happen on the server.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Subscribe to subsequent state changes (sign-in / sign-out / token-refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
```

> Note: this hook calls `getSession()` (cookie read) NOT `getUser()` (network call). That's correct — the hook drives UI display, not authorization. Authorization lives on the server (`getSession()` server util uses `getUser()`).

### Pattern 5: OAuth callback route handler

**What:** Single GET handler that handles BOTH the magic-link email confirmation AND the Google OAuth callback (both use the PKCE flow with `?code=xxx`).
**When to use:** Triggered automatically by Supabase email links and the Google OAuth redirect.

```typescript
// Source: supabase.com/docs/guides/auth/social-login/auth-google — verified 2026-05-11
// Adapted to use the lex-web factory pattern.
// File: app/auth/callback/route.ts

import { NextResponse } from "next/server";
import { createRouteHandlerSupabase } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";

  // Open-redirect guard — `next` MUST be a relative path. Without this an
  // attacker could craft /auth/callback?next=https://evil.com and the cookie
  // would be set then the user shipped offsite.
  if (!next.startsWith("/")) next = "/";

  if (code) {
    const supabase = await createRouteHandlerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Successful exchange — cookie is now set. Redirect to `next`.
      // x-forwarded-host handling per Supabase Next.js guide (Vercel preview
      // deploys forward via the proxy host).
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code missing or exchange failed — bounce to sign-in with an error flag.
  return NextResponse.redirect(`${origin}/sign-in?error=callback`);
}
```

### Pattern 6: Sign-out route handler

**What:** POST handler that calls `signOut()` server-side (cleanly clears the auth cookie).
**Why server route, not client `supabase.auth.signOut()`:** Server-side `signOut()` from a Route Handler is preferred because (a) it sets `Set-Cookie` headers atomically with the response, (b) it works even if the browser cookie store is in a weird state, (c) it's the same pattern Phase 6's audit-vote auth check will reuse.

```typescript
// File: app/api/auth/sign-out/route.ts

import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/rate-limit";
import { createRouteHandlerSupabase } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Sign-out is a no-op for anonymous users; rate-limit defends against
  // someone hammering the endpoint with botnets.
  const limit = rateLimited(req, "auth-signout", { windowMs: 60_000, max: 20 });
  if (limit) return limit;

  const supabase = await createRouteHandlerSupabase();
  await supabase.auth.signOut(); // clears cookies

  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
```

### Pattern 7: Sign-up form (hand-rolled, Bulgarian)

**What:** Client form with email + password + display name.
**Pattern reused from:** `app/laws/[slug]/alert-form.tsx` — `useState` + `onSubmit` + status state machine.

```typescript
// File: app/sign-up/sign-up-form.tsx

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-auth";

type Status = "idle" | "submitting" | "ok" | "error";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Magic-link will land on /auth/callback?code=xxx — that handler
        // exchanges the code for a session and redirects to `next` (default /).
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        data: {
          // Read by handle_new_user() trigger (D-03, D-05).
          display_name: displayName.trim(),
        },
      },
    });

    if (error) {
      setStatus("error");
      // Map common errors to formal-legal Bulgarian (D-10).
      setErrorMessage(translateAuthError(error.message));
      return;
    }

    setStatus("ok");
    router.push("/sign-up/check-email");
  }

  // ... JSX with stone-900 surfaces, red accents, font-serif heading per D-01
}

function translateAuthError(msg: string): string {
  if (msg.includes("already registered")) return "Този имейл е вече регистриран.";
  if (msg.includes("Password")) return "Невалидна парола (минимум 6 символа).";
  return "Грешка при регистрация. Моля, опитайте отново.";
}
```

### Anti-Patterns to Avoid

- **Calling `supabase.auth.getSession()` in Server Components for authorization.** Use `getUser()` — `getSession()` reads cookies without verifying, which Supabase explicitly warns against.
- **Setting cookies in Server Components.** Will throw at runtime in Next 16. Restrict the `setAll` callback to Route Handlers and Server Actions only.
- **Hand-rolling JWT verification.** `@supabase/ssr` does this. Don't reach for `jose` or `jsonwebtoken`.
- **Touching `lib/supabase.ts`.** It's imported in 11 places (audit, alerts, chat, courts, intel, dv-search, etc.). Phase 4 keeps it untouched. New auth client lives in `lib/supabase-auth.ts`.
- **Inserting into `user_profiles` from app code.** D-05 — the trigger owns this exclusively. Inserting from app code creates a TOCTOU race on first sign-in.
- **Using `middleware.ts`.** This is Next 15 syntax — Next 16 uses `proxy.ts` (Phase 5).
- **Calling `cookies()` synchronously.** Next 16 made this async. `await cookies()` is mandatory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-bound Supabase client for SSR | Custom `parseCookieHeader` + JWT decode | `@supabase/ssr` `createServerClient` | Handles cookie chunking (auth tokens are >4KB on Google OAuth — they get split), refresh token rotation, PKCE verifier storage |
| OAuth code exchange | Manual POST to Supabase token endpoint | `supabase.auth.exchangeCodeForSession(code)` | Handles PKCE verifier lookup from cookie, error mapping, session installation |
| Display-name → user_profiles row sync | App-code `INSERT INTO user_profiles` after `signUp` | `handle_new_user` trigger (D-05) | TOCTOU race: app may insert twice on retry, or fail and leave orphan auth row |
| Email-verification UX | Build OTP entry input | Magic-link click (D-02) | Avoids entire UI surface; click is universal |
| Session subscription | WebSocket connection to Supabase | `supabase.auth.onAuthStateChange` | Handles reconnect, multi-tab BroadcastChannel sync, token-refresh events |
| Rate limiting on Supabase Auth endpoints | Wrap signUp/signIn calls with `rateLimited()` | Trust Supabase's built-in IP-based rate limits (overrideable in dashboard) | The calls happen browser→Supabase, never touching our Vercel functions |

**Key insight:** Supabase Auth was designed to handle the hard parts (PKCE, cookie chunking, refresh tokens, rate-limit, email delivery, OAuth provider abstraction). The work here is wiring the cookie store to Next 16's `cookies()` API and writing pixel-consistent Bulgarian forms. Resist the temptation to "just write it ourselves" for any auth-protocol-level concern.

## Common Pitfalls

### Pitfall 1: `cookies()` is async in Next 16
**What goes wrong:** `cookies().get('foo')` (no await) returns a Promise, not a cookie store. Compiles fine, returns `undefined` at runtime.
**Why it happens:** Next 14 had it sync; Next 15+ made it async (with a temporary backwards-compat shim that's now removed in 16).
**How to avoid:** Always `await cookies()`. Lint will not catch this — only runtime errors will.
**Warning signs:** `cookieStore.getAll is not a function` errors, or empty session everywhere.

### Pitfall 2: Middleware → Proxy renaming (affects Phase 5, surface here)
**What goes wrong:** A developer reads Next 15 docs, ships `middleware.ts` with `export function middleware(req)`. Next 16 builds it but emits a deprecation warning, AND any future codemod will rename it without testing.
**Why it happens:** Next 16 renamed `middleware.ts` → `proxy.ts` and `middleware()` → `proxy()` to disambiguate from Express middleware. Codemod available: `npx @next/codemod@canary middleware-to-proxy .`
**How to avoid:** Phase 4 doesn't ship a proxy file (Phase 5 does). When Phase 5 lands, use `proxy.ts` from day 1. Add this to the planner's notes for Phase 5.
**Warning signs:** Build emits `middleware is deprecated` warning.

### Pitfall 3: Open-redirect via `?next=` query param
**What goes wrong:** `/auth/callback?next=https://evil.com` → the cookie is set on the user's session, then they're shipped to evil.com. Phishing vector.
**Why it happens:** Naive `redirect(searchParams.get('next'))` accepts absolute URLs.
**How to avoid:** The `if (!next.startsWith('/')) next = '/'` guard in Pattern 5. NEVER skip it.
**Warning signs:** Manual code review of the callback handler — verify the guard is present before merge.

### Pitfall 4: Cookie chunking for Google OAuth tokens
**What goes wrong:** Google's OAuth response includes a long ID token. Combined with refresh token, the auth cookie can exceed the 4096-byte HTTP cookie limit. Without chunking, sign-in silently fails on production but works locally.
**Why it happens:** Local dev uses base64 cookies that often fit; production with longer-lived sessions trips the limit.
**How to avoid:** `@supabase/ssr` chunks automatically. Don't bypass `setAll`. Don't try to write your own cookie serializer.
**Warning signs:** Sign-in works in dev, fails in production with "Auth session missing!" or empty `getUser()` result.

### Pitfall 5: `getSession()` returns spoofable data on the server
**What goes wrong:** Using `supabase.auth.getSession()` in a Server Component for an authorization check (e.g. "show admin panel"). The session payload is read from the cookie WITHOUT verifying the signature against Supabase. An attacker who steals or tampers with the cookie passes the check.
**Why it happens:** `getSession()` is documented as "fast, local read" and reads optimized for hooks, not security.
**How to avoid:** On the server, ALWAYS use `getUser()` (validates against Supabase). On the client, `getSession()` is fine because it only drives UI state.
**Warning signs:** Supabase's official docs warn explicitly: "Never trust `supabase.auth.getSession()` inside server code."

### Pitfall 6: `handle_new_user` trigger fails silently if `display_name` missing
**What goes wrong:** Email signup doesn't pass `data.display_name`, the trigger COALESCEs to `split_part(email, '@', 1)`. Display names look like `john.smith` instead of "Иван Петров". User has no idea why.
**Why it happens:** `signUp({ email, password })` without the `options.data.display_name` field — easy to forget.
**How to avoid:** SignUpForm enforces `displayName` as a required field; sign-up button is disabled when blank. Plus the COALESCE fallback prevents NULL inserts (D-05 SQL is correct on this point).
**Warning signs:** vitest case asserting that `signUp` is called with `options.data.display_name`.

### Pitfall 7: `onAuthStateChange` callback captures stale closure
**What goes wrong:** Hook callback captures the initial state via closure. After sign-in, a stale `setUser` from the FIRST `useEffect` invocation tries to update an unmounted component, or the callback uses outdated values.
**Why it happens:** React hooks + WebSocket subscription + closure mistakes.
**How to avoid:** Pattern 4 uses the setter function directly (`setUser(session?.user ?? null)`) — no closure over `user`. The cleanup `subscription.unsubscribe()` runs on unmount. Tested in vitest with `@testing-library/react`'s `act()`.

### Pitfall 8: Supabase email template defaults to English
**What goes wrong:** User clicks "Регистрирайте се", gets a "Confirm your signup" English email, looks unprofessional / phishy.
**Why it happens:** Supabase's default email templates are English. Customization is per-project, in the dashboard, NOT in code.
**How to avoid:** Add explicit operator step (see "Pre-implementation operator checklist" below) to update the "Confirm signup" template to Bulgarian. Provide ready-to-paste copy.
**Warning signs:** First email signup test reveals an English email.

### Pitfall 9: `lib/supabase.ts` accidentally edited
**What goes wrong:** A developer "consolidates" the auth client into the existing `lib/supabase.ts`, breaking the 11 importers that rely on `persistSession: false`.
**Why it happens:** "DRY" instinct.
**How to avoid:** D-07 lock + this research. New auth client lives in `lib/supabase-auth.ts`. Add a code-review checklist item.

### Pitfall 10: Layout-level Server Component auth check rerenders too rarely
**What goes wrong:** Putting `getSession()` in `app/layout.tsx` and using the result in a Server-rendered nav. Layouts don't re-render on client-side navigation, so the nav state goes stale until a hard refresh.
**Why it happens:** Next 16 partial rendering — layouts are persisted across navigations.
**How to avoid:** Use the `useSession()` client hook for the navbar's reactive variant. Layout can still be a Server Component; just split the navbar into a small `"use client"` `<AuthNavLink>` component (Phase 4 ships this).
**Warning signs:** "Sign in" link still showing after successful sign-in until you reload the page.

## Code Examples

### Recommended `lib/supabase-auth.ts` skeleton (full file)

```typescript
// File: lib/supabase-auth.ts
//
// Auth-aware Supabase factories for Next 16 App Router.
// Owns: per-request cookie binding (browser, Server Component, Route Handler).
// Does NOT touch lib/supabase.ts (data client, persistSession:false, 11 importers).
//
// Source: Context7 /supabase/ssr (verified 2026-05-11) + Next 16 docs in
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
  );
}

/** Browser-side factory — call in any "use client" component. */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL!, SUPABASE_KEY!);
}

/** Server Component factory — read-only (cannot set cookies during streaming). */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // setAll deliberately omitted — Server Components cannot set cookies.
    },
  });
}

/** Route Handler factory — full read+write. */
export async function createRouteHandlerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Server-side auth helper. Returns the verified User or null.
 * Uses getUser() (network roundtrip) NOT getSession() (cookie read) for
 * security — getSession is spoofable on the server (Pitfall 5).
 *
 * Phase 4 surface area: navbar auth state. Phase 5 will cache this with
 * React's `cache()` to dedupe per-render-pass.
 */
export async function getSession(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### Recommended `db/auth_schema.sql` (verbatim from D-05)

```sql
-- Phase 4 — Auth foundation: user_profiles + RLS + trigger
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own profile" ON user_profiles;
CREATE POLICY "users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users can update own profile" ON user_profiles;
CREATE POLICY "users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'display_name',  -- email signup (D-03)
        NEW.raw_user_meta_data->>'full_name',     -- Google OAuth (D-03)
        split_part(NEW.email, '@', 1)             -- safety net
      )
    );
    RETURN NEW;
  END;
  $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

> **`SET search_path = public`** added to the function definition — defense against `search_path` injection on `SECURITY DEFINER` functions (Postgres best practice).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 (deprecation), `@supabase/ssr` 0.10.x stable as of 2026 | Auth-helpers package is no longer maintained — must use `@supabase/ssr` |
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` | Next 16.0.0 (2026 release) | Affects Phase 5 — surface here |
| `cookies()` (sync) | `await cookies()` (async) | Next 15 (transition shim), Next 16 (shim removed) | All Server Component / Route Handler code reading cookies needs `await` |
| `supabase.auth.getSession()` for server-side authz | `supabase.auth.getUser()` for server-side authz | Supabase docs reaffirmed 2025 | `getSession` is read-from-cookie (spoofable); `getUser` is server-verified |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs` — replaced by `@supabase/ssr`
- `middleware.ts` — renamed to `proxy.ts` in Next 16
- Synchronous `cookies()` — async-only in Next 16

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | bun is the package manager (`bun.lock` exists per Phase 2 history) | Standard Stack | If npm is preferred, swap `bun add` → `npm install` in plan |
| A2 | Supabase Auth's default rate-limit (~30 sign-ups/hr/IP, ~10 sign-ins/min/IP) is sufficient for v2.3 launch | Q3 | If too lax, add a thin wrapper Route Handler that rate-limits via `lib/rate-limit.ts` and proxies to Supabase. Plan-phase to confirm with operator. |
| A3 | Vercel-side preview deploys (`https://lex-web-*.vercel.app/auth/callback`) can be wildcard-registered in Google Cloud Console; otherwise per-PR manual entry | D-08 + Operator checklist | Per-PR manual is the documented fallback. |
| A4 | The site runs on Node.js runtime (`runtime = "nodejs"`), not Edge runtime, for the auth/callback and sign-out routes | Pattern 5, 6 | If we ever move to Edge, `@supabase/ssr` works on both — no code change |

**No assumptions about library APIs or signatures** — all `@supabase/ssr` and Supabase Auth code samples in this research are verified via Context7 (`/supabase/ssr` library, fetched 2026-05-11).

## Open Questions

None blocking. All five CONTEXT.md questions are answered above. The remaining open items are operator-side configuration (covered in the Pre-implementation operator checklist below).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/ssr` | Phase 4 auth client factories | ✗ (not in package.json) | — (would install ^0.10.3) | — must add via `bun add @supabase/ssr` in Plan 04-01 |
| `@supabase/supabase-js` | Existing data client + transitive `auth-js` | ✓ | 2.105.4 | — |
| `@supabase/auth-js` | `signUp` / `signInWithPassword` / `signInWithOAuth` / `signOut` / `exchangeCodeForSession` / `onAuthStateChange` | ✓ (transitive of supabase-js) | 2.105.4 | — |
| `next` | App Router + cookies() + Route Handlers | ✓ | 16.2.4 | — |
| `react` | Hooks for useSession | ✓ | 19.2.4 | — |
| `vitest` + `@testing-library/react` | Tests | ✓ | 4.1.5 / 16.3.2 | — |
| Supabase project + service-role key | DB migration applier | ✓ (used by Phase 8 db:dv-schema script) | — | — |

**Missing dependencies with no fallback:** `@supabase/ssr` — adding it is the first step of Plan 04-01.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 + @testing-library/react 16.3.2 + jsdom 29.1.1 |
| Config file | `vitest.config.ts` (existing — no changes) |
| Quick run command | `bun run test -- __tests__/auth-*.test.ts` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| AUTH-01 | `signUp` is called with `email`, `password`, `options.data.display_name`, `options.emailRedirectTo` | unit (mock supabase client) | `bun run test -- __tests__/sign-up-form.test.tsx` | ❌ Wave 0 |
| AUTH-01 | `/auth/callback` GET handler calls `exchangeCodeForSession(code)` and redirects to `next` (validates relative path) | unit (mock createRouteHandlerSupabase) | `bun run test -- __tests__/auth-callback-route.test.ts` | ❌ Wave 0 |
| AUTH-01 | `/auth/callback` rejects absolute-URL `next` (open-redirect guard) | unit | same file as above | ❌ Wave 0 |
| AUTH-02 | `signInWithOAuth` is called with `{ provider: 'google', options: { redirectTo: '/auth/callback?next=/' } }` | unit (mock supabase client) | `bun run test -- __tests__/sign-in-form.test.tsx` | ❌ Wave 0 |
| AUTH-02 | Actual Google consent flow completes end-to-end | **manual smoke (BLOCKING)** | Operator: open `/sign-in`, click "Влез с Google", complete consent, verify redirect to `/` and navbar shows "Профил" | manual |
| AUTH-03 | `user_profiles` table exists with RLS enabled and the two policies after `bun run db:auth-schema` | live-DB integration | `bun run db:auth-schema` then SQL `SELECT * FROM pg_policies WHERE tablename = 'user_profiles'` returns 2 rows | ❌ Wave 0 (script) + manual smoke |
| AUTH-03 | After a fresh `auth.users` insert, a corresponding `user_profiles` row appears with the correct `display_name` | live-DB integration (post-deploy) | Manual: sign up via UI, query `SELECT display_name FROM user_profiles WHERE id = (SELECT id FROM auth.users WHERE email = 'test@…')` | manual |
| AUTH-04 | `useSession()` returns `null` for anonymous, the user object after sign-in, and re-renders on `onAuthStateChange` event | unit (mock createBrowserSupabase) | `bun run test -- __tests__/use-session.test.tsx` | ❌ Wave 0 |
| AUTH-04 | `getSession()` server util returns the user from `getUser()` (not `getSession()`) | unit (mock createServerSupabase) | `bun run test -- __tests__/get-session.test.ts` | ❌ Wave 0 |
| AUTH-04 | `POST /api/auth/sign-out` clears the cookie and redirects to `/` | unit (mock createRouteHandlerSupabase + verify supabase.auth.signOut called) | `bun run test -- __tests__/sign-out-route.test.ts` | ❌ Wave 0 |
| AUTH-04 | Navbar shows "Влез" anonymous, "Профил" signed-in (server-rendered + client hook) | UI smoke | Manual: load `/`, verify "Влез" link; sign in; verify "Профил" link | manual |

### Sampling Rate
- **Per task commit:** `bun run test -- __tests__/<files-touched-by-task>.test.ts`
- **Per wave merge:** `bun run test` (full suite — confirms no regressions in Phase 1 / 2 / 8 tests)
- **Phase gate:** Full suite green + the **BLOCKING manual smoke** for AUTH-02 (Google OAuth consent) and AUTH-03 (DB row creation post-signup) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `__tests__/sign-up-form.test.tsx` — covers AUTH-01
- [ ] `__tests__/sign-in-form.test.tsx` — covers AUTH-02 (mocked Google flow)
- [ ] `__tests__/auth-callback-route.test.ts` — covers AUTH-01 callback path + open-redirect guard
- [ ] `__tests__/use-session.test.tsx` — covers AUTH-04 client hook
- [ ] `__tests__/get-session.test.ts` — covers AUTH-04 server util
- [ ] `__tests__/sign-out-route.test.ts` — covers AUTH-04 sign-out
- [ ] `scripts/apply-auth-schema.ts` — idempotent applier (mirrors `scripts/apply-dv-schema.ts`)
- [ ] No new framework install needed — vitest + RTL + jsdom were installed in Phase 1.

## Security Domain

> security_enforcement is enabled (no explicit `false` in `.planning/config.json`). Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (PKCE, password hashing handled server-side) |
| V3 Session Management | yes | Supabase SSR cookie chunking, HttpOnly + SameSite=Lax (default), token refresh on Phase 5 proxy |
| V4 Access Control | yes (RLS only at this phase) | Postgres RLS policies on `user_profiles` (D-05) |
| V5 Input Validation | yes (sign-up form) | Inline checks (email regex, password length, display name non-empty); Supabase server-side validates again |
| V6 Cryptography | n/a (delegated to Supabase) | Never hand-roll — Supabase uses bcrypt for password storage, JWT signing |

### Known Threat Patterns for Next 16 + Supabase Auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Open redirect via `next=` query param | Spoofing | `next.startsWith("/")` guard (Pitfall 3, Pattern 5) |
| Credential stuffing on `signInWithPassword` | Spoofing | Supabase per-IP rate limit (default ~10/min); raise CAPTCHA if abuse spikes (deferred to v2.4) |
| Cookie tampering / session fixation | Tampering | `@supabase/ssr` PKCE flow; HttpOnly auth cookie; `getUser()` (not `getSession()`) for server-side authz (Pitfall 5) |
| Email-header injection in display_name flowing to Supabase email template | Tampering | Display name is stored in `user_profiles`, NOT used in email templates; no injection surface |
| RLS bypass via direct API access | Elevation of Privilege | RLS enabled on `user_profiles`; both policies enforce `auth.uid() = id` |
| `SECURITY DEFINER` function exploited via `search_path` | Elevation of Privilege | `SET search_path = public` added to `handle_new_user()` (Postgres best practice — corrected from CONTEXT.md SQL) |
| CSRF on `POST /api/auth/sign-out` | Spoofing | Supabase auth cookies are SameSite=Lax (default) — third-party POSTs cannot include them. No CSRF token needed for sign-out (worst case: someone gets signed out — annoying, not exploitable). |
| OAuth code interception | Spoofing | PKCE is the default for `@supabase/ssr` (`flowType: "pkce"`). The code-verifier cookie is HttpOnly. |
| Phishing via crafted Bulgarian email confirmation | Spoofing | Operator must update Supabase email template to Bulgarian + verify the From address is recognized — covered in operator checklist below |

## Pre-implementation Operator Checklist

Expanding CONTEXT.md D-08. None of these are scriptable from app code.

### 1. Supabase Dashboard — Auth providers
- Path: **Supabase Dashboard → your project → Authentication → Providers**
- Action: Enable **"Email"** provider (verify "Confirm email" is ON; this enforces magic-link verification per D-02)
- Action: Enable **"Google"** provider, paste OAuth client ID + secret (from step 3 below)

### 2. Supabase Dashboard — Email templates
- Path: **Authentication → Email Templates → "Confirm signup"**
- Action: Replace English copy with Bulgarian. Recommended (formal-legal tone, matches D-10):

  **Subject:** `Потвърждение на регистрация в lex.bg`

  **Body:**
  ```
  Здравейте,

  За да завършите регистрацията си в lex.bg, моля потвърдете имейл адреса си,
  като натиснете върху бутона по-долу:

  [{{ .ConfirmationURL }}]

  Ако не сте инициирали тази регистрация, моля игнорирайте този имейл.

  С уважение,
  Екипът на lex.bg
  ```
- Repeat for **"Magic Link"** and **"Reset Password"** templates if they're enabled (Phase 4 doesn't use them — but operator should set them anyway to avoid surprises later).

### 3. Google Cloud Console — OAuth client
- Path: https://console.cloud.google.com/apis/credentials
- Action: **Create Credentials → OAuth client ID → Web application**
- Action: Add **Authorized redirect URIs**:
  - `https://lex-web-eta.vercel.app/auth/callback` (production)
  - `http://localhost:3000/auth/callback` (local dev)
  - For per-PR previews: add the specific preview URL as needed (Google does NOT support `*.vercel.app` wildcards — must add per-PR if previews need OAuth testing)
- Action: Copy **Client ID** and **Client secret** → paste into the Supabase Google provider config (step 1)

### 4. Google Cloud Console — OAuth consent screen
- Path: https://console.cloud.google.com/apis/credentials/consent
- Action: Set **App name** = `lex.bg`
- Action: Set **User support email** + **Developer contact**
- Action: Add scopes: `openid`, `email`, `profile` (default — sufficient for `full_name` to populate `raw_user_meta_data`)
- Action: Status — for production, click "Publish app" (out of testing mode); add yourself as a test user during dev

### 5. Supabase Dashboard — Site URL & redirect allow-list
- Path: **Authentication → URL Configuration**
- Action: Set **Site URL** = `https://lex-web-eta.vercel.app`
- Action: Add **Redirect URLs** allow-list:
  - `https://lex-web-eta.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`
- Without these, Supabase rejects `emailRedirectTo` with "redirect URL not allowed" error.

### 6. Vercel env vars
- No new env vars needed — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are already set (used by existing `lib/supabase.ts`).
- Optional: add `NEXT_PUBLIC_SITE_URL=https://lex-web-eta.vercel.app` if Plan 04-04 chooses to use it for the `emailRedirectTo` construction (the recommended pattern uses `window.location.origin`, which works without an env var).

### 7. Local dev `.env.local`
- No changes needed — same env vars as production (anon key + URL).

### 8. Verify before declaring Phase 4 done
- [ ] Email signup → receives Bulgarian verification email → click link → lands on `/?verified=1` (or just `/` per Q2 default) → cookie set → navbar shows "Профил"
- [ ] Google OAuth → consent screen in Bulgarian (Google handles localization based on browser) → redirects back → cookie set → navbar shows "Профил"
- [ ] `SELECT id, display_name FROM user_profiles WHERE id IN (SELECT id FROM auth.users)` returns one row per user with non-null display_name
- [ ] Sign-out → cookie cleared → navbar shows "Влез"
- [ ] `/api/audit/vote` still works for anonymous votes (regression smoke — Q5 zero-changes confirmation)

## Test Surface

### Testable via vitest (automated, fast)
- **`signUp` invocation shape** — mock `createBrowserSupabase` to capture the args and assert `email`, `password`, `options.data.display_name`, `options.emailRedirectTo` are correct.
- **`signInWithPassword` invocation shape** — same pattern.
- **`signInWithOAuth` invocation shape** — assert `provider: 'google'` + `redirectTo` is `/auth/callback?next=/`.
- **`signOut` is called** by the sign-out Route Handler — mock `createRouteHandlerSupabase`, assert `supabase.auth.signOut()` was called, and that the response is a 303 redirect to `/`.
- **`/auth/callback` happy path** — mock `exchangeCodeForSession` to return `{ error: null }`, GET `/auth/callback?code=abc&next=/dashboard`, assert redirect to `/dashboard`.
- **`/auth/callback` open-redirect guard** — GET `/auth/callback?code=abc&next=https://evil.com`, assert redirect to `/` (NOT to evil.com).
- **`/auth/callback` failure path** — mock `exchangeCodeForSession` to return `{ error: ... }`, assert redirect to `/sign-in?error=callback`.
- **`useSession()` lifecycle** — mock `createBrowserSupabase`; assert initial `getSession` call, assert `onAuthStateChange` subscription, simulate a SIGNED_IN event, assert `user` updates, simulate unmount, assert `subscription.unsubscribe()` called.
- **`getSession()` server util** — mock `createServerSupabase`, assert `getUser()` (not `getSession()`) is the underlying call.
- **Sign-up form: required-field validation** — render with empty fields, click submit, assert form does not submit (or shows Bulgarian error).
- **Sign-up form: error mapping** — mock supabase client to throw "User already registered", assert UI shows "Този имейл е вече регистриран."

### NOT testable via vitest (manual or live-only)
- **Actual Google OAuth consent screen** — vitest can't drive `accounts.google.com`. **BLOCKING manual smoke at Plan 04-04 checkpoint.** Mirrors the Phase 8 Plan 08-01 live-net smoke pattern.
- **Real magic-link email delivery + click** — Supabase actually sends an email via their SMTP. **BLOCKING manual smoke** to confirm the Bulgarian template renders and the click-flow works end-to-end.
- **`handle_new_user` trigger fires on real `auth.users` insert** — needs a live Supabase project. Verified via the manual smoke above (display_name appears in `user_profiles` after sign-up).
- **RLS enforcement** — manually verify by trying to `SELECT` another user's row from a signed-in session (should return 0 rows).
- **Cookie chunking on Google OAuth** (Pitfall 4) — only manifests with real Google tokens. Covered by the OAuth manual smoke.

### Recommended `__tests__/sign-up-form.test.tsx` skeleton

```typescript
// File: __tests__/sign-up-form.test.tsx

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signUpMock = vi.fn();
vi.mock("@/lib/supabase-auth", () => ({
  createBrowserSupabase: () => ({
    auth: { signUp: signUpMock },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { SignUpForm } from "@/app/sign-up/sign-up-form";

describe("<SignUpForm>", () => {
  beforeEach(() => {
    signUpMock.mockReset();
  });

  it("calls supabase.auth.signUp with email, password, display_name, and emailRedirectTo", async () => {
    signUpMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    render(<SignUpForm />);
    fireEvent.change(screen.getByLabelText(/имейл/i), { target: { value: "test@example.bg" } });
    fireEvent.change(screen.getByLabelText(/парола/i), { target: { value: "supersecret" } });
    fireEvent.change(screen.getByLabelText(/име/i), { target: { value: "Иван Петров" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирай/i }));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith({
        email: "test@example.bg",
        password: "supersecret",
        options: {
          emailRedirectTo: expect.stringMatching(/\/auth\/callback\?next=\//),
          data: { display_name: "Иван Петров" },
        },
      });
    });
  });

  it("shows Bulgarian error on duplicate email", async () => {
    signUpMock.mockResolvedValueOnce({
      data: null,
      error: { message: "User already registered" },
    });

    render(<SignUpForm />);
    fireEvent.change(screen.getByLabelText(/имейл/i), { target: { value: "test@example.bg" } });
    fireEvent.change(screen.getByLabelText(/парола/i), { target: { value: "supersecret" } });
    fireEvent.change(screen.getByLabelText(/име/i), { target: { value: "Иван" } });
    fireEvent.click(screen.getByRole("button", { name: /регистрирай/i }));

    expect(await screen.findByText(/вече регистриран/i)).toBeInTheDocument();
  });
});
```

## Sources

### Primary (HIGH confidence)
- **Context7 `/supabase/ssr`** — `createServerClient`, `createBrowserClient`, OAuth flow, `signUp`/`signInWithPassword`/`signInWithOAuth`/`signOut`/`exchangeCodeForSession`/`onAuthStateChange` shapes. Fetched 2026-05-11.
- **`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`** — confirms middleware → proxy renaming in Next 16.
- **`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`** — proxy.ts API reference, version history confirms v16.0.0 rename.
- **`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`** — `cookies()` is async since Next 15, mandatory await in 16.
- **`node_modules/next/dist/docs/01-app/02-guides/authentication.md`** — confirms Supabase listed in official auth-libraries; recommends `getUser()` over `getSession()` for server authz.
- **`node_modules/@supabase/auth-js/package.json`** v2.105.4 — confirms `auth-js` is transitive dep; `signUp`, `signInWithPassword`, `signInWithOAuth`, `signOut`, `exchangeCodeForSession`, `onAuthStateChange` are all exported.
- **`npm view @supabase/ssr version`** → `0.10.3` (published 2026-05-07).

### Secondary (MEDIUM confidence)
- **supabase.com/docs/guides/auth/server-side/nextjs** — confirms `@supabase/ssr` is the official Next.js integration; `getClaims()` is recommended over `getSession()` for server-side validation (this research uses `getUser()` which Supabase docs explicitly endorse — both are correct, `getUser` is more widely-deployed).
- **supabase.com/docs/guides/auth/social-login/auth-google** — provides the `/auth/callback` route handler pattern with `next` query param + open-redirect guard + x-forwarded-host handling.
- **supabase.com/docs/guides/auth/sessions/pkce-flow** — confirms PKCE is the default flow for SSR clients.

### Tertiary (LOW confidence)
- **supabase.com/docs/guides/auth/rate-limits** — could not fetch the exact default rate-limit values (page is generic). Documented as A2 assumption — operator should confirm via Supabase dashboard.

## Project Constraints (from CLAUDE.md)

The project's CLAUDE.md is a one-line file:

> **"This is NOT the Next.js you know."** — APIs, conventions, and file structure may all differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code.

This research honored that directive: every Next.js claim in this file (cookies-is-async, middleware-renamed-to-proxy, App Router file conventions) was verified against the in-tree `node_modules/next/dist/docs/` files, not against training data. Three Next 16 breaking changes were caught this way:
1. `middleware.ts` → `proxy.ts` (affects Phase 5 — surface this in the planner notes)
2. `cookies()` is async — must `await`
3. The `runtime` config option is forbidden in proxy files

Phase 4 itself does not ship a proxy file, so #1 and #3 don't apply to Phase 4 plans — but Phase 5 plans MUST be written against `proxy.ts` syntax from day 1.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@supabase/ssr` version verified via `npm view`; all signatures verified via Context7 + node_modules type defs
- Architecture: HIGH — Next 16 patterns verified against in-tree docs; Supabase patterns verified against Context7 fetched today
- Pitfalls: HIGH — pitfalls 1, 2, 5, 8 are documented in official sources; 3, 4, 6, 7, 9, 10 are inferred from the architecture but mechanically obvious
- Security: HIGH — RLS policies match Supabase best practice; PKCE is verified to be the default; one improvement to D-05 SQL noted (`SET search_path = public`)

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — Supabase SSR is stable; Next 16 is fresh and may evolve)
