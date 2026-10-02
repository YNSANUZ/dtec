// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRoomChatViewport } from "@/hooks/use-room-chat-viewport";

class Viewport extends EventTarget { height = 844; offsetTop = 0; scale = 1; }
let viewport: Viewport;
function Fixture() {
  const { rootRef, onFocus, onBlur } = useRoomChatViewport();
  return <main ref={rootRef} data-testid="room"><input aria-label="Mensagem" onFocus={onFocus} onBlur={onBlur} /></main>;
}
const root = () => screen.getByTestId("room");
function resize(height: number, layoutHeight = 844, width = 390) {
  viewport.height = height; vi.stubGlobal("innerHeight", layoutHeight); vi.stubGlobal("innerWidth", width);
  act(() => { window.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("resize")); });
}
beforeEach(() => {
  viewport = new Viewport(); vi.stubGlobal("visualViewport", viewport); vi.stubGlobal("innerHeight", 844); vi.stubGlobal("innerWidth", 390);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps the pre-keyboard canvas height and lifts only the chat for a visual viewport keyboard", () => {
  render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem")); resize(500);
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("844px");
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("356px");
});
it("does not double-lift the chat when the browser also shrinks its layout", () => {
  render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem")); resize(500, 500);
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("844px");
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("12px");
});
it("retains the canvas while the blurred keyboard closes, then restores normal sizing", () => {
  render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem")); resize(500, 500);
  fireEvent.blur(screen.getByLabelText("Mensagem"));
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("844px");
  resize(844); expect(root().style.getPropertyValue("--room-layout-height")).toBe("100%");
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("12px");
});
it("ignores pinch zoom, browser chrome changes and unrelated unfocused viewport changes", () => {
  render(<Fixture />); resize(500);
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("100%");
  fireEvent.focus(screen.getByLabelText("Mensagem")); resize(810);
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("12px");
  viewport.scale = 2; resize(400);
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("12px");
});
it("updates orientation before ordinary resize listeners and cleans up listeners", () => {
  const removal = vi.spyOn(viewport, "removeEventListener");
  const view = render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem"));
  let heightAtResize = "";
  const observe = () => { heightAtResize = root().style.getPropertyValue("--room-layout-height"); };
  window.addEventListener("resize", observe); resize(390, 390, 690);
  expect(heightAtResize).toBe("390px");
  window.removeEventListener("resize", observe); view.unmount();
  expect(removal).toHaveBeenCalledWith("resize", expect.any(Function));
  expect(removal).toHaveBeenCalledWith("scroll", expect.any(Function));
});
it("does not freeze desktop or require VisualViewport support", () => {
  vi.stubGlobal("innerWidth", 1200); vi.stubGlobal("visualViewport", undefined);
  render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem"));
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("100%");
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("12px");
});

it("accounts for viewport panning and restores height on blur without a keyboard", () => {
  render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem"));
  viewport.offsetTop = 80; resize(600);
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("176px");
  viewport.offsetTop = 0; resize(844); fireEvent.blur(screen.getByLabelText("Mensagem"));
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("100%");
});

it("handles a layout-resizing keyboard without VisualViewport", () => {
  vi.stubGlobal("visualViewport", undefined); render(<Fixture />); fireEvent.focus(screen.getByLabelText("Mensagem")); resize(500, 500);
  expect(root().style.getPropertyValue("--room-layout-height")).toBe("844px");
  expect(root().style.getPropertyValue("--room-chat-bottom")).toBe("12px");
});
