# CuboChat Room Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate roles, notices, reactions, events and fundraisers by public CuboChat room while preserving all DTEC records and payment history.

**Architecture:** Keep shared tables with `room_slug` and a per-room staff table. Routes for `/api/rooms/[slug]/...` validate and filter by room; RLS and transactional RPCs enforce identity, role and parent-child scope. Legacy `/api/mural/*`, `/api/events/*` and `/api/fundraisers/*` remain DTEC-only until the shared UI is validated.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL RLS, Vitest and PGlite.

**Spec:** `docs/superpowers/specs/2026-10-02-cubochat-room-permissions-design.md`

## Global Constraints

- Rooms are public in this phase: a Google account with a completed profile may explicitly open another room; a request scoped to room A must never return or mutate B.
- Room ID is 3–20 characters, only `a–z` and `0–9`; uppercase typed in the UI is converted; spaces, accents and dots are invalid.
- Preserve all DTEC IDs, campaigns, cycles, statuses and audit entries; no destructive backfill or delete.
- `paid` is a manual assertion, not bank confirmation; no Pix processing or total-raised display.
- Anonymous visitors may view the scene, never internal notices, payment lists or audit.
- Do not touch production or DNS in this plan. Apply/test migrations only in `dtec-staging` after local verification; stop on failed integrity/RLS checks.
- Keep the current dirty worktree and unrelated user changes intact; stage and commit only files for each task.

## Review Focus

1. Same person is ADM in A but not B: B management request returns `403` and changes no row (Task 1 and Task 5 tests).
2. An ID from B is sent to an A endpoint: return `404`, with no cross-room reaction, participant or payment change (Tasks 2 and 4 tests).
3. A room creator gets ADM even if a second request races room creation: owner assignment is atomic and cannot be forged for another user (Task 1 test).
4. Concurrent payment marks and monthly rollover: exactly one state change/audit per effective transition, old cycle unchanged and stale cycle returns `409` (Task 4 test).
5. User explicitly opens another public room: its internal content is readable after login, while anonymous reads remain `401` (Task 2 and Task 5 tests).

---

### Task 1: Per-room ADM/MOD and atomic room creation

**Files:** Create `supabase/migrations/202610030012_room_staff.sql`, `lib/rooms/authorization.ts`, `app/api/rooms/[slug]/staff/route.ts`, `tests/room-staff-migration.test.ts`, `tests/room-staff-api.test.ts`; modify `app/api/rooms/route.ts`, `lib/fundraisers/server.ts` and the current role tests.

**Interfaces:** `hasRoomRole(context: MuralUser, slug: string, roles: readonly ("owner" | "leader")[]): Promise<{ allowed: boolean; failed: boolean }>`; room staff table key `(room_slug, user_id)`. `POST /api/rooms/[slug]/staff` appoints `leader`, `DELETE` removes it; owner cannot be removed here.

- [ ] **Step 1: Write failing PGlite and API tests.** Assert existing `room_roles` owner/leader backfill only to `dtec`; new `rooms` insert makes `created_by` owner in one transaction; forged owner row and ADM of A appointing in B fail; the room creator race yields one owner. Assert explicit public room access does not grant role.
- [ ] **Step 2: Run `npx vitest run tests/room-staff-migration.test.ts tests/room-staff-api.test.ts` and confirm RED** from missing table/helper/route.
- [ ] **Step 3: Implement migration and helper.** Create staff FK to `rooms` and `profiles`, unique `(room_slug,user_id)`, role check, restrictive RLS, atomic ownership trigger/RPC on room insertion and idempotent DTEC backfill. Use session `auth.uid()` for authorization; do not trust request `user_id` as actor. Add the route and use `hasRoomRole` for room management.
- [ ] **Step 4: Run targeted tests, `npx tsc --noEmit`, and confirm GREEN.** Commit only this task's files with message `feat: scope ADM and MOD to rooms`.

### Task 2: Room-scoped mural and reactions

**Files:** Create `supabase/migrations/202610030013_room_mural.sql`, `lib/rooms/mural-server.ts`, `app/api/rooms/[slug]/mural/messages/route.ts`, `app/api/rooms/[slug]/mural/messages/[id]/route.ts`, `app/api/rooms/[slug]/mural/messages/[id]/reactions/route.ts`, `tests/room-mural-migration.test.ts`, `tests/room-mural-api.test.ts`; modify DTEC mural routes and reaction RPC tests as needed.

