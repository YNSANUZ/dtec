"use client";

import React, { useState, type FormEvent } from "react";
import AvatarPreview from "@/components/avatar-preview";
import type { DtecProfile } from "@/hooks/use-dtec-auth";
import { avatarIds, normalizeProfile, type AvatarId } from "@/lib/profile/validation";
import styles from "./profile.module.css";

export type ProfileDraft = Omit<DtecProfile, "birthDayMonth"> & { birthDayMonth: string };

export function ProfileForm({ profile, suggestedName = "", onSave, onCancel }: {
  profile: DtecProfile | null; suggestedName?: string; onSave: (draft: ProfileDraft) => Promise<unknown>; onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(() => ({
    displayName: profile?.displayName ?? suggestedName, avatarId: profile?.avatarId ?? "r",
    title: profile?.title ?? "", bio: profile?.bio ?? "", birthDayMonth: profile?.birthDayMonth ?? "",
    whatsapp: profile?.whatsapp ?? "", instagram: profile?.instagram ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (key: keyof ProfileDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      normalizeProfile(draft); // Same validation as the API; send DD/MM, never a year.
      await onSave(draft);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(!message || message === "profile_save_failed" ? "Não foi possível salvar seu perfil. Tente novamente." : message);
    } finally { setBusy(false); }
  };
  return <form className={styles.form} aria-label="Perfil do personagem" onSubmit={(event) => void submit(event)}>
    <label>Nome e sobrenome<input required autoComplete="name" maxLength={48} value={draft.displayName} onChange={(event) => field("displayName", event.target.value)} /></label>
    <small>Use dois nomes. Seu perfil é compartilhado entre suas salas.</small>
    <fieldset className={styles.avatars}><legend>Escolha seu personagem</legend><div>
      {avatarIds.map((id, index) => <button key={id} type="button" aria-label={`Personagem ${index + 1}`} aria-pressed={draft.avatarId === id} onClick={() => field("avatarId", id as AvatarId)} disabled={busy}><AvatarPreview model={id} /><b>{index + 1}</b></button>)}
    </div></fieldset>
    <label>Descrição ou cargo (opcional)<input maxLength={48} value={draft.title} onChange={(event) => field("title", event.target.value)} placeholder="Ex.: Desenvolvedor ou Apt 201" /></label>
    <label>Biografia (opcional)<textarea rows={2} maxLength={280} value={draft.bio} onChange={(event) => field("bio", event.target.value)} /></label>
    <label>Aniversário (dia e mês, opcional)<input inputMode="numeric" maxLength={5} pattern="[0-9]{2}/[0-9]{2}" placeholder="DD/MM" value={draft.birthDayMonth} onChange={(event) => field("birthDayMonth", event.target.value)} /></label>
    <label>WhatsApp (opcional)<input type="tel" autoComplete="tel" maxLength={24} value={draft.whatsapp} onChange={(event) => field("whatsapp", event.target.value)} placeholder="DDI, DDD e número" /></label>
    <label>Instagram (opcional)<input maxLength={80} value={draft.instagram} onChange={(event) => field("instagram", event.target.value)} placeholder="@usuario" /></label>
    <small>Preencha somente os contatos que deseja compartilhar com membros autenticados.</small>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar perfil"}</button>{onCancel && <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>}</div>
  </form>;
}
