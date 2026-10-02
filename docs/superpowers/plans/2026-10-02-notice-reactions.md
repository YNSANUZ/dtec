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

- [ ] **Step 1: Write failing tests** for none→like, none→dislike, like→null, dislike→null, and like↔dislike.
- [ ] **Step 2: Run `npm test -- tests/mural-reactions.test.ts`** and confirm failure.
- [ ] **Step 3: Implement the pure toggle function** with exhaustive reaction validation.
- [ ] **Step 4: Write migration-contract tests** for table FK cascade, `(message_id,user_id)` uniqueness, RLS, authenticated-only grants, and RPC actor derivation.
- [ ] **Step 5: Write migration/RPC**; authenticated list reads are allowed, writes are only through validated self mutation, anon receives no table or function access.
- [ ] **Step 6: Run both focused test files**; expected pass.
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

- [ ] **Step 1: Write failing API tests** for anonymous `401`, invalid reaction `400`, counts/my state, selected-list filtering, and no list leakage from messages GET.
- [ ] **Step 2: Run `npm test -- tests/mural-reactions-api.test.ts`** and verify failure.
- [ ] **Step 3: Implement route handlers** using the project's current route context/`getMuralUserContext`; validate dynamic `id` with `normalizeMuralMessageId` and set `Cache-Control: no-store`.
- [ ] **Step 4: Extend the message list response** with counts and caller reaction, using one bounded aggregate query for the existing 100-message limit.
- [ ] **Step 5: Run focused API tests and TypeScript**; expected pass with no anonymous identity disclosure.
- [ ] **Step 6: Commit** as `feat: expose authenticated mural reaction state`.

### Task 3: Reaction controls and one-list dialog

**Files:**
- Create: `components/mural/notice-reactions.tsx`
- Modify: `components/mural-window.tsx`
- Modify: `app/globals.css`
- Create: `tests/notice-reactions.test.ts` (pure view-model/formatting contract)

**Interfaces:**
- `NoticeReactions({messageId,likeCount,dislikeCount,myReaction,onChange})` renders two `aria-pressed` buttons and one compact names dialog.
- Dialog requests `type=like` or `type=dislike` and renders only the selected type; selecting the other filter replaces the list in place.

- [ ] **Step 1: Write failing view-model tests** for both counters, selected state, same-type toggle, switching type, correct people list, and one selected list at a time; do not assume a React DOM test renderer, which is not installed.
- [ ] **Step 2: Run the focused UI test** and verify failure.
- [ ] **Step 3: Implement `NoticeReactions`** with optimistic state guarded against duplicate in-flight requests and rollback on error.
- [ ] **Step 4: Integrate in `RecadosContent`** and refresh the message's count/my-state following successful toggles.
- [ ] **Step 5: Add minimal retro-window styles** with internal scrolling, keyboard access, and mobile touch targets.
- [ ] **Step 6: Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`**; manually verify dialog and reaction controls at desktop and mobile widths.
- [ ] **Step 7: Commit** as `feat: add like and dislike controls to notices`.
