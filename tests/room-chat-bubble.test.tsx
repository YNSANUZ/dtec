// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenericRoom from "@/components/generic-room";
import DtecRoom from "@/app/dtec/page";

type SceneProps = { message: string; action: string };
const state = vi.hoisted(() => ({ account: { id: "member" }, props: null as SceneProps | null, mounts: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => function Scene(props: SceneProps) { state.props = props; React.useEffect(() => { state.mounts(); }, []); return <div />; } }));
vi.mock("@/hooks/use-dtec-auth", () => ({ useDtecAuth: () => ({ state: "ready", user: state.account, profile: { displayName: "Ana Silva", avatarId: "a" } }) }));
vi.mock("@/components/profile/account-controls", () => ({ AccountControls: () => <div /> }));
vi.mock("@/components/rooms/room-people", () => ({ RoomPeople: () => <div /> }));
vi.mock("@/components/avatar-preview", () => ({ default: () => <div /> }));
vi.mock("@/components/mural-window", () => ({ default: () => <div /> }));
const transport = vi.fn();
const targets = ["generic", "DTEC"];
const viewFor = (label: string) => label === "DTEC" ? <DtecRoom /> : <GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />;
let sendId = 0;
beforeEach(() => {
  vi.useFakeTimers(); state.props = null; state.mounts.mockClear(); sendId = 0;
  transport.mockReset(); transport.mockImplementation((path: string, init?: RequestInit) => {
    if (path.endsWith("/chat") && init?.method === "POST") {
      const text = (JSON.parse(String(init.body)) as { text: string }).text;
      return Promise.resolve(Response.json({ message: { id: `sent-${++sendId}`, authorId: "member", name: "Ana Silva", text, createdAt: new Date().toISOString() } }));
    }
    return Promise.resolve(Response.json({ users: [{ userId: "member", name: "Ana Silva", avatar: "a", x: 8, z: -2, online: true }], messages: [] }));
  });
  vi.stubGlobal("React", React); vi.stubGlobal("fetch", transport);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function openRoom(label: string) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(viewFor(label)); });
  if (label === "DTEC") fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  return view;
}
async function send(text: string) {
  const input = screen.getByRole("textbox", { name: "Mensagem" });
  await act(async () => { fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!); });
}

it.each(targets)("%s keeps a newer bubble for five seconds after the latest acknowledgement", async (label) => {
  await openRoom(label); await send("Primeira");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await send("Segunda");
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(state.props?.message).toBe("Segunda");
  if (label === "DTEC") expect(state.props?.action).toBe("wave");
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(state.props?.message).toBe("Segunda");
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(state.props?.message).toBe("");
  if (label === "DTEC") expect(state.props?.action).toBe("idle");
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("%s restarts the bubble duration even when the text is identical", async (label) => {
  await openRoom(label); await send("Olá");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await send("Olá");
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(state.props?.message).toBe("Olá");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(state.props?.message).toBe("");
});

it.each(targets)("%s does not extend or replace the first bubble when the second send fails", async (label) => {
  await openRoom(label); await send("Primeira");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  transport.mockImplementation((path: string, init?: RequestInit) => Promise.resolve(path.endsWith("/chat") && init?.method === "POST" ? new Response("{}", { status: 500 }) : Response.json({ users: [], messages: [] })));
  await send("Não enviada");
  expect(state.props?.message).toBe("Primeira");
  expect(screen.getByRole("alert")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(state.props?.message).toBe("");
});

it.each(targets)("%s cancels the bubble timer when the page unmounts", async (label) => {
  const timeout = vi.spyOn(window, "setTimeout");
  const clearTimeout = vi.spyOn(window, "clearTimeout");
  const view = await openRoom(label); await send("Olá");
  const timerCall = timeout.mock.calls.findIndex((args) => args[1] === 5000);
  expect(timerCall).toBeGreaterThanOrEqual(0);
  const timerId = timeout.mock.results[timerCall].value;
  view.unmount();
  expect(clearTimeout).toHaveBeenCalledWith(timerId);
});

it("DTEC leaves manual dance active when the bubble expires", async () => {
  await openRoom("DTEC"); await send("Olá");
  fireEvent.click(screen.getByRole("button", { name: "Dançar" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(state.props?.message).toBe(""); expect(state.props?.action).toBe("dance");
});
