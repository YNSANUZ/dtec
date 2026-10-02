# DTEC Birthday Character Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Celebrate a member's birthday above their avatar with a temporary animated party balloon and brief dance, including for anonymous visitors without exposing the full birthday date.

**Architecture:** A restricted SQL function returns only IDs whose birthday is today in `America/Sao_Paulo`; the public character API reduces that to `birthdayToday:boolean`. Each browser session shows the first celebration immediately, then runs a local 5-second/120-second cadence, keeping the precise date private.

**Tech Stack:** Next.js route handler, TypeScript, Supabase/Postgres security-definer RPC, Three.js sprites/speech bubble, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-eventos-e-vaquinhas-design.md`

## Global Constraints

- Only a boolean celebration flag may be public; never expose birthday month/day to anon.
- Birthday day is evaluated in `America/Sao_Paulo`.
- First appearance is immediate for each room session; show 5 seconds, wait 120 seconds, repeat while `birthdayToday` remains true.
- Balloon is white and circular with party hat/confetti, pop-in animation, above avatar/name; no age/date text.
- Brief dance yields to new manual movement and returns to the previous action.

## Review Focus

- Birthday at Sao Paulo midnight and leap-day profiles: correct local-day result.
- Anonymous API: no exact birthday field, only boolean per character.
- Session begins mid-day: first appearance immediate, then 5s-on/120s cadence.
- Birthday flag becomes false after midnight: balloon timer stops and clears.
- Manual movement during celebratory dance: manual state wins and is not overwritten on timer expiry.

---

### Task 1: Restricted birthday-today resolver and public character contract

**Files:**
- Create: `supabase/migrations/202610030004_public_birthday_signal.sql`
- Modify: `app/api/room/characters/route.ts`
- Create: `tests/birthday-celebration-date.test.ts`
- Create: `tests/public-birthday-contract.test.ts`

**Interfaces:**
- SQL RPC `public.birthday_today_user_ids()` returns only `user_id uuid` for profiles whose month/day matches current Sao Paulo date; executable by anon/auth, no direct anon column grant.
- Public character response adds `birthdayToday: boolean`; it does not include `birth_day_month`.
- Pure `isBirthdayToday(monthDay: string|null,now: Date): boolean` uses `America/Sao_Paulo`.

- [x] **Step 1: Write date tests** for normal dates, Feb 29, before/after Sao Paulo midnight, null/invalid birthday.
- [x] **Step 2: Run `npm test -- tests/birthday-celebration-date.test.ts`** and confirm failure before implementation.
- [x] **Step 3: Implement `isBirthdayToday`** with explicit timezone parts.
- [x] **Step 4: Write public-contract tests** asserting anonymous response contains only `birthdayToday` and no month/day field.
- [x] **Step 5: Add security-definer RPC and update characters handler** to convert returned IDs into booleans; constrain search path and grant only execute.
- [ ] **Step 6: Focused tests and migration contract pass locally. Apply in staging and query anonymously to verify no dates leak once staging is confirmed.**

### Task 2: Session cadence and avatar badge/dance

**Files:**
- Create: `lib/birthdays/celebration.ts`
- Create: `tests/birthday-celebration.test.ts`
- Modify: `components/office-scene.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `getCelebrationState(birthdayToday:boolean,sessionStartedAt:number,now:number): {visible:boolean; dancing:boolean}` uses 120,000 ms cycle and 5,000 ms visible window; initial cycle starts at session time.
- Scene `remoteUsers` adds `birthdayToday:boolean`; local/remote avatar label groups render the same badge state.

- [x] **Step 1: Write cadence tests** for immediate start, visible until 5,000 ms, hidden until 120,000 ms, repeat, and flag false cleanup.
- [x] **Step 2: Run the focused test** and confirm failure before implementation.
- [x] **Step 3: Implement the pure cadence helper** and use a persistent room-session timestamp.
- [x] **Step 4: Add a white circular party balloon** with confetti and pop animation above the name; add a three-second dance cue that yields to manual movement/action.
- [ ] **Step 5: Scene automation for local/remote, signal removal, and manual-action precedence remains to be added;** helper contract tests pass.
- [ ] **Step 6: Full automated suite, lint, TypeScript, and build pass.** Inspect at desktop/mobile scale and compare with supplied reference once staging is available.
- [ ] **Step 7: Commit** as `feat: add temporary birthday celebration above avatars`.
