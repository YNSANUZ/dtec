// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoomBoard } from "@/components/rooms/room-board";
import { RoomBirthdays } from "@/components/rooms/room-birthdays";

const fetchMock = vi.fn();
const person = { userId: "ana", name: "Ana Silva", avatar: "a", title: "Infra", birthDayMonth: "10-02" };
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((url: string) => reply(url.endsWith("/staff") ? { canManage: false } : url.endsWith("/birthdays") ? { birthdays: [person] } : { messages: [] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const props = { roomSlug: "amigos", currentUserId: "member", onClose: () => {} };
const openBirthdays = () => fireEvent.click(screen.getByRole("button", { name: "Aniversariantes" }));

it("opens a lightweight ordered list with static heads and day/month only", async () => {
  fetchMock.mockImplementation((url: string) => reply(url.endsWith("/staff") ? { canManage: false } : url.endsWith("/birthdays") ? { birthdays: [
    { ...person, userId: "past", name: "Ontem Silva", birthDayMonth: "10-01" },
    { ...person, userId: "next", name: "Amanhã Silva", birthDayMonth: "10-03" }, person,
  ] } : { messages: [] }));
  const view = render(<RoomBoard {...props} />); openBirthdays();
  const list = await screen.findByLabelText("Aniversários em ordem cronológica");
  expect(Array.from(list.querySelectorAll("strong")).map((n) => n.textContent)).toEqual(["Ana Silva", "Amanhã Silva", "Ontem Silva"]);
  expect(screen.getByText("02 de outubro")).toBeTruthy();
  expect(list.textContent).not.toContain("2026");
  expect(list.querySelectorAll("img")).toHaveLength(3);
  expect(list.querySelector("canvas")).toBeNull();
  expect(fetchMock).toHaveBeenCalledWith("/api/rooms/amigos/birthdays", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  view.unmount();
});
it("does not fetch dates as a visitor", () => {
  render(<RoomBoard {...props} currentUserId={null} />);
  expect(screen.queryByRole("button", { name: "Aniversariantes" })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("aborts and ignores a previous room's delayed date response", async () => {
  let resolveOld!: (value: Response) => void;
  let oldSignal!: AbortSignal;
  fetchMock.mockImplementation((url: string, options: RequestInit) => {
    if (url === "/api/rooms/amigos/birthdays") { oldSignal = options.signal as AbortSignal; return new Promise((resolve) => { resolveOld = resolve; }); }
    return reply(url.endsWith("/birthdays") ? { birthdays: [{ ...person, name: "Eva Souza" }] } : url.endsWith("/staff") ? { canManage: false } : { messages: [] });
  });
  const view = render(<RoomBoard {...props} />); openBirthdays();
  view.rerender(<RoomBoard {...props} roomSlug="outra" />); openBirthdays();
  expect(await screen.findByText("Eva Souza")).toBeTruthy();
  expect(oldSignal.aborted).toBe(true);
  resolveOld(new Response(JSON.stringify({ birthdays: [person] })));
  await waitFor(() => expect(screen.queryByText("Ana Silva")).toBeNull());
});
it("handles empty and denied reads without exposing a previous list", async () => {
  fetchMock.mockImplementation((url: string) => url.endsWith("/birthdays") ? reply({ birthdays: [] }) : reply({ messages: [], canManage: false }));
  const view = render(<RoomBoard {...props} />); openBirthdays();
  expect(await screen.findByText("Nenhum aniversário cadastrado ainda")).toBeTruthy();
  view.unmount();
  fetchMock.mockImplementation((url: string) => url.endsWith("/birthdays") ? reply({ error: "unauthorized" }, 401) : reply({ messages: [], canManage: false }));
  render(<RoomBoard {...props} />); openBirthdays();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Não foi possível carregar os aniversários.");
  expect(screen.queryByText("Ana Silva")).toBeNull();
});

it("refreshes serially and cancels polling on unmount", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  let resolveFirst!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
  const view = render(<RoomBirthdays roomSlug="amigos" currentUserId="member" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(fetchMock).toHaveBeenCalledTimes(1); // No overlapping read while the first is pending.
  await act(async () => { resolveFirst(new Response(JSON.stringify({ birthdays: [person] }))); });
  expect(screen.getByText("Ana Silva")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const signal = fetchMock.mock.calls[1][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("ignores StrictMode's superseded lookup and removes dates immediately on logout", async () => {
  let resolveOld!: (response: Response) => void;
  let dateReads = 0;
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/birthdays")) {
      if (++dateReads === 1) return new Promise((resolve) => { resolveOld = resolve; });
      return reply({ birthdays: [{ ...person, name: "Eva Souza" }] });
    }
    return reply({ messages: [], canManage: false });
  });
  const view = render(<React.StrictMode><RoomBirthdays roomSlug="amigos" currentUserId="member" /></React.StrictMode>);
  expect(await screen.findByText("Eva Souza")).toBeTruthy();
  await act(async () => { resolveOld(new Response(JSON.stringify({ birthdays: [person] }))); });
  expect(screen.queryByText("Ana Silva")).toBeNull();
  view.rerender(<RoomBoard {...props} currentUserId={null} />);
  expect(screen.queryByText("Eva Souza")).toBeNull();
  expect(screen.getByRole("link", { name: "Entrar com Google" })).toBeTruthy();
});
