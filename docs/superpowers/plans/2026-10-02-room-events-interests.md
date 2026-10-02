# DTEC Room Events and Interests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let authenticated DTEC members discover configurable events and register/remove their own interest in them.

**Architecture:** Replace the hard-coded activity interest view with persisted `room_events` and `room_event_interests` resources. Server routes require a completed Google-authenticated DTEC profile; RLS limits interest mutations to the current user and event administration to ADM/MOD. Event cards are rendered inside the existing lightweight `MuralWindow`.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Supabase/Postgres RLS, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-eventos-e-vaquinhas-design.md`

## Global Constraints

- Read access requires a valid Google session and a completed DTEC profile.
- Members may add/remove only their own interest; ADM/MOD manage events.
- Interest means interest only, not attendance confirmation.
- Keep the mural lightweight and scrollable on desktop and mobile; do not render mural contents in Three.js.
- Preserve current Kart interest rows during migration.

## Review Focus

- Anonymous or incomplete-profile request: route returns `401` and reveals no private roster.
- Duplicate/concurrent interest request: one row per event/member and no duplicate count.
- Tampered `user_id`: server derives identity from session and RLS rejects cross-user writes.
- Closed/cancelled event: interest mutation is rejected; previous interest remains inspectable as designed.
- Existing Kart interest: migration preserves all legacy participant identities.

---

### Task 1: Event validation and event API

**Files:**
- Create: `lib/events/validation.ts`
- Create: `tests/event-validation.test.ts`
- Create: `app/api/events/route.ts`
- Create: `app/api/events/[id]/route.ts`
- Test: `tests/events-api.test.ts`

**Interfaces:**
- Produces `normalizeRoomEvent(input: unknown): { title: string; description: string; category: "futebol" | "paintball" | "kart" | "outro"; startsAt: string | null; location: string }`.
- `GET /api/events` returns active events and interest counts to authenticated profiles; `POST` creates through ADM/MOD authorization.
- `PATCH /api/events/[id]` edits fields or status through ADM/MOD authorization.

- [ ] **Step 1: Write failing validation tests** for trimming, required title, 80/1000-character limits, valid category/date, and malformed input.
- [ ] **Step 2: Run `npm test -- tests/event-validation.test.ts`** and confirm those assertions fail.
- [ ] **Step 3: Implement `normalizeRoomEvent`** in `lib/events/validation.ts`, reusing existing validation style.
- [ ] **Step 4: Add failing route tests** for anonymous `401`, member create/patch `403`, ADM/MOD create/list/update, and closed-event output.
- [ ] **Step 5: Implement the two handlers** using `getMuralUserContext`-style session/profile lookup and a server role check; never accept `created_by` from the body.
- [ ] **Step 6: Run focused tests, `npm run lint`, and `npx tsc --noEmit`**; expected all pass.
- [ ] **Step 7: Commit** as `feat: add authenticated room events API`.

### Task 2: Event schema, policies, and migration of Kart interest

**Files:**
- Create: `supabase/migrations/202610030001_room_events.sql`
- Test: `tests/room-events-migration.test.ts`

**Interfaces:**
- Creates `room_events(id,title,description,category,starts_at,location,status,created_by,created_at,updated_at)`.
- Creates `room_event_interests(event_id,user_id,created_at)` with primary key `(event_id,user_id)`.
- Exposes `public.is_room_moderator()`/existing ADM helper for policies; no anon grants.

- [ ] **Step 1: Write failing migration-contract tests** asserting event/category/status constraints, RLS, no anon grants, own-interest policies, and ADM/MOD-only event writes.
- [ ] **Step 2: Run `npm test -- tests/room-events-migration.test.ts`** and confirm failure.
- [ ] **Step 3: Write the idempotent migration** with constraints and policies; seed one Kart event if absent and copy `activity_interests(activity_key='kart')` into it without deleting legacy rows.
- [ ] **Step 4: Run migration-contract tests** and verify they pass.
- [ ] **Step 5: Apply to staging first**, inspect the event and copied-interest counts, and verify an anon session cannot query either table.
- [ ] **Step 6: Commit** as `feat: persist room events and interests`.

### Task 3: Interest API and event folder UI

**Files:**
- Create: `app/api/events/[id]/interest/route.ts`
- Create: `components/mural/events-folder.tsx`
- Modify: `components/mural-window.tsx`
- Create: `tests/event-interest-contract.test.ts`

**Interfaces:**
- `POST /api/events/[id]/interest` adds the current user; `DELETE` removes only the current user; `GET` returns roster `{userId,name,avatar,title}` plus `isInterested`.
- `EventsFolder({currentUserId, category?})` renders active event cards, counts, detail, and the “Tenho interesse/Remover meu interesse” control.

- [ ] **Step 1: Write failing API/contract tests** for own add/remove, duplicate add idempotence, cross-user attempt rejection, unauthorized access, and closed-event rejection.
- [ ] **Step 2: Run the focused test** and confirm failure.
- [ ] **Step 3: Implement the interest handler** with `userId` sourced from session and RLS as a second boundary.
- [ ] **Step 4: Add focused tests for extracted event-card view-model/formatting helpers**; this repository has no React DOM test renderer installed, so do not introduce a UI-test dependency just for this task.
- [ ] **Step 5: Implement `EventsFolder`** as a light 2D folder; replace hard-coded event placeholder content in `MuralWindow` while preserving other folders.
- [ ] **Step 6: Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`**; manually verify loading, empty, auth-required, roster names/avatars, count, add/remove, and one phone-width viewport.
- [ ] **Step 7: Commit** as `feat: add event interest rosters`.
