"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useDtecAuth } from "@/hooks/use-dtec-auth";
import type { AvatarId } from "@/lib/profile/validation";

const OfficeScene = dynamic(() => import("@/components/office-scene"), { ssr: false });

const startingGuests = [
  { userId: "demo-ana", name: "Ana", avatar: "a", x: -7, z: 1 },
  { userId: "demo-beto", name: "Beto", avatar: "c", x: -4, z: 5 },
  { userId: "demo-lia", name: "Lia", avatar: "f", x: 1, z: 0 },
  { userId: "demo-noah", name: "Noah", avatar: "j", x: 5, z: 4 },
  { userId: "demo-sol", name: "Sol", avatar: "n", x: 9, z: 1 },
];

type DemoGuest = (typeof startingGuests)[number];
type RoomEntry = { slug: string; title: string; description: string };
const lobbyStart = { x: 0, z: 5 };

export default function CuboChatLobby() {
  const auth = useDtecAuth();
  const router = useRouter();
  const [guests, setGuests] = useState<DemoGuest[]>(startingGuests);
  const [rooms, setRooms] = useState<RoomEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>("r");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("create") === "1") setShowCreate(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGuests((current) => current.map((guest, index) => ({
        ...guest,
        x: Math.max(-10, Math.min(10, guest.x + Math.sin(Date.now() / 6000 + index) * 2)),
        z: Math.max(-4, Math.min(7, guest.z + Math.cos(Date.now() / 7000 + index) * 2)),
      })));
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/rooms", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { rooms?: RoomEntry[] };
      if (active) setRooms(body.rooms ?? []);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (auth.user && !auth.profile) {
      const suggestedName = String(auth.user.user_metadata?.full_name ?? auth.user.user_metadata?.name ?? "");
      setName(suggestedName.split(/\s+/).slice(0, 2).join(" "));
    }
  }, [auth.profile, auth.user]);

  useEffect(() => {
    if (!auth.profile) return;
    setName(auth.profile.displayName);
    setAvatar(auth.profile.avatarId);
    setWhatsapp(auth.profile.whatsapp);
    setInstagram(auth.profile.instagram);
  }, [auth.profile]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await auth.saveProfile({ displayName: name, avatarId: avatar, title: auth.profile?.title ?? "", bio: auth.profile?.bio ?? "", birthDayMonth: auth.profile?.birthDayMonth ?? "", whatsapp, instagram });
      setProfileEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar o perfil.");
    } finally { setBusy(false); }
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: roomId, title: roomTitle, description: roomDescription }) });
      const body = await response.json() as { room?: RoomEntry; error?: string };
      if (!response.ok || !body.room) throw new Error(body.error === "room_id_taken" ? "Este ID já está em uso." : body.error ?? "Não foi possível criar a sala.");
      router.push(`/${body.room.slug}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível criar a sala.");
    } finally { setBusy(false); }
  };

  const remoteUsers = guests.map((guest) => ({
    ...guest,
    action: "idle",
    message: "",
    online: false,
    birthdayToday: false,
  }));

  return <main className="lobby-shell">
    <OfficeScene
      environment="lobby"
      name={auth.profile?.displayName ?? "Visitante"}
      avatar={auth.profile?.avatarId ?? "r"}
      action="idle"
      message=""
      created={auth.state === "ready"}
      initialPosition={lobbyStart}
      remoteUsers={remoteUsers}
      birthdayToday={false}
      positionOwnerId={auth.user?.id ?? "lobby-visitor"}
      onStateChange={() => {}}
      onCharacterClick={() => {}}
      onMuralClick={() => {}}
    />
    <div className="shade" aria-hidden="true" />
    <header className="lobby-header"><span className="lobby-brand">CuboChat</span>{auth.state === "anonymous" ? <Link href="/auth/login?next=/" className="lobby-login">Entrar com Google</Link> : auth.user ? <button className="lobby-login" type="button" onClick={() => void auth.signOut()}>Sair</button> : null}</header>
    <section className="lobby-panel" aria-labelledby="lobby-title">
      <p className="lobby-eyebrow">Seu espaço virtual</p>
      <h1 id="lobby-title">Entre na sala e encontre sua turma.</h1>
      {auth.state === "anonymous" && <><p>Explore o ambiente como visitante. Entre com Google para criar seu personagem e sua sala.</p><div className="lobby-actions"><Link href="/auth/login?next=/" className="lobby-primary">Entrar com Google</Link><Link href="/dtec" className="lobby-secondary">Conhecer a sala DTEC</Link></div></>}
      {auth.state === "loading" && <p>Preparando o ambiente…</p>}
      {(auth.state === "authenticated-needs-profile" || (auth.state === "ready" && profileEditing)) && <form className="lobby-form" onSubmit={(event) => void saveProfile(event)}><p>{profileEditing ? "Atualize seu perfil." : "Crie seu personagem para participar das salas."}</p><label>Nome e sobrenome<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={48} /></label><label>Personagem<select value={avatar} onChange={(event) => setAvatar(event.target.value as AvatarId)}>{["a", "c", "f", "j", "n", "r"].map((id, index) => <option key={id} value={id}>Personagem {index + 1}</option>)}</select></label><label>WhatsApp (opcional)<input type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} /></label><label>Instagram (opcional)<input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@usuario" /></label><button disabled={busy}>{busy ? "Salvando…" : "Salvar perfil"}</button>{profileEditing && <button type="button" className="lobby-cancel" onClick={() => setProfileEditing(false)}>Cancelar</button>}</form>}
      {auth.state === "ready" && !profileEditing && <div className="lobby-directory"><p>Olá, {auth.profile?.displayName.split(" ")[0]}! Encontre uma sala ou crie a sua.</p><label className="lobby-search">Pesquisar sala<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou ID da sala" /></label><div className="lobby-room-list">{rooms.filter((room) => `${room.title} ${room.slug}`.toLowerCase().includes(search.toLowerCase())).map((room) => <Link key={room.slug} href={`/${room.slug}`}><strong>{room.title}</strong><span>/{room.slug}</span></Link>)}{rooms.length === 0 && <small>Nenhuma sala disponível no momento.</small>}</div><div className="lobby-directory-actions"><button type="button" className="lobby-create-toggle" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Cancelar" : "Criar meu CuboChat"}</button><button type="button" className="lobby-edit-profile" onClick={() => setProfileEditing(true)}>Editar perfil</button></div>{showCreate && <form className="lobby-form" onSubmit={(event) => void createRoom(event)}><label>Nome da sala<input required minLength={3} maxLength={60} value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} /></label><label>ID da sala (3 a 20 letras ou números)<input required minLength={3} maxLength={20} pattern="[a-z0-9]{3,20}" autoCapitalize="none" spellCheck={false} value={roomId} onChange={(event) => setRoomId(event.target.value.toLowerCase())} placeholder="minhasala2" /></label><label>Descrição (opcional)<input maxLength={280} value={roomDescription} onChange={(event) => setRoomDescription(event.target.value)} /></label><button disabled={busy}>{busy ? "Criando…" : "Criar sala"}</button></form>}</div>}
      {(error || auth.error) && <p role="alert" className="lobby-error">{error || auth.error}</p>}
      <small>Os cinco personagens deste espaço são demonstrativos, não pessoas conectadas.</small>
    </section>
    <nav className="lobby-legal" aria-label="Informações legais"><Link href="/politica-de-privacidade">Privacidade</Link><Link href="/termos-de-servico">Termos</Link></nav>
  </main>;
}
