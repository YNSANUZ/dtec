"use client";

import { useCallback, useEffect, useRef } from "react";
import { getKeyboardInset } from "@/lib/room/mobile-viewport";

export function useRoomChatViewport() {
  const rootRef = useRef<HTMLElement>(null);
  const focused = useRef(false);
  const baseline = useRef<{ width: number; height: number } | null>(null);
  const sync = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const viewport = window.visualViewport;
    const mobile = window.innerWidth <= 700;
    if (!mobile) baseline.current = null;
    else if (baseline.current && baseline.current.width !== window.innerWidth) {
      baseline.current = focused.current ? { width: window.innerWidth, height: window.innerHeight } : null;
    }
    const original = baseline.current;
    const unscaled = !viewport || viewport.scale === 1;
    const keyboardOpen = Boolean(original && unscaled && original.height - (viewport?.height ?? window.innerHeight) - Math.max(0, viewport?.offsetTop ?? 0) > 80);
    if (!focused.current && unscaled && !keyboardOpen) baseline.current = null;
    // Updating CSS synchronously in capture precedes the scene's resize listener.
    root.style.setProperty("--room-layout-height", baseline.current ? `${baseline.current.height}px` : "100%");
    const inset = keyboardOpen ? getKeyboardInset(window.innerHeight, viewport?.height ?? window.innerHeight, viewport?.offsetTop ?? 0) : 0;
    root.style.setProperty("--room-chat-bottom", `${Math.min(inset, Math.max(0, window.innerHeight - 100)) + 12}px`);
    root.style.setProperty("--room-chat-space", `${Math.max(100, (viewport?.height ?? window.innerHeight) - 24)}px`);
  }, []);
  const onFocus = useCallback(() => {
    focused.current = true;
    if (window.innerWidth <= 700 && !baseline.current) baseline.current = { width: window.innerWidth, height: window.innerHeight };
    sync();
  }, [sync]);
  const onBlur = useCallback(() => { focused.current = false; sync(); }, [sync]);
  useEffect(() => {
    const viewport = window.visualViewport;
    sync();
    window.addEventListener("resize", sync, true);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync, true);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
    };
  }, [sync]);
  return { rootRef, onFocus, onBlur };
}
