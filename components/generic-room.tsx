"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { useDtecAuth } from "@/hooks/use-dtec-auth";
import { RoomBoard } from "@/components/rooms/room-board";
import { AccountControls } from "@/components/profile/account-controls";
import { RoomPeople } from "@/components/rooms/room-people";
import { useRoomChatViewport } from "@/hooks/use-room-chat-viewport";
import styles from "@/components/rooms/room-chat.module.css";

const OfficeScene = dynamic(() => import("@/components/office-scene"), { ssr: false });
const roomStart = { x: 0, z: 5 };
type ChatMessage = { id: string; authorId: string; name: string; text: string; createdAt: string };
type RoomCharacter = { userId: string; name: string; avatar: string; x: number; z: number; action: string; online: boolean; birthdayToday: boolean; message: string };

export default function GenericRoom({ room }: { room: { slug: string; title: string; description: string } }) {
  const auth = useDtecAuth();
  const [boardOpen, setBoardOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{ scope: string; id: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatRevision = useRef(0);
  const [bubbleCutoff, setBubbleCutoff] = useState(0);
  const [chatText, setChatText] = useState("");
  const [bubble, setBubble] = useState("");
  const [chatError, setChatError] = useState("");
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { rootRef: chatRootRef, onFocus: chatOnFocus, onBlur: chatOnBlur } = useRoomChatViewport();
  const [characters, setCharacters] = useState<RoomCharacter[]>([]);
  const [sceneStart, setSceneStart] = useState(roomStart);
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const ownPosition = useRef({ x: roomStart.x, z: roomStart.z, action: "idle" });
  const restoredUser = useRef<string | null>(null);
  const chatUrl = `/api/rooms/${room.slug}/chat`;
  const presenceUrl = `/api/rooms/${room.slug}/presence`;
  const positionKey = `${room.slug}:${auth.user?.id ?? "visitor"}`;
  const peopleScope = `${positionKey}:${auth.state}`;
  const presenceReady = restoredKey === positionKey;
  const ownBirthdayToday = Boolean(characters.find((character) => character.userId === auth.user?.id)?.birthdayToday);
  const visibleCharacters = characters.filter((character) => character.userId !== auth.user?.id).map((character) => ({
    ...character,
    message: [...messages].reverse().find((message) => message.authorId === character.userId && Date.parse(message.createdAt) > bubbleCutoff)?.text ?? "",
  }));

  useEffect(() => {
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (!active || loading) return;
      loading = true;
      const revision = chatRevision.current;
      try {
        const response = await fetch(chatUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const body = await response.json() as { messages?: ChatMessage[] };
        if (active && revision === chatRevision.current) { setMessages(body.messages ?? []); setBubbleCutoff(Date.now() - 5000); }
      } catch { /* retry on the next poll */ }
      finally { loading = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [chatUrl]);

  useEffect(() => {
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const loadPresence = async () => {
      // A delayed snapshot must finish before another poll can overtake it.
      if (!active || loading) return;
      loading = true;
      try {
        const response = await fetch(presenceUrl, { cache: "no-store", signal: controller.signal });
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
      finally { loading = false; }
    };
    void loadPresence();
    const timer = window.setInterval(() => void loadPresence(), 2500);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
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
      // A read started before this acknowledgement cannot undo the send.
      chatRevision.current++;
      const sentMessage = body.message;
      setMessages((current) => [...current.filter((message) => message.id !== sentMessage.id), sentMessage].slice(-5));
      setBubble(body.message.text);
      window.setTimeout(() => setBubble(""), 5000);
      setChatText("");
    } catch (failure) {
      setChatError(failure instanceof Error ? failure.message : "Falha ao enviar.");
    } finally { setSending(false); }
  };
  return <main ref={chatRootRef} className={`lobby-shell ${styles.shell}`}>
    <OfficeScene environment="lobby" name={auth.profile?.displayName ?? "Visitante"} avatar={auth.profile?.avatarId ?? "r"} action="idle" message={bubble} created={auth.state === "ready" && presenceReady} initialPosition={sceneStart} remoteUsers={visibleCharacters} birthdayToday={ownBirthdayToday} positionOwnerId={positionKey} onStateChange={(x, z, action) => { ownPosition.current = { x, z, action: action === "dance" ? "dance" : ["walk", "sit"].includes(action) ? action : "idle" }; }} onCharacterClick={(id) => setSelectedPerson({ scope: peopleScope, id: id ?? auth.user?.id ?? "visitor" })} onMuralClick={() => {}} />
    <div className="shade" aria-hidden="true" />
    {boardOpen && <RoomBoard roomSlug={room.slug} currentUserId={auth.state === "ready" ? auth.user?.id ?? null : null} onClose={() => setBoardOpen(false)} />}
    <button type="button" className="room-board-open" onClick={() => setBoardOpen(true)}>Quadro de avisos</button>
    <header className="lobby-header"><Link href="/" className="lobby-brand">CuboChat</Link><RoomPeople roomSlug={room.slug} currentUserId={auth.state === "ready" ? auth.user?.id ?? null : null} characters={characters} selectedUserId={selectedPerson?.scope === peopleScope ? selectedPerson.id : null} onSelect={(id) => setSelectedPerson({ scope: peopleScope, id })} onClose={() => setSelectedPerson(null)} /><AccountControls auth={auth} loginNext={`/${room.slug}`} /></header>
    <section className={styles.panel} aria-labelledby="room-title">
      <div className={styles.header}><h1 id="room-title" title={room.title}>{room.title}</h1><button type="button" aria-expanded={historyOpen} aria-controls={`chat-history-${room.slug}`} onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Ocultar mensagens" : "Mostrar mensagens"}</button></div>
      <div id={`chat-history-${room.slug}`} className={styles.history} aria-label="Últimas mensagens" hidden={!historyOpen}>{messages.length ? messages.map((message) => <p key={message.id}><strong>{message.name}:</strong> {message.text}</p>) : <small>Nenhuma mensagem nesta sala.</small>}</div>
      {auth.state === "ready" ? <form className={styles.form} onSubmit={(event) => void sendMessage(event)}><input value={chatText} onChange={(event) => setChatText(event.target.value)} onFocus={chatOnFocus} onBlur={chatOnBlur} maxLength={100} placeholder="Escreva uma mensagem" aria-label="Mensagem" autoComplete="off" enterKeyHint="send" /><button disabled={sending || !chatText.trim()}>{sending ? "…" : "Enviar"}</button></form> : <small>Entre com Google para conversar.</small>}
      {chatError && <small role="alert">{chatError}</small>}
      <details className={styles.info}><summary>Sobre a sala /{room.slug}</summary><p>{room.description || "Um espaço para reunir pessoas."}</p><Link href="/">Voltar à entrada</Link></details>
    </section>
  </main>;
}
