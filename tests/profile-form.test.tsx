// @vitest-environment happy-dom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileForm } from "@/components/profile/profile-form";

afterEach(cleanup);
const profile = { displayName: "Ana Silva", avatarId: "a" as const, title: "Analista", bio: "Olá", birthDayMonth: "12/10", whatsapp: "5561999999999", instagram: "ana" };
const submit = () => fireEvent.submit(screen.getByRole("form", { name: "Perfil do personagem" }));

it("shows numbered character images and every optional field without a birth year", () => {
  render(<ProfileForm profile={profile} onSave={vi.fn()} />);
  expect(screen.getAllByRole("button", { name: /Personagem [1-6]/ })).toHaveLength(6);
  expect(screen.getByRole("button", { name: "Personagem 1" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByLabelText("Aniversário (dia e mês, opcional)").getAttribute("type")).not.toBe("date");
  expect((screen.getByLabelText("Aniversário (dia e mês, opcional)") as HTMLInputElement).value).toBe("12/10");
  expect(screen.queryByText(/ano de nascimento/i)).toBeNull();
  expect(screen.getByLabelText("Instagram (opcional)")).toBeTruthy();
});
it("saves avatar changes and preserves the existing birthday, biography and contact fields", async () => {
  const save = vi.fn().mockResolvedValue(profile);
  render(<ProfileForm profile={profile} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Personagem 6" }));
  fireEvent.change(screen.getByLabelText("Nome e sobrenome"), { target: { value: "Ana Lima" } });
  submit();
  await waitFor(() => expect(save).toHaveBeenCalledWith({ ...profile, displayName: "Ana Lima", avatarId: "r" }));
});
it("rejects an incomplete name or invalid calendar day before sending data", async () => {
  const save = vi.fn();
  render(<ProfileForm profile={null} suggestedName="Ana" onSave={save} />);
  submit();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Informe seu nome e sobrenome, com dois nomes no total.");
  fireEvent.change(screen.getByLabelText("Nome e sobrenome"), { target: { value: "Ana Silva" } });
  fireEvent.change(screen.getByLabelText("Aniversário (dia e mês, opcional)"), { target: { value: "31/02" } });
  submit();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Informe um dia e mês válidos."));
  expect(save).not.toHaveBeenCalled();
});
it("keeps the edited data and displays a friendly error when saving fails", async () => {
  render(<ProfileForm profile={profile} onSave={vi.fn().mockRejectedValue(new Error("profile_save_failed"))} />);
  submit();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Não foi possível salvar seu perfil. Tente novamente.");
  expect((screen.getByLabelText("Nome e sobrenome") as HTMLInputElement).value).toBe("Ana Silva");
  expect(screen.getByRole("button", { name: "Salvar perfil" }).hasAttribute("disabled")).toBe(false);
});
it("does not save when cancelling, and suggests the provided Google name for first setup", () => {
  const save = vi.fn(); const cancel = vi.fn();
  render(<ProfileForm profile={null} suggestedName="Beto Lima" onSave={save} onCancel={cancel} />);
  expect((screen.getByLabelText("Nome e sobrenome") as HTMLInputElement).value).toBe("Beto Lima");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});
