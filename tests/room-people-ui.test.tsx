// @vitest-environment happy-dom
import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoomPeople } from "@/components/rooms/room-people";

const users = [{ userId: "ana", name: "Ana Silva", avatar: "a", online: true }, { userId: "bruno", name: "Bruno Lima", avatar: "f", online: true }, { userId: "eva", name: "Eva Souza", avatar: "r", online: false }];
const profile = { userId: "ana", name: "Ana Silva", avatar: "a", role: "owner", title: "Infra", bio: "Cuido das redes", birthDayMonth: "02/10", whatsapp: "5561999999999", instagram: "ana.silva" };
const transport = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function Harness({ currentUserId = "ana", roomSlug = "amigos", initial = null }: { currentUserId?: string | null; roomSlug?: string; initial?: string | null }) {
  const [selected, select] = useState(initial);
  return <RoomPeople roomSlug={roomSlug} currentUserId={currentUserId} characters={users} selectedUserId={selected} onSelect={select} onClose={() => select(null)} />;
}
beforeEach(() => {
  transport.mockReset(); vi.stubGlobal("fetch", transport);
  transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/users") ? { users: [{ ...profile }, { ...users[1], title: "Chefe", role: "leader" }] } : { user: profile })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("counts only online members and lets visitors open and close the Google invitation without private requests", async () => {
  render(<Harness currentUserId={null} />);
  fireEvent.click(screen.getByRole("button", { name: "2 online" }));
  expect(screen.queryByText("Eva Souza")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Ana Silva/ }));
  expect(screen.getByRole("link", { name: "Entrar com Google" }).getAttribute("href")).toBe("/auth/login?next=/amigos");
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});
it("enriches the list for a logged-in member with scoped ADM/MOD and optional titles", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "2 online" }));
  expect(await screen.findByText("[Infra]")).toBeTruthy();
  expect(screen.getByRole("button", { name: /ADM Ana Silva/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Bruno Lima MOD/ })).toBeTruthy();
  expect(transport.mock.calls.every(([url]) => url.startsWith("/api/rooms/amigos/"))).toBe(true);
});
it("opens a lightweight current-avatar profile with DD/MM and optional contact links", async () => {
  render(<Harness initial="ana" />);
  expect(await screen.findByText("Cuido das redes")).toBeTruthy();
  expect(screen.getByText("02/10")).toBeTruthy();
  expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe("https://wa.me/5561999999999");
  expect(screen.getByRole("link", { name: "Instagram" }).getAttribute("href")).toBe("https://www.instagram.com/ana.silva/");
  const dialog = screen.getByRole("dialog");
  expect(dialog.querySelector("img")?.getAttribute("src")).toContain("a-head.png");
  expect(dialog.querySelector("canvas")).toBeNull();
});
it("drops private details immediately when the Google session ends", async () => {
  const view = render(<Harness initial="ana" />);
  expect(await screen.findByText("Cuido das redes")).toBeTruthy();
  view.rerender(<Harness initial="ana" currentUserId={null} />);
  expect(screen.queryByText("Cuido das redes")).toBeNull();
  expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  expect(screen.getByRole("link", { name: "Entrar com Google" })).toBeTruthy();
});
it("ignores old profile responses after changing rooms", async () => {
  let finish!: (response: Response) => void;
  transport.mockImplementation((url: string) => url.includes("/amigos/") ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(response({ user: { ...profile, bio: "Perfil da nova sala", role: "member" } })));
  const view = render(<Harness initial="ana" />);
  view.rerender(<Harness initial="ana" roomSlug="outra" />);
  expect(await screen.findByText("Perfil da nova sala")).toBeTruthy();
  await act(async () => finish(response({ user: profile })));
  expect(screen.queryByText("Cuido das redes")).toBeNull();
  expect(screen.queryByText("ADM")).toBeNull();
});
it("handles unavailable profiles and never constructs unsafe contact links", async () => {
  transport.mockImplementation(() => Promise.resolve(response({ error: "not_found" }, 404)));
  const view = render(<Harness initial="ana" />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveProperty("textContent", "Não foi possível abrir este perfil."));
  view.unmount();
  transport.mockImplementation(() => Promise.resolve(response({ user: { ...profile, whatsapp: "javascript:alert(1)", instagram: "https://evil.test" } })));
  render(<Harness initial="ana" />);
  expect(await screen.findByText("Cuido das redes")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Instagram" })).toBeNull();
});

it("requests a fresh profile when reopening the same person rather than showing cached contacts", async () => {
  let finish!: (response: Response) => void;
  let calls = 0;
  transport.mockImplementation((url: string) => {
    if (url.endsWith("/users")) return Promise.resolve(response({ users: [profile] }));
    return ++calls === 1 ? Promise.resolve(response({ user: profile })) : new Promise((resolve) => { finish = resolve; });
  });
  render(<Harness initial="ana" />);
  expect(await screen.findByText("Cuido das redes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  fireEvent.click(screen.getByRole("button", { name: "2 online" }));
  fireEvent.click(screen.getByRole("button", { name: /Ana Silva/ }));
  expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Carregando perfil…");
  await act(async () => finish(response({ user: { ...profile, bio: "Perfil atualizado", whatsapp: "", instagram: "" } })));
  expect(screen.getByText("Perfil atualizado")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
});

it("ignores a late profile response after clicking a different person in the same room", async () => {
  let finish!: (response: Response) => void;
  transport.mockImplementation((url: string) => url.endsWith("/ana") ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(response({ user: { ...profile, userId: "bruno", name: "Bruno Lima", bio: "Outro membro", role: "member" } })));
  const props = { roomSlug: "amigos", currentUserId: "ana", characters: users, onSelect: () => {}, onClose: () => {} };
  const view = render(<RoomPeople {...props} selectedUserId="ana" />);
  view.rerender(<RoomPeople {...props} selectedUserId="bruno" />);
  expect(await screen.findByText("Outro membro")).toBeTruthy();
  await act(async () => finish(response({ user: profile })));
  expect(screen.queryByText("Cuido das redes")).toBeNull();
  expect(screen.queryByText("ADM")).toBeNull();
});

it("lets only the room ADM confirm appointment/removal and updates the MOD badge after the server accepts", async () => {
  transport.mockImplementation((url: string, options?: RequestInit) => Promise.resolve(response(url.endsWith("/staff")
    ? options?.method ? { ok: true, isLeader: options.method === "POST" } : { role: "owner", canManage: true }
    : { user: { ...profile, userId: "bruno", name: "Bruno Lima", role: "member" } })));
  render(<Harness initial="bruno" />);
  fireEvent.click(await screen.findByRole("button", { name: "Designar MOD" }));
  expect(transport.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  expect(screen.getByText(/Confirmar MOD para Bruno Lima/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar designação" }));
  expect(await screen.findByRole("button", { name: "Remover MOD" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /Bruno Lima MOD/ })).toBeTruthy();
  expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/staff", expect.objectContaining({ method: "POST", body: JSON.stringify({ userId: "bruno" }) }));
  fireEvent.click(screen.getByRole("button", { name: "Remover MOD" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
  expect(await screen.findByRole("button", { name: "Designar MOD" })).toBeTruthy();
  expect(screen.queryByLabelText("MOD")).toBeNull();
  expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/staff", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ userId: "bruno" }) }));
});

it("does not offer staff management to a MOD, member, or before the room's authority is known", async () => {
  for (const role of ["leader", null]) {
    transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/staff") ? { role, canManage: role === "leader" }
      : { user: { ...profile, userId: "bruno", name: "Bruno Lima", role: "member" } })));
    const view = render(<Harness initial="bruno" />);
    expect(screen.queryByRole("button", { name: "Designar MOD" })).toBeNull();
    expect(await screen.findByText("Cuido das redes")).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Designar MOD" })).toBeNull();
    view.unmount();
  }
});

it("keeps the current badge when a staff update fails and allows cancellation without writes", async () => {
  transport.mockImplementation((url: string, options?: RequestInit) => Promise.resolve(url.endsWith("/staff")
    ? options?.method ? response({ error: "forbidden" }, 403) : response({ role: "owner" })
    : response({ user: { ...profile, userId: "bruno", name: "Bruno Lima", role: "member" } })));
  render(<Harness initial="bruno" />);
  fireEvent.click(await screen.findByRole("button", { name: "Designar MOD" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar alteração" }));
  expect(transport.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Designar MOD" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar designação" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Não foi possível alterar o papel MOD nesta sala.");
  expect(screen.getByRole("button", { name: "Designar MOD" })).toBeTruthy();
  expect(screen.queryByLabelText("MOD")).toBeNull();
});

it("never offers role changes for the ADM or the current account", async () => {
  for (const person of [{ ...profile, userId: "bruno", role: "owner" }, { ...profile, role: "member" }]) {
    transport.mockClear();
    transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/staff") ? { role: "owner" } : { user: person })));
    const view = render(<Harness initial={person.userId} />);
    expect(await screen.findByText("Cuido das redes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Designar MOD|Remover MOD/ })).toBeNull();
    expect(transport.mock.calls.some(([url]) => url.endsWith("/staff"))).toBe(false);
    view.unmount();
  }
});

it("disables duplicate confirmation and ignores the mutation result after changing people", async () => {
  let finish!: (response: Response) => void;
  const changed = vi.fn();
  transport.mockImplementation((url: string, options?: RequestInit) => url.endsWith("/staff")
    ? options?.method ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response({ role: "owner" }))
    : Promise.resolve(response({ user: { ...profile, userId: url.endsWith("/eva") ? "eva" : "bruno", name: url.endsWith("/eva") ? "Eva Souza" : "Bruno Lima", role: "member" } })));
  const props = { roomSlug: "amigos", currentUserId: "ana", characters: users, onSelect: changed, onClose: () => {} };
  const view = render(<RoomPeople {...props} selectedUserId="bruno" />);
  fireEvent.click(await screen.findByRole("button", { name: "Designar MOD" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar designação" }));
  expect(screen.getByRole("button", { name: "Salvando…" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Cancelar alteração" }).hasAttribute("disabled")).toBe(true);
  view.rerender(<RoomPeople {...props} selectedUserId="eva" />);
  expect(await screen.findByRole("heading", { name: "Eva Souza" })).toBeTruthy();
  await act(async () => finish(response({ ok: true, isLeader: true })));
  expect(screen.queryByLabelText("MOD")).toBeNull();
  expect(screen.getByRole("heading", { name: "Eva Souza" })).toBeTruthy();
  expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("does not optimistically promote someone when the server returns an unexpected result", async () => {
  transport.mockImplementation((url: string, options?: RequestInit) => Promise.resolve(response(url.endsWith("/staff")
    ? options?.method ? { ok: true, isLeader: false } : { role: "owner" }
    : { user: { ...profile, userId: "bruno", name: "Bruno Lima", role: "member" } })));
  render(<Harness initial="bruno" />);
  fireEvent.click(await screen.findByRole("button", { name: "Designar MOD" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar designação" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByLabelText("MOD")).toBeNull();
});

it("ignores an obsolete authority response after React restarts the lookup", async () => {
  const lookups: Array<(response: Response) => void> = [];
  transport.mockImplementation((url: string) => url.endsWith("/staff") ? new Promise(resolve => lookups.push(resolve))
    : Promise.resolve(response({ user: { ...profile, userId: "bruno", name: "Bruno Lima", role: "member" } })));
  render(<React.StrictMode><Harness initial="bruno" /></React.StrictMode>);
  await waitFor(() => expect(lookups).toHaveLength(2));
  await act(async () => lookups[1](response({ role: "member" })));
  await act(async () => lookups[0](response({ role: "owner" })));
  expect(screen.queryByRole("button", { name: "Designar MOD" })).toBeNull();
});
