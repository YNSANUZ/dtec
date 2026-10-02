# DTEC Room Motion Stability and Mobile Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop room avatars from teleporting/resetting during ordinary interaction and make the chat composer compact and usable above the mobile keyboard.

**Architecture:** First reproduce and trace the reset through `Home` presence state and the mounted Three.js `OfficeScene`; add a failing regression case before changing the actual owner of position. Separately keep the canvas fixed to the layout viewport and position the small composer from `VisualViewport` metrics while the mobile keyboard is open.

**Tech Stack:** Next.js client components, React state/refs, Three.js, VisualViewport API, CSS `dvh`/safe-area, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-eventos-e-vaquinhas-design.md`

## Global Constraints

- Preserve the current scene and avatar world coordinates when opening/closing/sending chat, editing profile, or receiving presence refreshes.
- Movement remains visible to authenticated room members through existing presence updates.
- Do not guess at the teleport cause; reproduce and verify a regression test for the observed reset before implementing a fix.
- Composer must be compact/translucent, not a large white panel, and must not make the 3D scene move or disappear when the virtual keyboard opens.
- Avoid new dependencies; retain desktop keyboard behavior and mobile touch controls.

## Review Focus

- Presence response arrives during local movement: stale server coordinates must not overwrite a newer local target.
- Chat open/close or send while avatar is walking/sitting: position and action survive unless intentionally changed.
- React rerender from five-message history or modal: `OfficeScene` is not unmounted/recreated.
- Mobile VisualViewport differs from `window.innerHeight`: composer remains above keyboard without resizing world canvas.
- Keyboard absent, orientation change, safe-area inset, or browser without VisualViewport: graceful layout fallback.

---

### Task 1: Reproduce and pin the teleport/reset regression

**Files:**
- Inspect: `app/page.tsx`
- Inspect: `components/office-scene.tsx`
- Create: `tests/room-position-state.test.ts`

**Interfaces:**
- `Home` owns saved initial position (`sceneStart`) and latest movement state (`presence.current`); `OfficeScene` owns live animation position and reports it via `onStateChange(x,z,action)`.
- The regression test should exercise stable position when parent chat state changes and when stale persisted presence is received.

- [ ] **Step 1: Reproduce on deployed/local build** by moving the avatar, opening chat, sending a message, closing chat, and waiting for a presence refresh; live reproduction still needs an authenticated staging environment.
- [x] **Step 2: Add a regression contract** for callback identity changes rebuilding the scene, plus pure tests for stable live position/target state.
- [x] **Step 3: Run focused regressions**; the lifecycle contract failed before the callback-ref fix and now passes.
- [x] **Step 4: Inspect component effect dependencies and polling**. Root cause: each 5-second character refresh replaces `onlineUsers`; `characterClick` changed identity, and because that callback was an `OfficeScene` effect dependency, React disposed/recreated Three.js at the saved initial position.
- [x] **Step 5: Record the root cause beside the callback refs**; implementation and regression test are committed with the room fix below.

### Task 2: Fix the authoritative position flow

**Files:**
- Create/Modify: `lib/room/position-state.ts`
- Modify: `app/page.tsx`
- Modify: `components/office-scene.tsx`
- Test: `tests/room-position-state.test.ts`

**Interfaces:**
- `mergeRoomPosition(current: RoomPosition, incoming: RoomPosition, source: "local"|"server"): RoomPosition` must never replace a newer local target/action with an older poll response.
- Scene prop contract remains stable across chat state renders; if an initial position is needed, it is applied only once per authenticated user identity, except explicit profile reset.

- [x] **Step 1: Implement the minimal fix**: keep callbacks in refs so parent polling cannot remount the scene; snapshot live position, target, sitting/automatic state across necessary scene reloads.
- [x] **Step 2: Run automated state/lifecycle regressions**; helper verifies current coordinates/target survive same-account reloads. Live chat movement test still awaits staging.
- [x] **Step 3: Test account switching**; a new owner ID initializes from its own spawn, never the prior account's saved state.
- [ ] **Step 4: Full tests/lint/TypeScript/build pass (127 tests).** Verify two authenticated clients observe synchronized movement once staging is confirmed.
- [ ] **Step 5: Commit** as `fix: preserve avatar position across room interactions`.

### Task 3: Compact composer and mobile keyboard viewport

**Files:**
- Create: `lib/ui/visual-viewport.ts`
- Create: `tests/visual-viewport.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `getVisualViewportInsets(viewportHeight:number,layoutHeight:number,offsetTop:number): {bottomInset:number;visibleHeight:number}` clamps invalid/negative measurements to safe values.
- `chatOpen` renders a compact translucent fixed composer; mobile does not auto-focus an input until a user taps it; VisualViewport resize/scroll listeners update CSS custom properties and are removed on cleanup.

- [x] **Step 1: Write failing viewport tests** for keyboard open/closed, nonzero offset, invalid metrics, and layout-height fallback.
- [x] **Step 2: Run the focused viewport test**; it failed before the helper existed.
- [x] **Step 3: Implement the pure `getKeyboardInset` helper** and tests.
- [x] **Step 4: Make the composer compact/translucent, remove automatic focus, and reposition above the virtual keyboard using cleaned-up VisualViewport listeners and safe-area inset; the canvas remains fixed.**
- [ ] **Step 5: Mobile visual check** for no full white overlay or keyboard-induced scene shift remains pending a device/browser session.
- [x] **Step 6: Full tests/lint/TypeScript/build pass (127 tests).** Desktop/mobile visual emulation remains pending.
- [ ] **Step 7: Commit** with the local scene/chat fix commit.
