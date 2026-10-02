// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GenericRoom from "@/components/generic-room";
const sceneMount = vi.hoisted(() => vi.fn());
const sceneBirthday = vi.hoisted(() => vi.fn());
vi.mock("next/dynamic", () => ({ default: () => function SceneFixture({ onCharacterClick, birthdayToday }: { onCharacterClick: (id: string | null) => void; birthdayToday: boolean }) { sceneBirthday(birthdayToday); React.useEffect(() => { sceneMount(); }, []); return <div aria-label="Cenário"><button onClick={() => onCharacterClick(null)}>Clicar no próprio boneco</button></div>; } }));
vi.mock("@/hooks/use-dtec-auth", () => {
  const auth = { state: "ready", user: { id: "member" }, profile: { displayName: "Ana Silva", avatarId: "a" } };
  return { useDtecAuth: () => auth };
});
const transport = vi.fn();
const response = (body: unknown) => new Response(JSON.stringify(body));
beforeEach(() => { transport.mockReset(); sceneMount.mockClear(); sceneBirthday.mockClear(); vi.stubGlobal("fetch", transport); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("uses the same public presence birthday flag for the own character without remounting the scene", async () => {
  transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/presence") ? { users: [{ userId: "member", x: 7, z: 2, name: "Ana Silva", avatar: "a", online: true, birthdayToday: true }] } : { messages: [] })));
  render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />);
  await waitFor(() => expect(sceneBirthday).toHaveBeenLastCalledWith(true)); expect(sceneMount).toHaveBeenCalledOnce();
});
it("restores persisted position before sending the first presence update", async () => {
  let finishPresence!: (response: Response) => void;
  transport.mockImplementation((url: string, options?: RequestInit) => url.endsWith("/presence") && options?.method !== "POST"
    ? new Promise((resolve) => { finishPresence = resolve; })
    : Promise.resolve(response({ messages: [] })));
  render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />);
  expect(transport.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  finishPresence(response({ users: [{ userId: "member", x: 7, z: 2, name: "Ana Silva", avatar: "a", online: true }] }));
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/presence", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 7, z: 2, action: "idle" }) })));
});
it("restores the same user's position separately after switching rooms", async () => {
  transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/presence") ? { users: [{ userId: "member", x: url.includes("/amigos/") ? 7 : -3, z: 2, name: "Ana Silva", avatar: "a", online: true }] } : { messages: [] })));
  const view = render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />);
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/presence", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: 7, z: 2, action: "idle" }) })));
  view.rerender(<GenericRoom room={{ slug: "outra", title: "Outra", description: "" }} />);
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/outra/presence", expect.objectContaining({ method: "POST", body: JSON.stringify({ x: -3, z: 2, action: "idle" }) })));
  expect(transport.mock.calls.some(([url, options]) => url === "/api/rooms/outra/presence" && options?.method === "POST" && JSON.parse(options.body).x === 7)).toBe(false);
});
it("keeps the scene mounted while opening, typing and cancelling profile editing", async () => {
  transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/presence") ? { users: [{ userId: "member", x: 7, z: 2, name: "Ana Silva", avatar: "a" }] } : { messages: [] })));
  render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />);
  await waitFor(() => expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/presence", expect.objectContaining({ method: "POST" })));
  expect(sceneMount).toHaveBeenCalledOnce();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Perfil de Ana" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Meu avatar e perfil" }));
  fireEvent.change(screen.getByLabelText("Nome e sobrenome"), { target: { value: "Ana Lima" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(sceneMount).toHaveBeenCalledOnce();
  expect(transport.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});

it("connects character and online-name clicks to the room profile without remounting the scene", async () => {
  transport.mockImplementation((url: string) => Promise.resolve(response(url.endsWith("/presence") ? { users: [{ userId: "member", x: 7, z: 2, name: "Ana Silva", avatar: "a", online: true }] }
    : url.endsWith("/users/member") ? { user: { userId: "member", name: "Ana Silva", avatar: "a", role: "member", title: "", bio: "Perfil por clique", birthDayMonth: null, whatsapp: "", instagram: "" } }
      : { messages: [], users: [] })));
  render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "1 online" }));
  fireEvent.click(screen.getByRole("button", { name: "Ana Silva" }));
  expect(await screen.findByText("Perfil por clique")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  fireEvent.click(screen.getByRole("button", { name: "Clicar no próprio boneco" }));
  expect(await screen.findByText("Perfil por clique")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  expect(sceneMount).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/users/member", expect.objectContaining({ cache: "no-store" }));
});
