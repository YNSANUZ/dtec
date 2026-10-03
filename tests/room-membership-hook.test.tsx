// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRoomMembership } from "@/hooks/use-room-membership";
import { StrictMode } from "react";

const requests: { path: string; method: string; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
const member = () => Response.json({ status: "active", role: "member" });
beforeEach(() => {
  requests.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => requests.push({ path, method: init?.method ?? "GET", resolve, reject }))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("serializes membership polls through JSON and clears timers on unmount", async () => {
  const view = renderHook(() => useRoomMembership("amigos", "ana"));
  let finish!: (body: unknown) => void;
  await act(async () => { requests[0].resolve({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) } as Response); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(requests).toHaveLength(1);
  await act(async () => { finish({ status: "active", role: "member" }); });
  expect(view.result.current.active).toBe(true);
  view.unmount(); expect(vi.getTimerCount()).toBe(0);
});

it.each(["room", "account"])("does not accept old membership after %s A→B→A", async kind => {
  const view = renderHook(({ slug, user }) => useRoomMembership(slug, user), { initialProps: { slug: "amigos", user: "ana" } });
  view.rerender({ slug: kind === "room" ? "colegas" : "amigos", user: kind === "account" ? "bia" : "ana" });
  view.rerender({ slug: "amigos", user: "ana" });
  await act(async () => { requests[0].resolve(member()); });
  expect(view.result.current.active).toBe(false);
  expect(view.result.current.loading).toBe(true);
  await act(async () => { requests[2].resolve(member()); });
  expect(view.result.current.active).toBe(true);
});

it.each(["success", "failure"])("ignores stale leave %s without approving navigation or touching a new mutation", async outcome => {
  const view = renderHook(({ slug }) => useRoomMembership(slug, "ana"), { initialProps: { slug: "amigos" } });
  await act(async () => { requests[0].resolve(member()); });
  let oldLeave!: Promise<boolean>;
  act(() => { oldLeave = view.result.current.leave(); });
  view.rerender({ slug: "colegas" });
  await act(async () => { requests[2].resolve(member()); });
  let newLeave!: Promise<boolean>;
  act(() => { newLeave = view.result.current.leave(); });
  await act(async () => { if (outcome === "success") requests[1].resolve(Response.json({})); else requests[1].reject(new Error("Falha antiga")); });
  expect(await oldLeave).toBe(false);
  expect(view.result.current.busy).toBe(true);
  expect(view.result.current.error).toBe("");
  await act(async () => { requests[3].resolve(Response.json({})); });
  expect(await newLeave).toBe(true);
  expect(view.result.current.active).toBe(false);
});

it("rejects a late leave after unmount and blocks two simultaneous writes", async () => {
  const view = renderHook(() => useRoomMembership("amigos", "ana"));
  await act(async () => { requests[0].resolve(member()); });
  let first!: Promise<boolean>, second!: Promise<boolean>;
  act(() => { first = view.result.current.leave(); second = view.result.current.leave(); });
  expect(await second).toBe(false); expect(requests).toHaveLength(2);
  view.unmount();
  await act(async () => { requests[1].resolve(Response.json({})); });
  expect(await first).toBe(false); expect(vi.getTimerCount()).toBe(0);
});

it("does not let an older active poll undo a confirmed leave", async () => {
  const view = renderHook(() => useRoomMembership("amigos", "ana"));
  await act(async () => { requests[0].resolve(member()); await vi.advanceTimersByTimeAsync(10000); });
  let leave!: Promise<boolean>;
  act(() => { leave = view.result.current.leave(); });
  await act(async () => { requests[2].resolve(Response.json({})); });
  expect(await leave).toBe(true);
  await act(async () => { requests[1].resolve(member()); });
  expect(view.result.current.active).toBe(false);
});

it("fails closed for malformed membership and never fetches for an anonymous visitor", async () => {
  const anonymous = renderHook(() => useRoomMembership("amigos", null));
  expect(requests).toHaveLength(0); expect(await anonymous.result.current.join()).toBe(false);
  const view = renderHook(() => useRoomMembership("amigos", "ana"));
  await act(async () => { requests[0].resolve(Response.json({ status: "active", role: "DEV" })); });
  expect(view.result.current.active).toBe(false); expect(view.result.current.role).toBe("visitor");
  expect(view.result.current.error).not.toBe("");
});

it("ignores the first StrictMode lifecycle even after the same account becomes current again", async () => {
  const view = renderHook(() => useRoomMembership("amigos", "ana"), {wrapper: StrictMode});
  expect(requests).toHaveLength(2);
  await act(async () => { requests[0].resolve(member()); });
  expect(view.result.current.active).toBe(false);
  await act(async () => { requests[1].resolve(Response.json({status:"pending",role:"visitor",entryMode:"protected"})); });
  expect(view.result.current.status).toBe("pending");
  expect(view.result.current.entryMode).toBe("protected");
});

it("sends only the supplied invitation and keeps a pending request outside the room", async () => {
  const view=renderHook(()=>useRoomMembership("amigos","ana"));
  await act(async()=>{requests[0].resolve(Response.json({status:"visitor",role:"visitor",entryMode:"protected"}));});
  let joined!: Promise<boolean>;
  act(()=>{joined=view.result.current.join("ab12");});
  expect(fetch).toHaveBeenLastCalledWith("/api/rooms/amigos/membership",expect.objectContaining({method:"POST",body:JSON.stringify({token:"ab12"})}));
  await act(async()=>{requests[1].resolve(Response.json({status:"pending",role:"visitor",entryMode:"protected"}));});
  expect(await joined).toBe(true);expect(view.result.current.active).toBe(false);expect(view.result.current.role).toBe("visitor");
});

it.each([{status:"active",role:"visitor"},{status:"pending",role:"owner"},{status:"active",role:"member",entryMode:"unrestricted"}])("rejects an inconsistent server admission: %j", async body => {
  const view=renderHook(()=>useRoomMembership("amigos","ana"));
  await act(async()=>{requests[0].resolve(Response.json({status:"visitor",role:"visitor"}));});
  let joined!:Promise<boolean>;act(()=>{joined=view.result.current.join();});
  await act(async()=>{requests[1].resolve(Response.json(body));});
  expect(await joined).toBe(false);expect(view.result.current.active).toBe(false);expect(view.result.current.error).toBeTruthy();
});
