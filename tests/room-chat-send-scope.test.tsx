// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenericRoom from "@/components/generic-room";
import DtecRoom from "@/app/dtec/page";

type SceneProps = { message: string; action: string };
const auth = vi.hoisted(() => ({ phase: "ready", user: { id: "ana" }, profile: { displayName: "Ana Silva", avatarId: "a" }, scene: null as SceneProps | null, mounts: vi.fn() }));
// These transport/pose regressions exercise an already-admitted member.
// Actual admission scopes are exercised in room-membership-hook and entry tests.
vi.mock("@/hooks/use-room-membership",()=>({useRoomMembership:(_slug:string,userId:string|null)=>({active:Boolean(userId),role:userId?"member":"visitor",status:userId?"active":"visitor",loading:false,busy:false,error:"",entryMode:"public",refresh:()=>{},join:async()=>true,leave:async()=>true})}));
vi.mock("@/hooks/use-room-identity",()=>({useRoomIdentity:(_slug:string,initial:unknown)=>({identity:initial,refresh:()=>{}})}));
vi.mock("next/dynamic", () => ({ default: () => function Scene(props: SceneProps) { auth.scene = props; React.useEffect(() => { auth.mounts(); }, []); return <div />; } }));
vi.mock("@/hooks/use-dtec-auth", () => ({ useDtecAuth: () => ({ state: auth.phase, user: auth.phase === "anonymous" ? null : auth.user, profile: auth.phase === "ready" ? auth.profile : null }) }));
vi.mock("@/components/profile/account-controls", () => ({ AccountControls: () => <div /> }));
vi.mock("@/components/rooms/room-people", () => ({ RoomPeople: () => <div /> }));
vi.mock("@/components/avatar-preview", () => ({ default: () => <div /> }));
vi.mock("@/components/mural-window", () => ({ default: () => <div /> }));

