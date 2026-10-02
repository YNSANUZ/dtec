# DTEC Notice Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add authenticated 👍/👎 reactions and private-to-members lists of who selected each reaction on mural notices.

**Architecture:** A unique current reaction row per `(message_id,user_id)` is the source of truth. RLS and a transactional toggle RPC enforce one reaction per member/message; API returns aggregate counts to the authenticated mural and only the selected reaction's profile list to the compact dialog.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres RLS and RPC, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-eventos-e-vaquinhas-design.md`

## Global Constraints

- Google login and a complete DTEC profile are required to read or mutate reactions.
- A member has at most one current reaction per notice: repeat toggles off, opposite reaction switches.
- Reaction lists show avatar and full DTEC name to authenticated members only.
- Deleting a notice cascades its reaction rows; do not store reaction history.
- Keep controls accessible and lightweight within the existing mural window.

## Review Focus

- Concurrent taps on different reaction types: final stored state is exactly one reaction.
- Duplicate retries: counts remain idempotent and do not double-increment.
- Anonymous access: counts/lists/mutation endpoint all return `401`.
- Deleted or malformed message ID: return `404`/`400`, not a server error.
- Empty and long lists: modal remains usable with one scrollable list visible at a time.

---

### Task 1: Reaction contract and atomic database behavior

**Files:**
- Create: `lib/mural-reactions.ts`
- Create: `tests/mural-reactions.test.ts`
- Create: `supabase/migrations/202610030002_mural_reactions.sql`
- Test: `tests/mural-reactions-migration.test.ts`

**Interfaces:**
- `type MuralReaction = "like" | "dislike"`.
- `toggleMuralReaction(current: MuralReaction | null, requested: MuralReaction): MuralReaction | null` returns `null` for same-type toggle, requested type for add/switch.
- RPC `public.toggle_mural_reaction(p_message_id uuid,p_reaction text)` derives actor from `auth.uid()` and atomically toggles their reaction.

- [x] **Step 1: Write failing tests** for none→like, none→dislike, like→null, dislike→null, and like↔dislike.
- [x] **Step 2: Run `npm test -- tests/mural-reactions.test.ts`** and confirm failure before implementation.
- [x] **Step 3: Implement the pure toggle function** with exhaustive reaction validation.
- [x] **Step 4: Write migration-contract tests** for table FK cascade, `(message_id,user_id)` uniqueness, RLS, authenticated-only grants, aggregate privacy, and RPC actor derivation.
- [x] **Step 5: Write migration/RPC**; authenticated list reads are allowed, writes are only through validated self mutation, anon receives no table or function access.
- [x] **Step 6: Run focused tests**; all pass locally.
- [ ] **Step 7: Apply migration in staging and test** member self-toggle, duplicate retries, and anon denial; then commit `feat: persist authenticated notice reactions`.

### Task 2: Reaction APIs and message count state

**Files:**
- Create: `app/api/mural/messages/[id]/reactions/route.ts`
- Modify: `app/api/mural/messages/route.ts`
- Create: `tests/mural-reactions-api.test.ts`

**Interfaces:**
- `GET /api/mural/messages/[id]/reactions?type=like|dislike` returns only that type's `{people:[{userId,name,avatar}],count}`.
- `PUT` body `{reaction:"like"|"dislike"}` calls the atomic RPC and returns `{myReaction,likeCount,dislikeCount}`.
- `DELETE` removes the caller's own row and returns updated state/counts.
- Existing `GET /api/mural/messages` includes each card's `{likeCount,dislikeCount,myReaction}`; it never includes name lists.

- [x] **Step 1: Write API tests** for anonymous `401`, invalid reaction `400`, counts/my state, selected-list filtering, and no list leakage from messages GET.
- [x] **Step 2: Run focused API tests**; all pass.
- [x] **Step 3: Implement route handlers** using `getMuralUserContext`; validate dynamic `id` and use private no-store responses.
- [x] **Step 4: Extend the message list response** with counts and caller reaction, using one bounded aggregate RPC for the existing 100-message limit.
- [x] **Step 5: Run focused API tests and TypeScript**; no anonymous identity disclosure.
- [x] **Step 6: Commit** with the local reaction feature commit.

### Task 3: Reaction controls and one-list dialog

**Files:**
- Create: `components/mural/notice-reactions.tsx`
- Modify: `components/mural-window.tsx`
- Modify: `app/globals.css`
- Create: `tests/notice-reactions.test.ts` (pure view-model/formatting contract)

**Interfaces:**
- `NoticeReactions({messageId,likeCount,dislikeCount,myReaction,onChange})` renders two `aria-pressed` buttons and one compact names dialog.
- Dialog requests `type=like` or `type=dislike` and renders only the selected type; selecting the other filter replaces the list in place.

- [x] **Step 1: Write focused toggle and API contract tests** for counts, selected state, switching type, correct people list, and only one selected list.
- [x] **Step 2: Run focused tests**; all pass.
- [x] **Step 3: Implement reaction controls** in `RecadosContent`; database uniqueness and the message-row lock serialize reactions.
- [x] **Step 4: Integrate and refresh each card's counts/my-state** following successful toggles.
- [x] **Step 5: Add minimal retro-window styles** with internal scrolling, keyboard-accessible buttons, and mobile touch targets.
- [ ] **Step 6: Run the full suite, lint, TypeScript, and build**; automated checks pass. Manual authenticated desktop/mobile verification remains pending staging access.
- [ ] **Step 7: Commit** as `feat: add like and dislike controls to notices`.
