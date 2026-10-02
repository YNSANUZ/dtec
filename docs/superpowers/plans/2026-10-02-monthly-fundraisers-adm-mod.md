# DTEC Monthly Fundraisers and ADM/MOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add recurring monthly vaquinhas with fixed per-person value and paid/pending status, plus visible ADM/MOD terminology and role controls.

**Architecture:** Preserve internal `owner`/`leader` values while presenting ADM/MOD. ADM alone appoints or removes MOD; both can administer campaigns and mark any participant. Each monthly cycle has separate status rows and append-only audit, so the due date starts a new pending cycle without erasing history. Members only see records after Google login/profile completion.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres RLS/RPC, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-eventos-e-vaquinhas-design.md`

## Global Constraints

- Do not change internal `owner`/`leader` role keys; show ADM/MOD in Portuguese UI and put MOD star after the name.
- Only ADM appoints/removes any active DTEC profile as MOD; ADM/MOD administer campaigns.
- Each campaign has one fixed monthly amount per participant, in cents; show this value, due day, and Pix key, never an aggregate collected/remaining total.
- Due day is `1..31`, interpreted in `America/Sao_Paulo`; clamp to month end when the day is absent.
- New cycle starts at the due date with pending status; preserve old cycle/audit; own member or ADM/MOD can mark paid.
- Only authenticated complete profiles can read payment data; never log Pix key.

## Review Focus

- Monthly boundary, DST-free Sao Paulo calendar arithmetic, due-day 29/30/31: exact cycle date and no skipped/duplicate cycle.
- Member joins/ends campaign: include in correct active cycle without rewriting past participation.
- Repeated payment update: exactly one state change/audit record per accepted transaction.
- Self/ADM/MOD/non-role authorization: self may update self, ADM/MOD any participant, regular member cannot update others or administer campaign.
- Public guest and search/log output: no Pix/payment data or history leakage.

---

### Task 1: ADM/MOD role presentation and administrator capability

**Files:**
- Create: `lib/room/roles.ts`
- Create: `tests/room-roles.test.ts`
- Modify: `app/api/room/users/[id]/leader/route.ts`
- Modify: `app/api/room/characters/route.ts`
- Modify: `app/page.tsx`
- Modify: `components/mural-window.tsx`

**Interfaces:**
- `type RoomRole = "owner" | "leader" | "member"`; `roleLabel(role): "ADM" | "MOD" | ""`.
- `canAppointModerator(role): boolean` returns true only for `owner`.
- HTTP payloads retain role keys; UI displays ADM/MOD and leader star after full name.

- [x] **Step 1: Write failing role helper tests** for all labels and only-owner appoint capability.
- [x] **Step 2: Run `npm test -- tests/room-roles.test.ts`** and verify failure.
- [x] **Step 3: Implement pure role helpers** without changing DB enum/key values.
- [x] **Step 4: Add failing route/UI tests**: only ADM can assign/revoke MOD for any existing profile; MOD/member requests receive `403`; rendered roster/profile says ADM or `Name ⭐` rather than “dono/líder”.
- [x] **Step 5: Update the current leader route and role labels**. Extend protected query to resolve selected user's profile; do not allow client to assign ADM or self-promote.
- [x] **Step 6: Run role tests, lint, and TypeScript**; expected pass.
- [ ] **Step 7: Commit** as `feat: present room owner and leader as ADM and MOD`.

### Task 2: Monthly cycle, fundraiser validation, schema, and audit RPC

**Files:**
- Create: `lib/fundraisers/cycle.ts`
- Create: `lib/fundraisers/validation.ts`
- Create: `tests/fundraiser-cycle.test.ts`
- Create: `tests/fundraiser-validation.test.ts`
- Create: `supabase/migrations/202610030003_monthly_fundraisers.sql`

**Interfaces:**
- `getUpcomingDueDate(now: Date,dueDay: number): string` returns the next cycle's due date in `America/Sao_Paulo`; on the due-day boundary, returns the following monthly due date.
- `normalizeFundraiser(input: unknown): {title:string;description:string;monthlyAmountCents:number;dueDay:number;pixKey:string|null;paymentInstructions:string}`.
- RPC `set_fundraiser_payment(p_fundraiser_id uuid,p_cycle_due_date date,p_participant_id uuid,p_paid boolean)` derives actor from `auth.uid()`, checks self vs ADM/MOD, updates cycle state, appends one audit row in the same transaction.

- [x] **Step 1: Write failing cycle tests** for day 1, due day boundary, day 31 in February, leap-year February, year rollover, Sao Paulo date, and invalid day.
- [x] **Step 2: Run `npm test -- tests/fundraiser-cycle.test.ts`** and verify failure.
- [x] **Step 3: Implement `getUpcomingDueDate`** using `Intl.DateTimeFormat`/timezone-safe date parts; avoid UTC day rollover errors.
- [x] **Step 4: Write failing validation tests** for fixed amount in positive integer cents, required due day, bounded title/description/Pix fields, and invalid/negative values.
- [x] **Step 5: Implement `normalizeFundraiser`**; run both focused test suites and verify pass.
- [x] **Step 6: Write migration** for `fundraisers`, `fundraiser_participants`, `fundraiser_contributions` keyed by `(fundraiser_id,user_id,cycle_due_date)`, and append-only `fundraiser_payment_audit`; add checks/FKs/indexes/RLS/grants and one RPC.
- [x] **Step 7: Add failing migration contract tests** for auth-only reads, self or ADM/MOD payment mutation, admin-only campaign write, immutable audit, and no aggregate amount response.
- [ ] **Step 8: Verify migration tests and apply in staging**. Check that due-day change applies only to future cycles, not old history; commit as `feat: add recurring fundraiser schema and cycle audit`.

### Task 3: Campaign and participant APIs

**Files:**
- Create: `app/api/fundraisers/route.ts`
- Create: `app/api/fundraisers/[id]/route.ts`
- Create: `app/api/fundraisers/[id]/participants/route.ts`
- Create: `app/api/fundraisers/[id]/contributions/[userId]/route.ts`
- Create: `tests/fundraisers-api.test.ts`

**Interfaces:**
- `GET /api/fundraisers` returns open campaigns with `monthlyAmountCents`, `dueDay`, `pixKey`, current-cycle paid/pending roster, and caller state; never returns aggregate paid amount.
- `POST /api/fundraisers` creates as ADM/MOD.
- `PATCH /api/fundraisers/[id]` modifies campaign as ADM/MOD.
- Participants route allows self-join/self-leave and ADM/MOD to add/remove any DTEC member. Removal ends future participation only; prior cycles/audit remain.
- Contribution route invokes `set_fundraiser_payment` for the current cycle.

- [ ] **Step 1: Write failing API tests** for anon `401`, member campaign mutation `403`, ADM/MOD CRUD, self join/leave, admin enrollment/removal, self mark paid/pending, cross-member denial, and moderator mark any participant.
- [ ] **Step 2: Run `npm test -- tests/fundraisers-api.test.ts`** and verify failure.
- [ ] **Step 3: Implement route handlers** with session-derived identities and input normalization; use `Cache-Control: no-store` and omit secrets from logs/errors.
- [ ] **Step 4: Run focused API tests and TypeScript**; expected pass.
- [ ] **Step 5: Commit** as `feat: add fundraiser and payment-cycle APIs`.

### Task 4: Vaquinha folder and paid/pending lists

**Files:**
- Create: `components/mural/fundraisers-folder.tsx`
- Modify: `components/mural-window.tsx`
- Modify: `app/globals.css`
- Create: `tests/fundraisers-folder.test.ts` (pure roster/view-model contract)

**Interfaces:**
- `FundraisersFolder({currentUserId,isAdminOrMod})` renders campaigns, detail, fixed per-person amount, due date, Pix/instructions, join/leave control and paid/pending lists.
- `ContributionRoster` displays avatar/full name; paid first with timestamp, pending below with subdued opacity; self and ADM/MOD controls follow role.

- [ ] **Step 1: Write failing view-model tests** for no-auth prompt state, fixed amount/due date/Pix display, no total amount, paid/pending sections, own mark toggle, ADM/MOD override controls, closed/empty state; avoid assuming React DOM testing dependencies not present in the project.
- [ ] **Step 2: Run focused UI tests** and verify failure.
- [ ] **Step 3: Implement the folder and detail components** as lightweight scrollable retro-window content; replace static Vaquinhas placeholder only.
- [ ] **Step 4: Add styles** for subdued pending list and mobile internal scrolling/touch controls.
- [ ] **Step 5: Run `npm test`, lint, TypeScript, and build**; manually verify phone-width view and Pix-key copy affordance without logging the key.
- [ ] **Step 6: Commit** as `feat: add monthly fundraiser roster UI`.
