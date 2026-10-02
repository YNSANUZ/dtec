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

- [ ] **Step 1: Reproduce on deployed/local build** by moving the avatar, opening chat, sending a message, closing chat, and waiting for a presence refresh; record which trigger resets the position.
- [ ] **Step 2: Add a failing regression test** for that exact trigger using an extracted pure state transition helper; assert current coordinates/target remain unchanged.
- [ ] **Step 3: Run `npm test -- tests/room-position-state.test.ts`** and confirm it fails for the reproduced case.
- [ ] **Step 4: Inspect component keys/effect dependencies, `initialPosition` synchronization, animation ownership, and presence polling**; identify the single authoritative position and document the cause in a short code comment/test name.
- [ ] **Step 5: Commit the regression test/cause note** as `test: reproduce room avatar position reset` before the fix.

### Task 2: Fix the authoritative position flow

**Files:**
- Create/Modify: `lib/room/position-state.ts`
- Modify: `app/page.tsx`
- Modify: `components/office-scene.tsx`
- Test: `tests/room-position-state.test.ts`

**Interfaces:**
- `mergeRoomPosition(current: RoomPosition, incoming: RoomPosition, source: "local"|"server"): RoomPosition` must never replace a newer local target/action with an older poll response.
- Scene prop contract remains stable across chat state renders; if an initial position is needed, it is applied only once per authenticated user identity, except explicit profile reset.

- [ ] **Step 1: Implement the minimal position fix** based on the recorded failing test; do not add speculative smoothing or arbitrary spawn offsets.
- [ ] **Step 2: Run the regression test** and verify PASS, including walk→chat open/close→walk and new message send.
- [ ] **Step 3: Add a second test** for reconnect/profile switch so saved position initializes only for the correct account and old-user state cannot bleed.
- [ ] **Step 4: Run tests/lint/TypeScript/build** and verify two authenticated clients observe the same movement with no snapback.
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

- [ ] **Step 1: Write failing viewport tests** for keyboard open/closed, nonzero offset, invalid metrics, and layout-height fallback.
- [ ] **Step 2: Run `npm test -- tests/visual-viewport.test.ts`** and verify failure.
- [ ] **Step 3: Implement the pure metrics helper** and its tests.
- [ ] **Step 4: Replace the oversized chat form** with a small translucent composer using `env(safe-area-inset-bottom)` and viewport CSS variables; keep canvas fixed at the layout viewport.
- [ ] **Step 5: Add pure layout-contract tests** for compact composer dimensions/viewport variables; manually verify no full white overlay or keyboard-induced focus pan on touch devices (React DOM test renderer is not installed).
- [ ] **Step 6: Run full test/lint/TypeScript/build**; verify desktop, narrow mobile, tall keyboard, and rotation through mobile emulation/browser.
- [ ] **Step 7: Commit** as `fix: keep room chat compact above mobile keyboard`.