const labels = ["generic", "DTEC"];
const viewFor = (label: string, slug = "amigos") => label === "DTEC" ? <DtecRoom /> : <GenericRoom room={{ slug, title: slug, description: "" }} />;
const acknowledged = (text = "Envio anterior") => Response.json({ message: { id: text, authorId: "ana", name: "Ana Silva", text, createdAt: new Date().toISOString() } });
const writes: { path: string; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
beforeEach(() => {
  vi.useFakeTimers(); auth.phase = "ready"; auth.user = { id: "ana" }; auth.profile = { displayName: "Ana Silva", avatarId: "a" }; auth.scene = null; auth.mounts.mockClear(); writes.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path.endsWith("/chat") && init?.method === "POST") return new Promise<Response>((resolve, reject) => writes.push({ path, resolve, reject }));
    return Promise.resolve(Response.json({ messages: [], users: [{ userId: auth.user.id, name: "Ana Silva", avatar: "a", x: 8, z: -2, action: "idle", online: true, birthdayToday: false }] }));
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function open(label: string) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(viewFor(label)); });
  if (label === "DTEC") fireEvent.click(screen.getByRole("button", { name: "Conversar" }));
  return view;
}
async function send(text = "Envio anterior") {
  const input = screen.getByRole("textbox", { name: "Mensagem" });
  await act(async () => { fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!); });
}
async function rerender(view: ReturnType<typeof render>, label: string, slug = "amigos") {
  await act(async () => { view.rerender(viewFor(label, slug)); });
}
function draft(text = "Rascunho atual") {
  const input = screen.getByRole("textbox", { name: "Mensagem" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  return input;
}

it.each(labels)("%s ignores an old account acknowledgement without clearing the current draft", async (label) => {
  const view = await open(label); await send();
  auth.user = { id: "bia" }; await rerender(view, label);
  const input = draft();
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(screen.queryByText("Envio anterior")).toBeNull(); expect(input.value).toBe("Rascunho atual");
  expect(auth.scene?.message).toBe(""); expect(auth.scene?.action).not.toBe("wave");
  expect(auth.mounts).toHaveBeenCalledOnce();
});

it.each(labels)("%s ignores obsolete acknowledgement JSON that finishes in a new account", async (label) => {
  const view = await open(label); await send();
  let finish!: (value: unknown) => void;
  await act(async () => { writes[0].resolve({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) } as unknown as Response); });
  auth.user = { id: "bia" }; await rerender(view, label); const input = draft();
  await act(async () => { finish({ message: { id: "old", authorId: "ana", name: "Ana Silva", text: "Envio anterior", createdAt: new Date().toISOString() } }); });
  expect(screen.queryByText("Envio anterior")).toBeNull(); expect(input.value).toBe("Rascunho atual"); expect(auth.scene?.message).toBe("");
});

it.each(labels)("%s rejects an acknowledgement received after logout", async (label) => {
  const view = await open(label); await send();
  auth.phase = "anonymous"; await rerender(view, label);
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(screen.queryByText("Envio anterior")).toBeNull(); expect(auth.scene?.message).toBe(""); expect(auth.scene?.action).not.toBe("wave");
});

it.each(labels)("%s does not revalidate an old send after leaving and returning to the same account", async (label) => {
  const view = await open(label); await send();
  auth.user = { id: "bia" }; await rerender(view, label);
  auth.user = { id: "ana" }; await rerender(view, label); const input = draft();
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(input.value).toBe("Rascunho atual"); expect(screen.queryByText("Envio anterior")).toBeNull(); expect(auth.scene?.message).toBe("");
});

it.each(labels)("%s invalidates a send when auth phase changes without changing user ID", async (label) => {
  const view = await open(label); await send();
  auth.phase = "authenticated-needs-profile"; await rerender(view, label);
  auth.phase = "ready"; await rerender(view, label); const input = draft();
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(input.value).toBe("Rascunho atual"); expect(screen.queryByText("Envio anterior")).toBeNull(); expect(auth.scene?.message).toBe("");
});

it.each(labels)("%s releases the new account composer without allowing old failure/finally to change its send", async (label) => {
  const view = await open(label); await send();
  auth.user = { id: "bia" }; await rerender(view, label); draft("Envio atual");
  expect((screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled).toBe(false);
  await send("Envio atual"); expect(writes).toHaveLength(2);
  await act(async () => { writes[0].reject(new Error("Falha antiga")); });
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByRole("button", { name: label === "DTEC" ? "Enviando…" : "…" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { writes[1].resolve(acknowledged("Envio atual")); });
  expect(screen.getByText("Envio atual")).toBeTruthy(); expect(auth.scene?.message).toBe("Envio atual");
});

it.each(labels)("%s does not create a bubble timer after unmount when POST finishes", async (label) => {
  const view = await open(label); await send(); view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(vi.getTimerCount()).toBe(0);
});

it.each(labels)("%s clears a live bubble on context exit and preserves the next bubble past the old deadline", async (label) => {
  const view = await open(label); await send();
  await act(async () => { writes[0].resolve(acknowledged()); await vi.advanceTimersByTimeAsync(3000); });
  expect(auth.scene?.message).toBe("Envio anterior");
  auth.user = { id: "bia" }; await rerender(view, label);
  expect(auth.scene?.message).toBe(""); expect(auth.scene?.action).not.toBe("wave");
  await send("Envio atual"); await act(async () => { writes[1].resolve(acknowledged("Envio atual")); await vi.advanceTimersByTimeAsync(2000); });
  expect(auth.scene?.message).toBe("Envio atual");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(auth.scene?.message).toBe("");
});

it.each(labels)("%s still acknowledges a send after profile and same-account object refresh", async (label) => {
  const view = await open(label); await send();
  auth.user = { id: "ana" }; auth.profile = { displayName: "Ana Lima", avatarId: "r" }; await rerender(view, label);
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(screen.getByText("Envio anterior")).toBeTruthy(); expect(auth.scene?.message).toBe("Envio anterior");
  expect((screen.getByRole("textbox", { name: "Mensagem" }) as HTMLInputElement).value).toBe(""); expect(auth.mounts).toHaveBeenCalledOnce();
});

it.each(["success", "failure"])("generic ignores %s from the previous room", async (outcome) => {
  const view = await open("generic"); await send();
  await rerender(view, "generic", "colegas"); const input = draft();
  await act(async () => { if (outcome === "success") writes[0].resolve(acknowledged()); else writes[0].reject(new Error("Falha antiga")); });
  expect(input.value).toBe("Rascunho atual"); expect(screen.queryByText("Envio anterior")).toBeNull(); expect(screen.queryByRole("alert")).toBeNull(); expect(auth.scene?.message).toBe("");
  expect(auth.mounts).toHaveBeenCalledOnce();
});

it("generic does not revalidate an obsolete send after A→B→A rooms", async () => {
  const view = await open("generic"); await send();
  await rerender(view, "generic", "colegas"); await rerender(view, "generic"); const input = draft();
  await act(async () => { writes[0].resolve(acknowledged()); });
  expect(input.value).toBe("Rascunho atual"); expect(auth.scene?.message).toBe(""); expect(screen.queryByText("Envio anterior")).toBeNull();
});
