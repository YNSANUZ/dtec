"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AvatarPreview from "@/components/avatar-preview";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PublicRoomPerson, RoomPerson, RoomPersonProfile } from "@/lib/rooms/people-types";
import styles from "./room-people.module.css";

type Props = { roomSlug: string; currentUserId: string | null; characters: PublicRoomPerson[]; selectedUserId: string | null; onSelect: (id: string) => void; onClose: () => void };
type Result<T> = { key: string; value?: T; error?: string; expired?: boolean };

export function RoomPeople(props: Props) {
  // This private overlay, not OfficeScene, resets across room/account boundaries.
  return <ScopedRoomPeople key={`${props.roomSlug}:${props.currentUserId ?? "visitor"}`} {...props} />;
}

function RoleName({ person }: { person: Pick<RoomPerson, "name" | "role"> }) {
  return <>{person.role === "owner" && <span aria-label="ADM">👑<span className="sr-only">ADM </span></span>}{person.name}{person.role === "leader" && <span aria-label="MOD"> ★<span className="sr-only"> MOD</span></span>}</>;
}

function ScopedRoomPeople({ roomSlug, currentUserId, characters, selectedUserId, onSelect, onClose }: Props) {
  const [listOpen, setListOpen] = useState(false);
  const [listResult, setListResult] = useState<Result<RoomPerson[]>>();
  const listUrl = `/api/rooms/${roomSlug}/users`;
  const profileUrl = selectedUserId ? `${listUrl}/${encodeURIComponent(selectedUserId)}` : "";
  const online = characters.filter((person) => person.online).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const privatePeople = currentUserId && listResult?.key === listUrl ? listResult.value ?? [] : [];

  useEffect(() => {
    if (!currentUserId || !listOpen) return;
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(listUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json() as { users: RoomPerson[] };
        if (active) setListResult({ key: listUrl, value: body.users });
      } catch { if (active) setListResult({ key: listUrl, error: "Não foi possível atualizar os cargos." }); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [currentUserId, listOpen, listUrl]);

  return <>
    <div className={styles.area}>
      <button type="button" className={styles.counter} aria-expanded={listOpen} aria-controls={`people-${roomSlug}`} onClick={() => setListOpen((open) => !open)}>{online.length} online</button>
      {listOpen && <section id={`people-${roomSlug}`} className="online-menu" aria-label="Pessoas online">
        <header><strong>Online nesta sala</strong><button type="button" aria-label="Fechar lista online" onClick={() => setListOpen(false)}>×</button></header>
        <ul>{online.map((publicPerson) => {
          const metadata = privatePeople.find((person) => person.userId === publicPerson.userId);
          const person: RoomPerson = { ...publicPerson, title: metadata?.title ?? "", role: metadata?.role ?? "member" };
          return <li key={person.userId}><button type="button" onClick={() => { setListOpen(false); onSelect(person.userId); }}><span className="online-marker"><RoleName person={person} /></span>{metadata?.title && <small>[{metadata.title}]</small>}</button></li>;
        })}</ul>
        {!online.length && <p className="online-empty">Nenhum usuário online agora.</p>}
        {listResult?.error && <p className="person-error" role="status">{listResult.error}</p>}
      </section>}
    </div>
    <Dialog open={selectedUserId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={`person-dialog ${styles.profile}`} showCloseButton={false}>
        <DialogClose className="person-close" aria-label="Fechar perfil">×</DialogClose>
        {selectedUserId && <RoomProfile key={profileUrl} profileUrl={profileUrl} roomSlug={roomSlug} currentUserId={currentUserId} onRoleChange={(userId, role) => setListResult((previous) => previous?.value ? { ...previous, value: previous.value.map((person) => person.userId === userId ? { ...person, role } : person) } : previous)} />}
      </DialogContent>
    </Dialog>
  </>;
}

function RoomProfile({ profileUrl, roomSlug, currentUserId, onRoleChange }: { profileUrl: string; roomSlug: string; currentUserId: string | null; onRoleChange: (id: string, role: RoomPerson["role"]) => void }) {
  const [result, setResult] = useState<Result<RoomPersonProfile>>();
  const profile = result?.value;
  const needsLogin = !currentUserId || result?.expired;
  useEffect(() => {
    if (!currentUserId || !profileUrl) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(profileUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (active) setResult({ key: profileUrl, error: "Não foi possível abrir este perfil.", expired: response.status === 401 });
          return;
        }
        const body = await response.json() as { user: RoomPersonProfile };
        if (active) setResult({ key: profileUrl, value: body.user });
      } catch { if (active) setResult({ key: profileUrl, error: "Não foi possível abrir este perfil." }); }
    })();
    return () => { active = false; controller.abort(); };
  }, [currentUserId, profileUrl]);

  // Profile fields are user-entered: never turn arbitrary URLs into contact links.
  const whatsapp = profile?.whatsapp && /^\d{10,15}$/.test(profile.whatsapp) ? profile.whatsapp : null;
  const instagram = profile?.instagram && /^[A-Za-z0-9._]{1,30}$/.test(profile.instagram) ? profile.instagram : null;

  return needsLogin ? <>
          <DialogTitle>Conheça quem está na sala</DialogTitle>
          <DialogDescription>Entre com Google para ver o perfil e os contatos que a pessoa escolheu compartilhar.</DialogDescription>
          <Link className="whatsapp-link" href={`/auth/login?next=/${roomSlug}`}>Entrar com Google</Link>
        </> : <>
          <DialogTitle className="sr-only">Perfil do usuário</DialogTitle>
          <DialogDescription className="sr-only">Informações compartilhadas por um membro desta sala.</DialogDescription>
          {profile ? <>
            <div className="person-identity"><AvatarPreview model={profile.avatar} headOnly /><div><h2><RoleName person={profile} /></h2>{profile.title && <span>{profile.title}</span>}</div></div>
            <div className="person-details">{profile.birthDayMonth && <p><strong>Aniversário</strong>{profile.birthDayMonth}</p>}{profile.bio && <p><strong>Biografia</strong>{profile.bio}</p>}{!profile.birthDayMonth && !profile.bio && <p className="person-empty">Sem informações adicionais.</p>}</div>
            <div className={styles.contacts}>{whatsapp && <a className="whatsapp-link" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{instagram && <a className="whatsapp-link" href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener noreferrer">Instagram</a>}</div>
            {profile.role !== "owner" && profile.userId !== currentUserId && <ModeratorControls roomSlug={roomSlug} person={profile} onChange={(role) => {
              setResult((previous) => previous?.value ? { ...previous, value: { ...previous.value, role } } : previous);
              onRoleChange(profile.userId, role);
            }} />}
          </> : result?.error ? <p className="person-error" role="alert">{result.error}</p> : <p className="person-loading" role="status">Carregando perfil…</p>}
        </>;
}

function ModeratorControls({ roomSlug, person, onChange }: { roomSlug: string; person: RoomPerson; onChange: (role: RoomPerson["role"]) => void }) {
  const [isOwner, setIsOwner] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const staffUrl = `/api/rooms/${roomSlug}/staff`;
  useEffect(() => {
    active.current = true;
    let lookupActive = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(staffUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as { role?: string };
        // MOD canManage=true is for content moderation, not appointing staff.
        if (lookupActive) setIsOwner(body.role === "owner");
      } catch { /* No confirmed ADM capability: do not offer management. */ }
    })();
    return () => { lookupActive = false; active.current = false; controller.abort(); };
  }, [staffUrl]);
  const remove = person.role === "leader";
  const change = async () => {
    if (!isOwner || !confirming || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(staffUrl, { method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: person.userId }) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { ok?: boolean; isLeader?: boolean };
      if (body.ok !== true || body.isLeader !== !remove) throw new Error();
      if (active.current) { onChange(remove ? "member" : "leader"); setConfirming(false); }
    } catch { if (active.current) { setError("Não foi possível alterar o papel MOD nesta sala."); setConfirming(false); } }
    finally { if (active.current) setSaving(false); }
  };
  if (!isOwner) return null;
  return <section className={styles.management} aria-label="Administrar MOD">
    {confirming ? <>
      <p>{remove ? "Remover MOD de" : "Confirmar MOD para"} {person.name} nesta sala?</p>
      <small>O MOD pode administrar recados, eventos e vaquinhas desta sala.</small>
      <div><button type="button" className="leader-toggle" disabled={saving} onClick={() => void change()}>{saving ? "Salvando…" : remove ? "Confirmar remoção" : "Confirmar designação"}</button><button type="button" disabled={saving} onClick={() => setConfirming(false)}>Cancelar alteração</button></div>
    </> : <button type="button" className="leader-toggle" onClick={() => { setError(""); setConfirming(true); }}>{remove ? "Remover MOD" : "Designar MOD"}</button>}
    {error && <p className="person-error" role="alert">{error}</p>}
  </section>;
}
