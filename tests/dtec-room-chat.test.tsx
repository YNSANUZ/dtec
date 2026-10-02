// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DtecRoom from "@/app/dtec/page";

const fixtures = vi.hoisted(() => ({ phase: "ready", account: { id: "member" }, mounted: vi.fn(), props: null as null | { initialPosition: { x: number; z: number } } }));
vi.mock("next/dynamic", () => ({ default: () => function Scene(props: NonNullable<typeof fixtures.props>) { fixtures.props = props; React.useEffect(() => { fixtures.mounted(); }, []); return <div aria-label="Cenário" />; } }));
vi.mock("@/components/avatar-preview", () => ({ default: () => <div /> }));
vi.mock("@/components/mural-window", () => ({ default: () => <div /> }));
vi.mock("@/hooks/use-dtec-auth", () => ({ useDtecAuth: () => ({ state: fixtures.phase, user: fixtures.phase === "anonymous" ? null : fixtures.account, profile: fixtures.phase === "anonymous" ? null : { displayName: "Ana Silva", avatarId: "a" } }) }));
class Viewport extends EventTarget { height = 844; offsetTop = 0; scale = 1; }
let viewport: Viewport;
const transport = vi.fn();
beforeEach(() => {
  fixtures.phase = "ready"; fixtures.props = null; fixtures.mounted.mockClear(); viewport = new Viewport();
  vi.stubGlobal("React", React); vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 844); vi.stubGlobal("visualViewport", viewport);
  transport.mockReset(); transport.mockImplementation((url: string, init?: RequestInit) => Promise.resolve(url.endsWith("/chat") && init?.method === "POST"
    ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ messages: [], users: [{ userId: "member", name: "Ana Silva", avatar: "a", x: 8, z: -2, online: true }] }))));
  vi.stubGlobal("fetch", transport);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function openChat() {
  render(<DtecRoom />); await waitFor(() => expect(fixtures.props?.initialPosition).toEqual({ x: 8, z: -2 }));
  fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  const input = screen.getByPlaceholderText("Digite uma mensagem…"); fireEvent.focus(input); return input as HTMLInputElement;
}
function keyboard(layout = 844) {
  viewport.height = 500; vi.stubGlobal("innerHeight", layout);
  act(() => { window.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("resize")); });
}
it("freezes DTEC canvas height while only its visual viewport shrinks", async () => {
  await openChat(); keyboard();
  expect(screen.getByRole("main").style.getPropertyValue("--room-layout-height")).toBe("844px");
  expect(screen.getByRole("main").style.getPropertyValue("--room-chat-bottom")).toBe("356px");
  expect(fixtures.mounted).toHaveBeenCalledOnce(); expect(fixtures.props?.initialPosition).toEqual({ x: 8, z: -2 });
});
it("does not double-lift with a layout-resizing keyboard and releases height after close", async () => {
  const input = await openChat(); fireEvent.change(input, { target: { value: "Rascunho" } }); keyboard(500);
  const main = screen.getByRole("main");
  expect(main.style.getPropertyValue("--room-layout-height")).toBe("844px"); expect(main.style.getPropertyValue("--room-chat-bottom")).toBe("12px");
  fireEvent.click(screen.getByRole("button", { name: "Fechar conversa" }));
  viewport.height = 844; vi.stubGlobal("innerHeight", 844); act(() => viewport.dispatchEvent(new Event("resize")));
  expect(main.style.getPropertyValue("--room-layout-height")).toBe("100%");
  fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  expect((screen.getByRole("textbox", { name: "Mensagem" }) as HTMLInputElement).value).toBe("Rascunho");
  expect(fixtures.mounted).toHaveBeenCalledOnce();
});
it("retains a failed send draft and gives the keyboard a send hint", async () => {
  const input = await openChat(); expect(input.maxLength).toBe(100); expect(input.getAttribute("enterKeyHint")).toBe("send");
  fireEvent.change(input, { target: { value: " Mensagem de teste " } }); fireEvent.submit(input.closest("form")!);
  expect(await screen.findByRole("alert")).toBeTruthy(); expect(input.value).toBe(" Mensagem de teste ");
  expect(transport).toHaveBeenCalledWith("/api/rooms/dtec/chat", expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Mensagem de teste" }) }));
  expect(fixtures.mounted).toHaveBeenCalledOnce();
});
it("releases the focused height when auth removes the chat input", async () => {
  const view = render(<DtecRoom />); fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  fireEvent.focus(screen.getByPlaceholderText("Digite uma mensagem…")); fixtures.phase = "anonymous"; view.rerender(<DtecRoom />);
  expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
  expect(screen.getByRole("main").style.getPropertyValue("--room-layout-height")).toBe("100%");
  expect(screen.queryByRole("button", { name: "Conversar" })).toBeNull();
});

it("sends through the existing DTEC endpoint and clears the draft without remounting", async () => {
  transport.mockImplementation((url: string, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(url.endsWith("/chat") && init?.method === "POST"
    ? { message: { id: "new", authorId: "member", name: "Ana Silva", text: "Olá", createdAt: new Date().toISOString() } }
    : { users: [{ userId: "member", x: 8, z: -2 }], messages: [] }))));
  const input = await openChat(); fireEvent.change(input, { target: { value: "Olá" } }); fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(input.value).toBe(""));
  expect(transport).toHaveBeenCalledWith("/api/rooms/dtec/chat", expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Olá" }) }));
  expect(fixtures.mounted).toHaveBeenCalledOnce(); expect(fixtures.props?.initialPosition).toEqual({ x: 8, z: -2 });
});
it("closes with Escape without losing the draft or keeping height locked", async () => {
  const input = await openChat(); fireEvent.change(input, { target: { value: "Não enviar" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "Mensagem" })).toBeNull();
  expect(screen.getByRole("main").style.getPropertyValue("--room-layout-height")).toBe("100%");
  fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  expect((screen.getByRole("textbox", { name: "Mensagem" }) as HTMLInputElement).value).toBe("Não enviar");
  expect(fixtures.mounted).toHaveBeenCalledOnce();
});