**Interfaces:** `getRoomMuralContext(slug: string): Promise<{ context: MuralUser; slug: string } | null>`; room APIs return the same message/reaction response shapes as DTEC routes. Their actor comes from the session and their row lookup always includes `room_slug`.

- [ ] **Step 1: Write failing tests.** Verify old messages and reactions remain in DTEC; authenticated profile reads/writes in A, but A endpoints given B message IDs return `404`; anon returns `401`; author edits own unpinned recado, ADM/MOD moderates only own room; reaction summaries and people lists never mix A/B.
- [ ] **Step 2: Run `npx vitest run tests/room-mural-migration.test.ts tests/room-mural-api.test.ts` and confirm RED.**
- [ ] **Step 3: Implement policies, room routes and RPC scope.** Remove permissive global mural policies before installing per-room policies; enforce `room_slug` stability on UPDATE. Make security-definer reaction functions check the parent room/actor (or replace them with room-slug signatures) so IDs cannot bypass RLS. Keep legacy routes hard-pinned to DTEC.
- [ ] **Step 4: Run targeted tests plus existing `tests/mural-reactions-api.test.ts`, `tests/mural-participation-api.test.ts` and `npx tsc --noEmit`; confirm GREEN.** Commit only this task with `feat: scope notices and reactions to rooms`.

### Task 3: Events and interests per room

**Files:** Create `supabase/migrations/202610030014_room_events.sql`, `app/api/rooms/[slug]/events/route.ts`, `app/api/rooms/[slug]/events/[id]/route.ts`, `app/api/rooms/[slug]/events/[id]/interest/route.ts`, `tests/room-events-api.test.ts`, `tests/room-events-migration.test.ts`; modify `app/api/events/**` only for DTEC-compatible routing.

**Interfaces:** Generic event routes preserve the existing event/interest response shapes; every event lookup matches both `id` and `room_slug`, while role check uses `hasRoomRole(context, slug, ["owner","leader"])`.

- [ ] **Step 1: Write failing tests.** ADM/MOD creates in A, member adds/removes only own interest, B ID sent to A returns `404`, an ADM in A cannot edit B, anonymous requests return `401`, legacy DTEC Kart/interests remain intact.
- [ ] **Step 2: Run `npx vitest run tests/room-events-api.test.ts tests/room-events-migration.test.ts` and confirm RED.**
- [ ] **Step 3: Harden event RLS in the new migration and add generic routes.** Drop broad legacy policies before replacing with per-room rules; ensure child interest refers to its parent event and actor, and legacy routes stay pinned to DTEC.
- [ ] **Step 4: Run targeted plus `tests/events-api.test.ts` and `npx tsc --noEmit`; confirm GREEN.** Commit only this task with `feat: scope events and interests to rooms`.

### Task 4: Room-scoped fundraiser storage and transactional payments

**Files:** Create `supabase/migrations/202610030015_room_fundraisers.sql`, `tests/room-fundraiser-migration.test.ts`; replace or wrap the payment/cycle functions through the new migration, without rewriting an applied migration.

**Interfaces:** `set_room_fundraiser_payment(p_room_slug text, p_fundraiser_id uuid, p_cycle_due_date date, p_participant_id uuid, p_paid boolean) returns boolean`; existing client RPC must be revoked for unrestricted use or become a DTEC-only compatibility wrapper. Campaign `room_slug` is required and immutable.

- [ ] **Step 1: Write failing PGlite tests.** Assert every existing campaign/participant/contribution/audit ID remains unchanged and campaign moves to DTEC; new A campaign is invisible to B-scoped queries; role in A cannot mark B; self can mark only own active contribution; concurrent identical marks produce one audit; stale cycle fails without changing old records.
- [ ] **Step 2: Run `npx vitest run tests/room-fundraiser-migration.test.ts` and confirm RED.**
- [ ] **Step 3: Add migration.** Backfill `fundraisers.room_slug='dtec'`, FK/index and restrictive RLS for parent and children via their parent campaign. Create transactional scoped payment function deriving actor and role from session and parent room; retain `source` (`self`/`adm`/`mod`) and one audit per effective transition. Guard or revoke old unscoped RPC. Do not update the production schema.
- [ ] **Step 4: Run targeted and existing `tests/fundraiser-migration.test.ts`, `tests/fundraiser-cycle.test.ts`; confirm GREEN.** Commit only this task with `feat: isolate fundraiser payments by room`.

