// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenericRoom from "@/components/generic-room";
import DtecRoom from "@/app/dtec/page";

const state = vi.hoisted(() => ({ mounts: vi.fn(), phase: "anonymous", account: { id: "member" }, profile: { displayName: "Ana Silva", avatarId: "a" } }));
// These transport/pose regressions exercise an already-admitted member.
// Actual admission scopes are exercised in room-membership-hook and entry tests.
vi.mock("@/hooks/use-room-membership",()=>({useRoomMembership:(_slug:string,userId:string|null)=>({active:Boolean(userId),role:userId?"member":"visitor",status:userId?"active":"visitor",loading:false,busy:false,error:"",entryMode:"public",refresh:()=>{},join:async()=>true,leave:async()=>true})}));
vi.mock("@/hooks/use-room-identity",()=>({useRoomIdentity:(_slug:string,initial:unknown)=>({identity:initial,refresh:()=>{}})}));
vi.mock("next/dynamic", () => ({ default: () => function Scene() { React.useEffect(() => { state.mounts(); }, []); return <div />; } }));
vi.mock("@/hooks/use-dtec-auth", () => ({ useDtecAuth: () => ({ state: state.phase, user: state.phase === "ready" ? state.account : null, profile: state.phase === "ready" ? state.profile : null }) }));
vi.mock("@/components/profile/account-controls", () => ({ AccountControls: () => <div /> }));
vi.mock("@/components/rooms/room-people", () => ({ RoomPeople: () => <div /> }));
vi.mock("@/components/avatar-preview", () => ({ default: () => <div /> }));
vi.mock("@/components/mural-window", () => ({ default: () => <div /> }));
const transport = vi.fn();
const targets = [{ label: "generic", url: "/api/rooms/amigos/chat" }, { label: "DTEC", url: "/api/rooms/dtec/chat" }];
const viewFor = (label: string, slug = "amigos") => label === "DTEC" ? <DtecRoom /> : <GenericRoom room={{ slug, title: slug, description: "" }} />;
const body = (text = "Mensagem atual") => ({ users: [], messages: [{ id: text, authorId: "member", name: "Ana Silva", text, createdAt: new Date().toISOString() }] });
const response = (text?: string) => Response.json(body(text));
type Pending = { resolve: (value: Response) => void; signal?: AbortSignal | null };
beforeEach(() => { vi.useFakeTimers(); state.phase = "anonymous"; state.mounts.mockClear(); transport.mockReset(); vi.stubGlobal("React", React); vi.stubGlobal("fetch", transport); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(targets)("$label serializes slow chat fetches without remounting the scene", async ({ label, url }) => {
  const requests: Pending[] = [];
  transport.mockImplementation((path: string, init?: RequestInit) => path === url ? new Promise<Response>((resolve) => requests.push({ resolve, signal: init?.signal })) : Promise.resolve(response()));
  await act(async () => { render(viewFor(label)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(requests).toHaveLength(1);
  await act(async () => { requests[0].resolve(response()); });
  expect(screen.getByText("Mensagem atual")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(requests).toHaveLength(2);
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label holds the read lock until chat JSON is parsed", async ({ label, url }) => {
  let finish!: (value: unknown) => void;
  let reads = 0;
  transport.mockImplementation((path: string) => {
    if (path === url) { reads++; return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) } as unknown as Response); }
    return Promise.resolve(response());
  });
  await act(async () => { render(viewFor(label)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(reads).toBe(1);
  await act(async () => { finish(body()); });
  expect(screen.getByText("Mensagem atual")).toBeTruthy();
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label aborts chat on unmount and ignores a late response", async ({ label, url }) => {
  const requests: Pending[] = [];
  transport.mockImplementation((path: string, init?: RequestInit) => path === url ? new Promise<Response>((resolve) => requests.push({ resolve, signal: init?.signal })) : Promise.resolve(response()));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(viewFor(label)); });
  view.unmount();
  expect(requests[0].signal?.aborted).toBe(true);
  await act(async () => { requests[0].resolve(response("Mensagem antiga")); await vi.advanceTimersByTimeAsync(4000); });
  expect(screen.queryByText("Mensagem antiga")).toBeNull();
  expect(requests).toHaveLength(1);
});

it.each(targets)("$label retries after failed chat reads", async ({ label, url }) => {
  let reads = 0;
  transport.mockImplementation((path: string) => path === url ? ++reads === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(response()) : Promise.resolve(response()));
  await act(async () => { render(viewFor(label)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(reads).toBe(2);
  expect(screen.getByText("Mensagem atual")).toBeTruthy();
  expect(state.mounts).toHaveBeenCalledOnce();
});

it("generic aborts the previous room read and rejects its obsolete result", async () => {
  const requests: Pending[] = [];
  transport.mockImplementation((path: string, init?: RequestInit) => path.endsWith("/chat") ? new Promise<Response>((resolve) => requests.push({ resolve, signal: init?.signal })) : Promise.resolve(response()));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(viewFor("generic")); });
  await act(async () => { view.rerender(viewFor("generic", "colegas")); });
  expect(requests[0].signal?.aborted).toBe(true);
  await act(async () => { requests[1].resolve(response()); requests[0].resolve(response("Mensagem antiga")); });
  expect(screen.queryByText("Mensagem antiga")).toBeNull();
  expect(screen.getByText("Mensagem atual")).toBeTruthy();
  expect(state.mounts).toHaveBeenCalledOnce();
});

async function submitMessage(label: string) {
  if (label === "DTEC") fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  const input = screen.getByRole("textbox", { name: "Mensagem" });
  await act(async () => { fireEvent.change(input, { target: { value: "Mensagem enviada" } }); fireEvent.submit(input.closest("form")!); });
  return input as HTMLInputElement;
}

it.each(targets)("$label preserves an acknowledged send when an older GET finishes afterwards", async ({ label, url }) => {
  state.phase = "ready";
  const requests: Pending[] = [];
  transport.mockImplementation((path: string, init?: RequestInit) => {
    if (path !== url) return Promise.resolve(response());
    if (init?.method === "POST") return Promise.resolve(Response.json({ message: body("Mensagem enviada").messages[0] }));
    return new Promise<Response>((resolve) => requests.push({ resolve }));
  });
  await act(async () => { render(viewFor(label)); });
  const input = await submitMessage(label);
  expect(input.value).toBe("");
  await act(async () => { requests[0].resolve(Response.json({ messages: [] })); });
  expect(screen.getByText("Mensagem enviada")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); requests[1].resolve(response("Nova mensagem remota")); });
  expect(screen.getByText("Nova mensagem remota")).toBeTruthy();
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label rejects old JSON that completes after a send was acknowledged", async ({ label, url }) => {
  state.phase = "ready";
  let finish!: (value: unknown) => void;
  transport.mockImplementation((path: string, init?: RequestInit) => {
    if (path !== url) return Promise.resolve(response());
    if (init?.method === "POST") return Promise.resolve(Response.json({ message: body("Mensagem enviada").messages[0] }));
    return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) } as unknown as Response);
  });
  await act(async () => { render(viewFor(label)); });
  await submitMessage(label);
  await act(async () => { finish({ messages: [] }); });
  expect(screen.getByText("Mensagem enviada")).toBeTruthy();
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label does not duplicate a message read before its POST acknowledgement", async ({ label, url }) => {
  state.phase = "ready";
  let acknowledge!: (value: Response) => void;
  transport.mockImplementation((path: string, init?: RequestInit) => {
    if (path !== url) return Promise.resolve(response());
    if (init?.method === "POST") return new Promise<Response>((resolve) => { acknowledge = resolve; });
    return Promise.resolve(response("Mensagem enviada"));
  });
  await act(async () => { render(viewFor(label)); });
  await submitMessage(label);
  await act(async () => { acknowledge(Response.json({ message: body("Mensagem enviada").messages[0] })); });
  expect(screen.getAllByText("Mensagem enviada")).toHaveLength(1);
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label still applies its pending read when sending fails", async ({ label, url }) => {
  state.phase = "ready";
  let finish!: (value: Response) => void;
  transport.mockImplementation((path: string, init?: RequestInit) => {
    if (path !== url) return Promise.resolve(response());
    if (init?.method === "POST") return Promise.resolve(new Response("{}", { status: 500 }));
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  await act(async () => { render(viewFor(label)); });
  const input = await submitMessage(label);
  await act(async () => { finish(response("Nova mensagem remota")); });
  expect(screen.getByText("Nova mensagem remota")).toBeTruthy();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(input.value).toBe("Mensagem enviada");
  expect(state.mounts).toHaveBeenCalledOnce();
});
