// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventsFolder } from "@/components/mural/events-folder";
import { eventLocalDateTime } from "@/lib/events/presentation";
const transport = vi.fn();
const activity = { id: "event", title: "Kart QA", description: "Fictício", category: "kart", location: "Pista", startsAt: "2026-10-20T15:30:00.000Z", status: "open", interestCount: 1 };
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  transport.mockReset(); vi.stubGlobal("fetch", transport);
  transport.mockImplementation((url: string) => response(url.endsWith("/interest") ? { interested: [{ userId: "ana", name: "Ana Silva", avatar: "a", title: "" }], isInterested: true } : { events: [activity] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function expand() { fireEvent.click(await screen.findByRole("button", { name: /Kart QA/ })); await screen.findByText("Ana Silva"); }
it("does not expose management controls to members, or private requests to visitors", async () => {
  const view = render(<EventsFolder currentUserId="ana" roomSlug="amigos" />);
  await expand();
  expect(screen.queryByRole("button", { name: "Editar evento" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Encerrar evento" })).toBeNull();
  view.unmount(); transport.mockClear();
  render(<EventsFolder currentUserId={null} roomSlug="amigos" canManage />);
  expect(transport).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Criar evento" })).toBeNull();
});
it("edits the existing event through PATCH in the selected room, preserving local time and category", async () => {
  render(<EventsFolder currentUserId="ana" roomSlug="amigos" canManage />);
  await expand(); fireEvent.click(screen.getByRole("button", { name: "Editar evento" }));
  expect((screen.getByLabelText("Data e hora (opcional)") as HTMLInputElement).value).toBe(eventLocalDateTime(activity.startsAt));
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Kart alterado" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar evento" }));
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/events/event", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Kart alterado", description: "Fictício", category: "kart", startsAt: activity.startsAt, location: "Pista" }) })));
});
it("closes an event reversibly without deleting its interested roster", async () => {
  transport.mockImplementation((url: string, options?: RequestInit) => response(options?.method === "PATCH" ? { event: { ...activity, status: "closed" } } : url.endsWith("/interest") ? { interested: [{ userId: "ana", name: "Ana Silva", avatar: "a", title: "" }] } : { events: [{ ...activity, status: transport.mock.calls.some(([, init]) => init?.method === "PATCH") ? "closed" : "open" }] }));
  render(<EventsFolder currentUserId="ana" roomSlug="amigos" canManage />);
  await expand(); fireEvent.click(screen.getByRole("button", { name: "Encerrar evento" }));
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/events/event", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "closed" }) })));
  await screen.findByText("Nenhum evento aberto nesta pasta");
  fireEvent.click(screen.getByRole("button", { name: "Ver encerrados e cancelados" }));
  await expand();
  expect(screen.getByText("Encerrado")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reabrir evento" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Tenho interesse" })).toBeNull();
  expect(transport.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
});
it("allows reopening and cancelling with distinct statuses, only at the room endpoint", async () => {
  transport.mockImplementation((url: string) => response(url.endsWith("/interest") ? { interested: [] } : { events: [{ ...activity, status: "cancelled" }] }));
  render(<EventsFolder currentUserId="ana" roomSlug="amigos" canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Ver encerrados e cancelados" }));
  fireEvent.click(await screen.findByRole("button", { name: /Kart QA/ }));
  fireEvent.click(screen.getByRole("button", { name: "Reabrir evento" }));
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/events/event", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "open" }) })));
});
it("shows authorization failure without losing the original event", async () => {
  transport.mockImplementation((url: string, init?: RequestInit) => init?.method === "PATCH" ? response({ error: "forbidden" }, 403) : response(url.endsWith("/interest") ? { interested: [{ userId: "ana", name: "Ana Silva", avatar: "a", title: "" }] } : { events: [activity] }));
  render(<EventsFolder currentUserId="ana" roomSlug="amigos" canManage />);
  await expand(); fireEvent.click(screen.getByRole("button", { name: "Cancelar evento" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Somente ADM ou MOD desta sala pode gerenciar eventos.");
  expect(screen.getByRole("button", { name: "Editar evento" })).toBeTruthy();
});
it("does not apply a late interested roster to a different selected event", async () => {
  let old!: (response: Response) => void;
  transport.mockImplementation((url: string) => url.includes("/event/interest") ? new Promise((resolve) => { old = resolve; }) : response(url.endsWith("/interest") ? { interested: [{ userId: "beto", name: "Beto Lima", avatar: "c", title: "" }] } : { events: [activity, { ...activity, id: "other", title: "Futebol QA" }] }));
  render(<EventsFolder currentUserId="ana" roomSlug="amigos" />);
  fireEvent.click(await screen.findByRole("button", { name: /Kart QA/ }));
  fireEvent.click(screen.getByRole("button", { name: /Futebol QA/ }));
  expect(await screen.findByText("Beto Lima")).toBeTruthy();
  old(new Response(JSON.stringify({ interested: [{ userId: "ana", name: "Ana Silva", avatar: "a", title: "" }] })));
  await waitFor(() => expect(screen.queryByText("Ana Silva")).toBeNull());
});
