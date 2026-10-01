# DTEC Google Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Google authentication, persistent sessions and account-bound character profiles while preserving anonymous room viewing.

**Architecture:** Supabase Auth handles Google OAuth through the Next.js 16 PKCE/cookie flow. Supabase Postgres stores one RLS-protected profile per authenticated user. A small auth/profile boundary feeds explicit UI states into the existing client scene, so local storage can no longer grant interaction rights.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres, `@supabase/ssr`, `@supabase/supabase-js`, Vitest, Vercel

**Spec:** `docs/superpowers/specs/2026-10-01-google-auth-design.md`

## Global Constraints

- Any Google account may authenticate; do not restrict email domains.
- OAuth stays in the current browser tab and uses PKCE with cookie-backed sessions.
- Anonymous visitors may observe the room but cannot use private interaction controls.
- Never commit Google secrets, Supabase secret keys, provider tokens or user passwords.
- Profile names are trimmed and limited to 18 characters; avatar IDs are limited to `a`, `c`, `f`, `j`, `n`, `r`.
- Do not add realtime presence, shared chat, administration or financial features in this plan.

## Review Focus

- Missing public Supabase environment variables must leave the room usable in anonymous mode and show a safe login error.
- Cancelled or invalid OAuth callbacks must return to `/` without opening the character chooser.
- A valid session with no profile must open onboarding exactly once; an existing profile must skip it.
- Expired or revoked sessions must remove interaction controls instead of trusting stale local state.
- RLS must reject insertion or updates where `user_id` differs from `auth.uid()`.

---

### Task 1: Supabase client and session infrastructure

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/config.ts`
- Create: `proxy.ts`
- Create: `.env.example`
- Create: `tests/supabase-config.test.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `hasSupabaseConfig(): boolean`, `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, and the Next.js `proxy(request)` session refresher.
- Consumes: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1: Write the failing configuration tests**

Test that both variables are required together, missing configuration returns `false`, and no secret/service-role variable is part of the browser contract.

- [ ] **Step 2: Run the focused test and confirm it fails because the configuration module does not exist**

Run: `npm test -- tests/supabase-config.test.ts`

- [ ] **Step 3: Install Supabase SSR/client and Vitest, add the `npm test` script, then implement the three client/config modules and `proxy.ts`**

Use the current Next.js 16 `proxy.ts` convention. Refresh claims through the server client and propagate the library's private/no-store response headers.

- [ ] **Step 4: Run the focused test, lint and type-aware production build**

Run: `npm test -- tests/supabase-config.test.ts && npm run lint && npm run build`

- [ ] **Step 5: Commit**

Commit message: `feat: add Supabase session infrastructure`

### Task 2: Google OAuth entry, callback and logout

**Files:**
- Create: `app/auth/login/route.ts`
- Create: `app/auth/callback/route.ts`
- Create: `app/auth/logout/route.ts`
- Create: `lib/auth/redirects.ts`
- Create: `tests/auth-redirects.test.ts`

**Interfaces:**
- Produces: `safeReturnPath(value: string | null): string`; GET routes `/auth/login`, `/auth/callback`, and POST `/auth/logout`.
- Consumes: `createServerSupabaseClient()` from Task 1.

- [ ] **Step 1: Write failing tests for safe local return paths and rejected external/protocol-relative paths**

Assertions cover `/`, valid internal paths, `https://evil.example`, `//evil.example`, malformed input, cancelled callback and missing OAuth code.

- [ ] **Step 2: Run the focused tests and confirm expected failures**

Run: `npm test -- tests/auth-redirects.test.ts`

- [ ] **Step 3: Implement redirect validation and the three auth routes**

`/auth/login` calls `signInWithOAuth({ provider: "google", options: { redirectTo } })` and redirects the same tab. The callback exchanges the code and redirects to `/`; failures add only a short safe error code. Logout signs out and redirects to `/`.

- [ ] **Step 4: Run focused tests and the complete test suite**

Run: `npm test -- tests/auth-redirects.test.ts && npm test`

- [ ] **Step 5: Commit**

Commit message: `feat: add Google OAuth routes`

### Task 3: Account-bound profile storage and RLS

**Files:**
- Create: `supabase/migrations/202610010001_profiles.sql`
- Create: `lib/profile/validation.ts`
- Create: `app/api/profile/route.ts`
- Create: `tests/profile-validation.test.ts`

