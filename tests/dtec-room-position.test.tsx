// @vitest-environment happy-dom
import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DtecRoom from "@/app/dtec/page";

const state = vi.hoisted(() => ({ scene: null as null | { created: boolean; initialPosition: { x: number; z: number }; onStateChange: (x: number, z: number, action: string) => void } }));
// These transport/pose regressions exercise an already-admitted member.
// Actual admission scopes are exercised in room-membership-hook and entry tests.
vi.mock("@/hooks/use-room-membership",()=>({useRoomMembership:(_slug:string,userId:string|null)=>({active:Boolean(userId),role:userId?"member":"visitor",status:userId?"active":"visitor",loading:false,busy:false,error:"",entryMode:"public",refresh:()=>{},join:async()=>true,leave:async()=>true})}));
vi.mock("@/hooks/use-room-identity",()=>({useRoomIdentity:(_slug:string,initial:unknown)=>({identity:initial,refresh:()=>{}})}));
vi.mock("next/dynamic", () => ({ default: () => function Scene(props: NonNullable<typeof state.scene>) { state.scene = props; return <div />; } }));
vi.mock("@/components/avatar-preview", () => ({ default: () => <div /> }));
vi.mock("@/components/mural-window", () => ({ default: () => <div /> }));
vi.mock("@/hooks/use-dtec-auth", () => ({ useDtecAuth: () => ({ state: "ready", user: account, profile: { displayName: "Ana Silva", avatarId: "a" } }) }));
let account = { id: "member" };
const transport = vi.fn();
const response = (users: unknown[] = []) => new Response(JSON.stringify({ users, messages: [] }));
beforeEach(() => { account = { id: "member" }; state.scene = null; transport.mockReset(); vi.stubGlobal("React", React); vi.stubGlobal("fetch", transport); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("does not enable movement or publish a spawn before the saved DTEC position arrives", async () => {
  let finish!: (response: Response) => void;
  transport.mockImplementation((url: string) => url === "/api/room/characters"
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response()));
  render(<DtecRoom />);
  expect(state.scene!.created).toBe(false);
  expect(transport.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await act(async () => { finish(response([{ userId: "member", name: "Ana Silva", avatar: "a", x: 8, z: -2, online: true }])); });
  await waitFor(() => expect(state.scene!.created).toBe(true));
  expect(state.scene!.initialPosition).toEqual({ x: 8, z: -2 });
  expect(transport).toHaveBeenCalledWith("/api/room/presence", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 8, z: -2, action: "idle" }) }));
});

it("restores separately for a new authenticated session of the same account", async () => {
  const loads: Array<(response: Response) => void> = [];
  transport.mockImplementation((url: string) => url === "/api/room/characters"
    ? new Promise(resolve => loads.push(resolve)) : Promise.resolve(response()));
  const view = render(<DtecRoom />);
  await act(async () => { loads.shift()!(response([{ userId: "member", x: 8, z: -2 }])); });
  await waitFor(() => expect(state.scene!.created).toBe(true));
  account = { id: "member" };
  view.rerender(<DtecRoom />);
  expect(state.scene!.created).toBe(false);
  await act(async () => { loads.shift()!(response([{ userId: "member", x: -3, z: 4 }])); });
  await waitFor(() => expect(state.scene!.created).toBe(true));
  expect(state.scene!.initialPosition).toEqual({ x: -3, z: 4 });
  expect(transport).toHaveBeenCalledWith("/api/room/presence", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: -3, z: 4, action: "idle" }) }));
});

it("ignores a late position response from the previous account", async () => {
  const loads: Array<(response: Response) => void> = [];
  transport.mockImplementation((url: string) => url === "/api/room/characters"
    ? new Promise(resolve => loads.push(resolve)) : Promise.resolve(response()));
  const view = render(<DtecRoom />);
  account = { id: "other" };
  view.rerender(<DtecRoom />);
  await act(async () => { loads[0](response([{ userId: "member", x: 8, z: -2 }])); });
  expect(state.scene!.created).toBe(false);
  expect(transport.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await act(async () => { loads[1](response([{ userId: "other", x: -3, z: 4 }])); });
  expect(state.scene!.created).toBe(true);
  expect(state.scene!.initialPosition).toEqual({ x: -3, z: 4 });
});

it("keeps the local walk coordinates when later character polls contain an older position", async () => {
  vi.useFakeTimers();
  let reads = 0;
  transport.mockImplementation((url: string) => Promise.resolve(response(url === "/api/room/characters"
    ? [{ userId: "member", x: ++reads === 1 ? 8 : -8, z: -2 }] : [])));
  await act(async () => { render(<DtecRoom />); });
  expect(state.scene!.created).toBe(true);
  act(() => state.scene!.onStateChange(4, 6, "walk"));
  transport.mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(reads).toBe(2);
  expect(state.scene!.initialPosition).toEqual({ x: 8, z: -2 });
  const writes = transport.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(writes.length).toBeGreaterThan(0);
  expect(writes.every(([, options]) => options.body === JSON.stringify({ x: 4, z: 6, action: "walk" }))).toBe(true);
});

it("waits through a failed restore request and retries without publishing the default spawn", async () => {
  vi.useFakeTimers();
  let reads = 0;
  transport.mockImplementation((url: string) => Promise.resolve(url === "/api/room/characters"
    ? ++reads === 1 ? new Response("{}", { status: 500 }) : response([{ userId: "member", x: 8, z: -2 }])
    : response()));
  await act(async () => { render(<DtecRoom />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
  expect(state.scene!.created).toBe(false);
  expect(transport.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
  expect(state.scene!.created).toBe(true);
  expect(state.scene!.initialPosition).toEqual({ x: 8, z: -2 });
});