### Task 5: Room fundraiser APIs and DTEC compatibility

**Files:** Create `lib/rooms/fundraiser-server.ts`, `app/api/rooms/[slug]/fundraisers/route.ts`, `app/api/rooms/[slug]/fundraisers/[id]/route.ts`, `app/api/rooms/[slug]/fundraisers/[id]/participants/route.ts`, `app/api/rooms/[slug]/fundraisers/[id]/contributions/[userId]/route.ts`, `tests/room-fundraisers-api.test.ts`; modify `app/api/fundraisers/**` to remain DTEC-only and call scoped functions.

**Interfaces:** `getRoomFundraiser(context: MuralUser, slug: string, id: string)` returns a campaign or null after both slug and ID match. Generic API response uses existing fundraiser presentation fields; `GET` lists only a requested room; `POST/PATCH` require `hasRoomRole(...,["owner","leader"])`.

- [ ] **Step 1: Write failing API tests.** Cover A manager create/edit, A member `403` on management, B ID to A route `404`, anonymous `401`, self payment, unauthorized other-person payment `403`, cycle changed `409`, paid/pending roster and Pix without total-raised field, and audit hidden from ordinary member.
- [ ] **Step 2: Run `npx vitest run tests/room-fundraisers-api.test.ts` and confirm RED.**
- [ ] **Step 3: Implement shared server logic and routes.** Filter campaign before child lookup or RPC, derive actor from session, preserve DTEC legacy URLs as DTEC-only wrappers, map database errors consistently, use `Cache-Control: private, no-store`.
- [ ] **Step 4: Run targeted and existing `tests/fundraisers-api.test.ts`; confirm GREEN.** Commit only this task with `feat: expose fundraisers per room`.

### Task 6: Lightweight generic room boards and regression validation

**Files:** Create `components/rooms/room-board.tsx`, `tests/generic-room-board.test.tsx`; modify `components/generic-room.tsx`, `components/mural-window.tsx` or its focused child folders, `components/mural/fundraisers-folder.tsx`, and `tests/lobby-separation.test.ts`.

**Interfaces:** `RoomBoard({ roomSlug, canManage, onClose }: { roomSlug: string; canManage: boolean; onClose(): void })`. Generic room uses room APIs from Tasks 2/3/5; DTEC keeps current mural appearance and behavior.

- [ ] **Step 1: Write failing UI tests.** Room A board requests only A endpoints, shows own notices/events/fundraisers, never renders B data; member sees join/self-payment but not manager controls; anonymous visitor gets login prompt; Pix value/status displayed but no total-raised; board remains a lightweight 2D overlay on desktop/mobile.
- [ ] **Step 2: Run `npx vitest run tests/generic-room-board.test.tsx tests/lobby-separation.test.ts` and confirm RED.**
- [ ] **Step 3: Implement board and wire it to `GenericRoom`.** Reuse existing notice/fundraiser UI logic where safe; do not carry DTEC-specific labels/data into the lobby or generic rooms. Preserve generic chat/presence and DTEC route behavior.
- [ ] **Step 4: Run `npm test`, `npm run build`, `git diff --check`; require all passing.** Commit only this task with `feat: add room-scoped boards`.

### Task 7: Isolated staging verification and promotion gate

**Files:** Add `docs/qa/2026-10-02-cubochat-room-isolation.md` with a checkable result matrix; do not modify production configuration.

- [ ] **Step 1: Record local baseline and migration order.** Confirm staging ref `grbanfuzzrlyapxyhjzc`, its nine already-applied migrations and current table counts; take a recoverable backup/snapshot before applying only the pending migrations 006–015 in order. Do not reapply any migration already recorded in staging.
- [ ] **Step 2: Apply pending migrations to staging only.** Verify DTEC row counts/IDs, staff backfill, RLS grants and old-RPC lockdown. Stop and document failures instead of attempting production.
- [ ] **Step 3: Test preview with two Google accounts and two rooms.** Capture role denial, ID-crossing attempts, payment/audit behavior, anonymous restrictions, explicit opening of another public room, DTEC regressions and mobile layout results in the QA matrix.
- [ ] **Step 4: Gate release.** If every local and staging check passes, report results and ask Ynsan for separate approval before any production migration, deployment or DNS change. Commit only QA notes with `test: document room isolation validation`.
