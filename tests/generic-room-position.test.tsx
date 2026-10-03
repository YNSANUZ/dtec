// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GenericRoom from "@/components/generic-room";
const sceneMount = vi.hoisted(() => vi.fn());
const sceneBirthday = vi.hoisted(() => vi.fn());
// These transport/pose regressions exercise an already-admitted member.
// Actual admission scopes are exercised in room-membership-hook and entry tests.
vi.mock("@/hooks/use-room-membership",()=>({useRoomMembership:(_slug:string,userId:string|null)=>({active:Boolean(userId),role:userId?"member":"visitor",status:userId?"active":"visitor",loading:false,busy:false,error:"",entryMode:"public",refresh:()=>{},join:async()=>true,leave:async()=>true})}));
vi.mock("@/hooks/use-room-identity",()=>({useRoomIdentity:(_slug:string,initial:unknown)=>({identity:initial,refresh:()=>{}})}));
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
  fireEvent.click(screen.getByRole("button", { name: /Ana Silva Membro/ }));
  expect(await screen.findByText("Perfil por clique")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  fireEvent.click(screen.getByRole("button", { name: "Clicar no próprio boneco" }));
  expect(await screen.findByText("Perfil por clique")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  expect(sceneMount).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/users/member", expect.objectContaining({ cache: "no-store" }));
});

it("keeps chat compact and scene mounted while reading history, drafting and sending", async () => {
  transport.mockImplementation((url: string, init?: RequestInit) => Promise.resolve(response(url.endsWith("/presence") ? { users: [] }
    : init?.method === "POST" ? { message: { id: "new", authorId: "member", name: "Ana Silva", text: "Olá", createdAt: new Date().toISOString() } }
      : { messages: [{ id: "old", name: "Ana Silva", text: "Anterior", createdAt: "2026-10-02T12:00:00Z" }] })));
  render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "Descrição da sala" }} />);
  const history = screen.getByRole("button", { name: "Mostrar mensagens" });
  expect(history.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(history); expect(await screen.findByText("Anterior", { exact: false })).toBeTruthy();
  const input = screen.getByLabelText("Mensagem");
  expect(input.getAttribute("maxLength")).toBe("100");
  fireEvent.focus(input); fireEvent.change(input, { target: { value: "Olá" } });
  fireEvent.click(screen.getByRole("button", { name: "Ocultar mensagens" }));
  expect((input as HTMLInputElement).value).toBe("Olá");
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  expect(transport).toHaveBeenCalledWith("/api/rooms/amigos/chat", expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Olá" }) }));
  expect(screen.getByText("Descrição da sala")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Voltar à entrada" }).getAttribute("href")).toBe("/");
  expect(sceneMount).toHaveBeenCalledOnce();
});

it("keeps the room scene mounted and the draft intact during keyboard resize and send failure", async () => {
  const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number; scale: number };
  Object.assign(viewport, { height: 844, offsetTop: 0, scale: 1 });
  vi.stubGlobal("visualViewport", viewport); vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 844);
  transport.mockImplementation((url: string, init?: RequestInit) => Promise.resolve(init?.method === "POST" && url.endsWith("/chat")
    ? new Response("{}", { status: 500 }) : response(url.endsWith("/presence") ? { users: [] } : { messages: [] })));
  render(<GenericRoom room={{ slug: "amigos", title: "Amigos", description: "" }} />);
  const input = screen.getByLabelText("Mensagem"); fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Rascunho" } }); viewport.height = 500;
  window.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("resize"));
  expect(screen.getByRole("main").style.getPropertyValue("--room-layout-height")).toBe("844px");
  fireEvent.submit(input.closest("form")!);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((input as HTMLInputElement).value).toBe("Rascunho");
  expect(sceneMount).toHaveBeenCalledOnce();
});
