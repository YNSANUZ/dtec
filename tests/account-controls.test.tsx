// @vitest-environment happy-dom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountControls } from "@/components/profile/account-controls";
import type { useDtecAuth } from "@/hooks/use-dtec-auth";
vi.mock("next/image", () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
  const imageProps = { ...props }; delete imageProps.unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...imageProps} alt={props.alt ?? ""} />;
} }));
afterEach(cleanup);
const profile = { displayName: "Ana Silva", avatarId: "a" as const, title: "", bio: "", birthDayMonth: "12/10", whatsapp: "", instagram: "" };
const auth = (changes = {}) => ({ state: "ready", user: { id: "ana", user_metadata: { full_name: "Ana Maria Silva", picture: "https://lh3.googleusercontent.com/photo" } }, profile, error: "", clearError: vi.fn(), saveProfile: vi.fn().mockResolvedValue(profile), signOut: vi.fn(), ...changes }) as unknown as ReturnType<typeof useDtecAuth>;
const openMenu = () => fireEvent.pointerDown(screen.getByRole("button", { name: "Perfil de Ana" }), { button: 0, ctrlKey: false });

it("shows a Google entry that returns to the same room, with no profile editor for visitors", () => {
  render(<AccountControls auth={auth({ state: "anonymous", user: null, profile: null })} loginNext="/amigos" />);
  expect(screen.getByRole("link", { name: "Entrar com Google" }).getAttribute("href")).toBe("/auth/login?next=/amigos");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("shows only the first chosen name beside the Google photo and handles image failure", () => {
  const { container } = render(<AccountControls auth={auth()} loginNext="/amigos" />);
  const trigger = screen.getByRole("button", { name: "Perfil de Ana" });
  expect(trigger.textContent).toContain("Ana");
  expect(trigger.textContent).not.toContain("Silva");
  const image = container.querySelector("img")!;
  expect(image.getAttribute("src")).toBe("https://lh3.googleusercontent.com/photo");
  expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
  fireEvent.error(image);
  expect(container.querySelector("img")).toBeNull();
});
it("opens a cancellable profile editor on demand, without navigation or saving on cancel", async () => {
  const actor = auth();
  render(<AccountControls auth={actor} loginNext="/amigos" />);
  expect(screen.queryByRole("dialog")).toBeNull();
  openMenu();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Meu avatar e perfil" }));
  expect(await screen.findByRole("dialog", { name: "Meu avatar e perfil" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar perfil" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(actor.saveProfile).not.toHaveBeenCalled();
});
it("offers create-room promotion and an explicitly disabled install item", async () => {
  const create = vi.fn();
  render(<AccountControls auth={auth()} loginNext="/" onCreateRoom={create} />);
  openMenu();
  const install = await screen.findByRole("menuitem", { name: /Instalar aplicativo/ });
  expect(install.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(screen.getByRole("menuitem", { name: "Criar meu CuboChat" }));
  expect(create).toHaveBeenCalledOnce();
});
