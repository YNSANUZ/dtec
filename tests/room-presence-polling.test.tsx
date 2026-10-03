// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenericRoom from "@/components/generic-room";
import DtecRoom from "@/app/dtec/page";

type SceneProps = { remoteUsers: Array<{ userId: string; name: string; x: number }>; initialPosition: { x: number; z: number } };
const state = vi.hoisted(() => ({ account: { id: "member" }, props: null as SceneProps | null, mounts: vi.fn() }));
// These transport/pose regressions exercise an already-admitted member.
// Actual admission scopes are exercised in room-membership-hook and entry tests.
vi.mock("@/hooks/use-room-membership",()=>({useRoomMembership:(_slug:string,userId:string|null)=>({active:Boolean(userId),role:userId?"member":"visitor",status:userId?"active":"visitor",loading:false,busy:false,error:"",entryMode:"public",refresh:()=>{},join:async()=>true,leave:async()=>true})}));
vi.mock("@/hooks/use-room-identity",()=>({useRoomIdentity:(_slug:string,initial:unknown)=>({identity:initial,refresh:()=>{}})}));
vi.mock("next/dynamic", () => ({ default: () => function Scene(props: SceneProps) { state.props = props; React.useEffect(() => { state.mounts(); }, []); return <div />; } }));
vi.mock("@/hooks/use-dtec-auth", () => ({ useDtecAuth: () => ({ state: "ready", user: state.account, profile: { displayName: "Ana Silva", avatarId: "a" } }) }));
vi.mock("@/components/profile/account-controls", () => ({ AccountControls: () => <div /> }));
vi.mock("@/components/rooms/room-people", () => ({ RoomPeople: () => <div /> }));
vi.mock("@/components/avatar-preview", () => ({ default: () => <div /> }));
vi.mock("@/components/mural-window", () => ({ default: () => <div /> }));
const transport = vi.fn();
const targets = [{ label: "generic", url: "/api/rooms/amigos/presence", interval: 2500 }, { label: "DTEC", url: "/api/room/characters", interval: 5000 }];
const viewFor = (label: string, slug = "amigos") => label === "DTEC" ? <DtecRoom /> : <GenericRoom room={{ slug, title: slug, description: "" }} />;
const users = (name = "Beto Novo") => [{ userId: state.account.id, name: "Ana Silva", avatar: "a", x: 8, z: -2, online: true }, { userId: "remote", name, avatar: "f", x: 4, z: 2, online: true }];
const response = (name?: string) => Response.json({ users: users(name), messages: [] });
type Pending = { resolve: (value: Response) => void; signal?: AbortSignal | null };
beforeEach(() => { vi.useFakeTimers(); state.account = { id: "member" }; state.props = null; state.mounts.mockClear(); transport.mockReset(); vi.stubGlobal("React", React); vi.stubGlobal("fetch", transport); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(targets)("$label does not overlap a slow presence fetch and preserves the mounted scene", async ({ label, url, interval }) => {
  const requests: Pending[] = [];
  transport.mockImplementation((path: string, init?: RequestInit) => path === url && (!init?.method || init.method === "GET") ? new Promise<Response>((resolve) => requests.push({ resolve, signal: init?.signal })) : Promise.resolve(response()));
  await act(async () => { render(viewFor(label)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(interval * 2); });
  expect(requests).toHaveLength(1);
  await act(async () => { requests[0].resolve(response()); });
  expect(state.props?.initialPosition).toEqual({ x: 8, z: -2 });
  await act(async () => { await vi.advanceTimersByTimeAsync(interval); });
  expect(requests).toHaveLength(2);
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label keeps the lock until presence JSON parsing completes", async ({ label, url, interval }) => {
  let finish!: (body: unknown) => void;
  let reads = 0;
  transport.mockImplementation((path: string, init?: RequestInit) => {
    if (path === url && (!init?.method || init.method === "GET")) { reads++; return Promise.resolve({ ok: true, json: () => new Promise((resolve) => { finish = resolve; }) } as unknown as Response); }
    return Promise.resolve(response());
  });
  await act(async () => { render(viewFor(label)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(interval * 2); });
  expect(reads).toBe(1);
  await act(async () => { finish({ users: users() }); });
  expect(state.props?.remoteUsers[0]?.name).toBe("Beto Novo");
  expect(state.mounts).toHaveBeenCalledOnce();
});

it.each(targets)("$label aborts an obsolete account request and ignores its late result", async ({ label, url }) => {
  const requests: Pending[] = [];
  transport.mockImplementation((path: string, init?: RequestInit) => path === url && (!init?.method || init.method === "GET") ? new Promise<Response>((resolve) => requests.push({ resolve, signal: init?.signal })) : Promise.resolve(response()));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(viewFor(label)); });
  state.account = { id: "other" }; await act(async () => { view.rerender(viewFor(label)); });
  expect(requests[0].signal?.aborted).toBe(true);
  await act(async () => { requests[1].resolve(response("Beto Atual")); });
  await act(async () => { requests[0].resolve(response("Beto Obsoleto")); });
  expect(state.props?.remoteUsers[0]?.name).toBe("Beto Atual");
  expect(state.mounts).toHaveBeenCalledOnce();
  view.unmount(); expect(requests[1].signal?.aborted).toBe(true);
});

it.each(targets)("$label releases a failed request for the next poll", async ({ label, url, interval }) => {
  let reads = 0;
  transport.mockImplementation((path: string, init?: RequestInit) => path === url && (!init?.method || init.method === "GET") ? ++reads === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(response()) : Promise.resolve(response()));
  await act(async () => { render(viewFor(label)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(interval); });
  expect(reads).toBe(2);
  expect(state.props?.remoteUsers[0]?.name).toBe("Beto Novo");
  expect(state.props?.initialPosition).toEqual({ x: 8, z: -2 });
  expect(state.mounts).toHaveBeenCalledOnce();
});
