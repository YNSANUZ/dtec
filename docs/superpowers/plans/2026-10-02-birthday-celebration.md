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

- [ ] **Step 1: Write failing date tests** for normal dates, Feb 29, before/after Sao Paulo midnight, null/invalid birthday.
- [ ] **Step 2: Run `npm test -- tests/birthday-celebration-date.test.ts`** and confirm failure.
- [ ] **Step 3: Implement `isBirthdayToday`** with explicit timezone parts.
- [ ] **Step 4: Write failing public-contract tests** asserting anonymous response contains only `birthdayToday` and no month/day/name field.
- [ ] **Step 5: Add security-definer RPC and update characters handler** to convert returned IDs into booleans; constrain search path and grant only execute.
- [ ] **Step 6: Run focused tests and apply migration in staging**; query endpoint anonymously and verify no dates leak; commit `feat: expose privacy-limited birthday celebration signal`.

### Task 2: Session cadence and avatar badge/dance

**Files:**
- Create: `lib/birthdays/celebration.ts`
- Create: `tests/birthday-celebration.test.ts`
- Modify: `components/office-scene.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `getCelebrationState(birthdayToday:boolean,sessionStartedAt:number,now:number): {visible:boolean; dancing:boolean}` uses 120,000 ms cycle and 5,000 ms visible window; initial cycle starts at session time.
- Scene `remoteUsers` adds `birthdayToday:boolean`; local/remote avatar label groups render the same badge state.

- [ ] **Step 1: Write failing cadence tests** for immediate start, visible until 5,000 ms, hidden until 120,000 ms, repeat, and flag false cleanup.
- [ ] **Step 2: Run focused test** and confirm failure.
- [ ] **Step 3: Implement the pure cadence helper** and use one session start timestamp for the current browser's room view.
- [ ] **Step 4: Add a white circular speech balloon** with party hat/confetti and pop animation above the name; add a brief three-second dance cue that restores prior animation unless manual input has arrived.
- [ ] **Step 5: Write/perform scene tests** for one local and one remote birthday avatar, flag removal, and manual-action precedence.
- [ ] **Step 6: Run `npm test`, lint, TypeScript, and build**; inspect at desktop/mobile scale and compare with supplied reference.
- [ ] **Step 7: Commit** as `feat: add temporary birthday celebration above avatars`.