**Interfaces:**
- Produces: `normalizeProfile(input): { displayName: string; avatarId: AvatarId }`, authenticated GET/PUT `/api/profile`.
- Consumes: authenticated Supabase server client from Task 1.

- [ ] **Step 1: Write failing profile-validation tests**

Cover trimming, 18-character limit, blank names, all six allowed avatars, an unknown avatar, additional object fields, and a user attempting to supply another `user_id`.

- [ ] **Step 2: Run the focused test and confirm validation behavior is missing**

Run: `npm test -- tests/profile-validation.test.ts`

- [ ] **Step 3: Implement validation, SQL table/policies and authenticated profile API**

The API derives `user_id` only from verified claims. PUT upserts only `display_name` and `avatar_id`. SQL enables RLS and grants select of display fields while limiting writes to `auth.uid() = user_id`.

- [ ] **Step 4: Run focused and complete tests**

Run: `npm test -- tests/profile-validation.test.ts && npm test`

- [ ] **Step 5: Commit**

Commit message: `feat: persist authenticated character profiles`

### Task 4: Auth-aware office interface and approved entry styling

**Files:**
- Create: `lib/auth/view-state.ts`
- Create: `hooks/use-dtec-auth.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/google-entry-button.test.mjs`
- Create: `tests/auth-view-state.test.ts`

**Interfaces:**
- Produces: `AuthViewState = "loading" | "anonymous" | "authenticated-needs-profile" | "ready"`; `useDtecAuth()` with session, profile, save, sign-in and sign-out actions.
- Consumes: browser Supabase client and `/api/profile` from Tasks 1 and 3.

- [ ] **Step 1: Write failing state-transition and UI contract tests**

Assert that anonymous users see the Google entry only, authenticated users without profiles see onboarding, ready users see controls, stale local profile data never grants access, and logout returns to anonymous state. Assert the G is a white circle over a black translucent rectangle with white `Entrar` text.

- [ ] **Step 2: Run the focused tests and confirm failures for the missing auth state**

Run: `npm test -- tests/auth-view-state.test.ts tests/google-entry-button.test.mjs`

- [ ] **Step 3: Implement the auth hook/state and replace `created` authorization in the page**

Keep the 3D scene visible in all states. Open onboarding only after confirmed authentication with no profile. Preserve typed data after failed saves. Add a small account menu containing `Meu avatar` and `Sair da conta`.

- [ ] **Step 4: Implement the exact entry-button layout**

The outer button is a compact black translucent rounded rectangle. `Entrar` is white. The existing Icons8 Google image is rendered inside a separate white circular element overlapping the left edge.

- [ ] **Step 5: Run the complete test, lint and build suite**

Run: `npm test && npm run lint && npm run build`

- [ ] **Step 6: Commit**

Commit message: `feat: gate office interactions behind Google login`

### Task 5: Configure Supabase/Google/Vercel and verify production

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Supabase project URL/publishable key, Google OAuth web client, Vercel environment configuration.
- Produces: deployed authentication at `https://dtec-kappa.vercel.app`.

- [ ] **Step 1: Document exact dashboard settings without recording secret values**

Include the Supabase provider callback in Google Cloud, `https://dtec-kappa.vercel.app/auth/callback` in the Supabase redirect allow list, and the two public variables in Vercel.

- [ ] **Step 2: Configure the external services using the owner's signed-in sessions**

Do not expose secrets in tool output, source files or chat. OAuth authorization or any provider consent that grants persistent access requires the owner to confirm at the moment it appears.

- [ ] **Step 3: Apply the profile migration and verify RLS**

Check creation of one own profile and confirm an authenticated attempt to write a different `user_id` is rejected.

- [ ] **Step 4: Push to GitHub and wait for the Vercel deployment**

Push only to remote `github`, branch `main`; do not use the obsolete private `origin` remote.

- [ ] **Step 5: Perform production acceptance checks**

In a signed-out browser: room remains visible, only Google access appears, and no private controls work. Complete Google login in the same tab, create a profile, reload, verify automatic restoration, send a local message, sign out, and verify the anonymous state returns.

- [ ] **Step 6: Run final repository verification and commit documentation**

Run: `npm test && npm run lint && npm run build && git status --short`

Commit message: `docs: record Google authentication setup`
