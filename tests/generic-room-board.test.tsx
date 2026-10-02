// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoomBoard } from "@/components/rooms/room-board";

// Only the WebGL thumbnail is replaced; the dialogs, forms, and event handlers run.
vi.mock("@/components/avatar-preview", () => ({ default: () => <span aria-label="Miniatura do personagem" /> }));
const fetchMock = vi.fn();
const notice = { id: "note", authorId: "member", authorName: "Ana Silva", content: "Recado da sala amigos", isPinned: false, createdAt: "2026-10-02T12:00:00Z", likeCount: 1, dislikeCount: 0, myReaction: null };
const campaign = { id: "campaign", title: "Café", description: "", monthlyAmountCents: 2500, dueDay: 10, pixKey: "pix@example.test", paymentInstructions: "", currentCycleDueDate: "2026-10-10", isParticipant: true, paid: [], pending: [{ userId: "member", name: "Ana Silva", avatar: "a", title: "", markedAt: null }] };
const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((url: string) => reply(url.endsWith("/staff") ? { canManage: false } : url.includes("/fundraisers") ? { fundraisers: [campaign] } : url.includes("/events") ? { events: [] } : { messages: [notice] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("uses only the selected room and publishes a notice to that room", async () => {
  render(<RoomBoard roomSlug="amigos" currentUserId="member" onClose={() => {}} />);
  expect(await screen.findByText(notice.content)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Novo recado"), { target: { value: "Meu aviso" } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar recado" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/rooms/amigos/mural/messages", expect.objectContaining({ method: "POST", body: JSON.stringify({ content: "Meu aviso" }) })));
  expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/rooms/amigos/"))).toBe(true);
  expect(screen.queryByRole("button", { name: "Fixar" })).toBeNull();
});

it("shows visitors a login link without requesting private room data", () => {
  render(<RoomBoard roomSlug="amigos" currentUserId={null} onClose={() => {}} />);
  expect(screen.getByRole("link", { name: "Entrar com Google" }).getAttribute("href")).toBe("/auth/login?next=/amigos");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByText(notice.content)).toBeNull();
});

it("discards the previous room and ignores its late response", async () => {
  let resolveOld!: (response: Response) => void;
  fetchMock.mockImplementation((url: string) => url.endsWith("/staff") ? reply({ canManage: false }) : url.includes("/amigos/") ? new Promise((resolve) => { resolveOld = resolve; }) : reply({ messages: [{ ...notice, content: "Aviso da segunda sala" }] }));
  const view = render(<RoomBoard roomSlug="amigos" currentUserId="member" onClose={() => {}} />);
  view.rerender(<RoomBoard roomSlug="outra" currentUserId="member" onClose={() => {}} />);
  expect(await screen.findByText("Aviso da segunda sala")).toBeTruthy();
  resolveOld(new Response(JSON.stringify({ messages: [notice] })));
  await waitFor(() => expect(screen.queryByText(notice.content)).toBeNull());
});

it("shows reaction counts and opens one detailed roster", async () => {
  fetchMock.mockImplementation((url: string) => reply(url.endsWith("/staff") ? { canManage: false } : url.includes("reactions?") ? { people: [{ userId: "person", name: "Tiago Salomão" }] } : { messages: [notice] }));
  render(<RoomBoard roomSlug="amigos" currentUserId="member" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Curtidas: 1" }));
  expect(await screen.findByText("Tiago Salomão")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith("/api/rooms/amigos/mural/messages/note/reactions?type=like", { cache: "no-store" });
});

it("lets a member mark their payment with the displayed cycle, without manager controls or raised totals", async () => {
  render(<RoomBoard roomSlug="amigos" currentUserId="member" onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Vaquinhas" }));
  fireEvent.click(await screen.findByRole("button", { name: /Café/ }));
  expect(screen.getByText("pix@example.test")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Marcar pago" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/rooms/amigos/fundraisers/campaign/contributions/member", expect.objectContaining({ method: "POST", body: JSON.stringify({ paid: true, cycleDueDate: "2026-10-10" }) })));
  expect(screen.queryByRole("button", { name: "Editar vaquinha" })).toBeNull();
  expect(screen.queryByText(/total arrecadado/i)).toBeNull();
});

it("lets an ADM create the first campaign in an empty room", async () => {
  fetchMock.mockImplementation((url: string) => reply(url.endsWith("/staff") ? { canManage: true } : url.endsWith("/presence") ? { users: [] } : url.includes("/fundraisers") ? { fundraisers: [] } : { messages: [] }));
  render(<RoomBoard roomSlug="amigos" currentUserId="member" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText("Nenhum recado nesta sala.")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Vaquinhas" }));
  fireEvent.click(await screen.findByRole("button", { name: "Criar vaquinha" }));
  expect(screen.getByLabelText("Nome")).toBeTruthy();
  expect(screen.getByLabelText("Dia de vencimento")).toBeTruthy();
});
