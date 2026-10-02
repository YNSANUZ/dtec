"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { useDtecAuth } from "@/hooks/use-dtec-auth";
import { RoomBoard } from "@/components/rooms/room-board";

const OfficeScene = dynamic(() => import("@/components/office-scene"), { ssr: false });
const roomStart = { x: 0, z: 5 };
type ChatMessage = { id: string; authorId: string; name: string; text: string; createdAt: string };
type RoomCharacter = { userId: string; name: string; avatar: string; x: number; z: number; action: string; online: boolean; birthdayToday: boolean; message: string };

export default function GenericRoom({ room }: { room: { slug: string; title: string; description: string } }) {
  const auth = useDtecAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [bubble, setBubble] = useState("");
  const [chatError, setChatError] = useState("");
  const [sending, setSending] = useState(false);
  const [characters, setCharacters] = useState<RoomCharacter[]>([]);
  const [sceneStart, setSceneStart] = useState(roomStart);
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const ownPosition = useRef({ x: roomStart.x, z: roomStart.z, action: "idle" });
  const restoredUser = useRef<string | null>(null);
  const chatUrl = `/api/rooms/${room.slug}/chat`;
  const presenceUrl = `/api/rooms/${room.slug}/presence`;
  const positionKey = `${room.slug}:${auth.user?.id ?? "visitor"}`;
  const presenceReady = restoredKey === positionKey;
  const bubbleCutoff = Date.now() - 5000;
  const visibleCharacters = characters.filter((character) => character.userId !== auth.user?.id).map((character) => ({
    ...character,
    message: [...messages].reverse().find((message) => message.authorId === character.userId && Date.parse(message.createdAt) > bubbleCutoff)?.text ?? "",
  }));

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(chatUrl, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { messages?: ChatMessage[] };
        if (active) setMessages(body.messages ?? []);
      } catch { /* retry on the next poll */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chatUrl]);

  useEffect(() => {
    let active = true;
    const loadPresence = async () => {
      try {
        const response = await fetch(presenceUrl, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { users?: RoomCharacter[] };
        if (!active) return;
        const users = body.users ?? [];
        setCharacters(users);
        const own = users.find((user) => user.userId === auth.user?.id);
        if (auth.user && restoredUser.current !== positionKey) {
          restoredUser.current = positionKey;
          const start = own ? { x: own.x, z: own.z } : roomStart;
          ownPosition.current = { ...start, action: "idle" };
          setSceneStart(start);
          setRestoredKey(positionKey);
        }
      } catch { /* retry on the next poll */ }
    };
    void loadPresence();
    const timer = window.setInterval(() => void loadPresence(), 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [auth.user, presenceUrl, positionKey]);

  useEffect(() => {
    if (auth.state !== "ready" || !presenceReady) return;
    const publish = () => void fetch(presenceUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ownPosition.current), keepalive: true }).catch(() => {});
    publish();
    const timer = window.setInterval(publish, 2500);
    return () => window.clearInterval(timer);
  }, [auth.state, presenceUrl, presenceReady]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatText.trim() || sending) return;
    setSending(true); setChatError("");
    try {
      const response = await fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: chatText }) });
      const body = await response.json() as { message?: ChatMessage; error?: string };
      if (!response.ok || !body.message) throw new Error("Não foi possível enviar a mensagem.");
      setMessages((current) => [...current, body.message!].slice(-5));
      setBubble(body.message.text);
      window.setTimeout(() => setBubble(""), 5000);
      setChatText("");
    } catch (failure) {
      setChatError(failure instanceof Error ? failure.message : "Falha ao enviar.");
    } finally { setSending(false); }
  };
  return <main className="lobby-shell">
    <OfficeScene environment="lobby" name={auth.profile?.displayName ?? "Visitante"} avatar={auth.profile?.avatarId ?? "r"} action="idle" message={bubble} created={auth.state === "ready" && presenceReady} initialPosition={sceneStart} remoteUsers={visibleCharacters} birthdayToday={false} positionOwnerId={positionKey} onStateChange={(x, z, action) => { ownPosition.current = { x, z, action: action === "dance" ? "dance" : ["walk", "sit"].includes(action) ? action : "idle" }; }} onCharacterClick={() => {}} onMuralClick={() => {}} />
    <div className="shade" aria-hidden="true" />
    {boardOpen && <RoomBoard roomSlug={room.slug} currentUserId={auth.state === "ready" ? auth.user?.id ?? null : null} onClose={() => setBoardOpen(false)} />}
    <button type="button" className="room-board-open" onClick={() => setBoardOpen(true)}>Quadro de avisos</button>
    <header className="lobby-header"><Link href="/" className="lobby-brand">CuboChat</Link>{auth.state === "anonymous" ? <Link href={`/auth/login?next=/${room.slug}`} className="lobby-login">Entrar com Google</Link> : auth.state === "ready" ? <button type="button" className="lobby-login" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>{auth.profile?.displayName.split(" ")[0]} ▾</button> : auth.state === "authenticated-needs-profile" ? <Link href="/" className="lobby-login">Completar perfil</Link> : null}</header>
    {accountOpen && auth.state === "ready" && <nav className="account-menu" aria-label="Menu da conta"><strong>{auth.profile?.displayName}</strong><Link href="/?create=1" className="account-menu-link">Criar meu CuboChat</Link><button type="button" disabled title="Instalação do aplicativo em preparação">Instalar aplicativo <small>Em breve</small></button><button type="button" onClick={() => void auth.signOut()}>Sair da conta</button></nav>}
    <section className="lobby-panel" aria-labelledby="room-title"><p className="lobby-eyebrow">Sala /{room.slug}</p><h1 id="room-title">{room.title}</h1><p>{room.description || "Um espaço para reunir pessoas."}</p><div className="lobby-chat-history" aria-label="Últimas mensagens">{messages.length ? messages.map((message) => <p key={message.id}><strong>{message.name}:</strong> {message.text}</p>) : <small>Nenhuma mensagem nesta sala.</small>}</div>{auth.state === "ready" ? <form className="lobby-chat-form" onSubmit={(event) => void sendMessage(event)}><input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={100} placeholder="Escreva uma mensagem" aria-label="Mensagem" /><button disabled={sending || !chatText.trim()}>Enviar</button></form> : <small>Entre com Google para conversar.</small>}{chatError && <small role="alert">{chatError}</small>}<small>Os personagens desta sala atualizam a posição periodicamente; outras interações ainda estão em preparação.</small><div className="lobby-actions"><Link href="/" className="lobby-secondary">Voltar à entrada</Link></div></section>
  </main>;
}
