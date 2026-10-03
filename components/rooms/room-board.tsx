"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { EventsFolder } from "@/components/mural/events-folder";
import { FundraisersFolder } from "@/components/mural/fundraisers-folder";
import { RoomBirthdays } from "@/components/rooms/room-birthdays";
import { RoomBoardOverview } from "@/components/rooms/room-board-overview";

type Notice = { id: string; authorId: string; authorName: string; content: string; isPinned: boolean; createdAt: string; likeCount: number; dislikeCount: number; myReaction: "like" | "dislike" | null };
type Person = { userId: string; name: string };
type Props = { roomSlug: string; currentUserId: string | null; onClose: () => void };

async function read<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? "Entre com Google para continuar." : response.status === 403 ? "Você não tem permissão nesta sala." : "Não foi possível concluir. Tente novamente.");
  return body as T;
}

export function RoomBoard(props: Props) {
  // Changing rooms or signing out discards old private state and cancels pending reads.
  return <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
    <DialogContent className="room-board mural-window-retro" overlayClassName="mural-overlay" showCloseButton={false}>
      <header className="room-board-titlebar">
        <div><DialogTitle>Quadro de avisos</DialogTitle><DialogDescription>Sala /{props.roomSlug} · interface 2D leve</DialogDescription></div>
        <DialogClose aria-label="Fechar quadro">×</DialogClose>
      </header>
      <BoardContent key={`${props.roomSlug}:${props.currentUserId ?? "visitor"}`} {...props} />
    </DialogContent>
  </Dialog>;
}

function BoardContent({ roomSlug, currentUserId }: Props) {
  const [section, setSection] = useState<"overview" | "notices" | "events" | "fundraisers" | "birthdays">("overview");
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    void fetch(`/api/rooms/${roomSlug}/staff`, { cache: "no-store" })
      .then((response) => read<{ canManage: boolean }>(response))
      .then((body) => { if (active) setCanManage(body.canManage); }).catch(() => {});
    return () => { active = false; };
  }, [roomSlug, currentUserId]);
  if (!currentUserId) return <div className="room-board-body mural-access-note"><p>Entre com Google para consultar os avisos, eventos e vaquinhas.</p><Link className="mural-primary-button" href={`/auth/login?next=/${roomSlug}`}>Entrar com Google</Link></div>;
  return <>
    <nav className="room-board-tabs" aria-label="Seções do quadro">
      {([["overview", "Visão geral"], ["notices", "Recados"], ["events", "Eventos"], ["fundraisers", "Vaquinhas"], ["birthdays", "Aniversariantes"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>)}
    </nav>
    <div className="room-board-body">
      {section === "overview" && <RoomBoardOverview roomSlug={roomSlug} onOpen={setSection} />}
      {section === "notices" && <Notices roomSlug={roomSlug} currentUserId={currentUserId} canManage={canManage} />}
      {section === "events" && <EventsFolder roomSlug={roomSlug} currentUserId={currentUserId} canManage={canManage} />}
      {section === "fundraisers" && <FundraisersFolder roomSlug={roomSlug} currentUserId={currentUserId} isAdminOrMod={canManage} />}
      {section === "birthdays" && <RoomBirthdays roomSlug={roomSlug} currentUserId={currentUserId} />}
    </div>
  </>;
}

export function Notices({ roomSlug, currentUserId, canManage, folderId, folderOptions = [] }: { roomSlug: string; currentUserId: string; canManage: boolean; folderId?: string; folderOptions?: {id:string;title:string}[] }) {
  const api = `/api/rooms/${roomSlug}/mural/messages`;
  const listApi = folderId ? `${api}?folder=${folderId}` : api;
  const [messages, setMessages] = useState<Notice[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [destination,setDestination] = useState(folderId ?? "");
  const [composing,setComposing] = useState(!folderId);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [people, setPeople] = useState<{ label: string; users: Person[]; loading: boolean } | null>(null);
  const active = React.useRef(true);
  const rosterRequest = React.useRef(0);
  useEffect(() => {
    active.current = true;
    void fetch(listApi, { cache: "no-store" }).then((r) => read<{ messages: Notice[] }>(r))
      .then((body) => { if (active.current) setMessages(body.messages); })
      .catch((reason: Error) => { if (active.current) setError(reason.message); })
      .finally(() => { if (active.current) setLoading(false); });
    return () => { active.current = false; };
  }, [listApi]);
  const refresh = async () => {
    const body = await read<{ messages: Notice[] }>(await fetch(listApi, { cache: "no-store" }));
    if (active.current) setMessages(body.messages);
  };
  const mutate = async (url: string, method: string, body?: unknown) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await read(await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
      await refresh();
      if (active.current && (method === "POST" || (method === "PATCH" && body && Object.hasOwn(body, "content")))) { setText(""); setEditingId(null); if(folderId)setComposing(false); }
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Falha ao salvar."); }
    finally { if (active.current) setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) void mutate(editingId ? `${api}/${editingId}` : api, editingId ? "PATCH" : "POST", { content: text, ...(destination?{boardNodeId:destination}:{}) });
  };
  const showPeople = async (notice: Notice, type: "like" | "dislike") => {
    const requestId = ++rosterRequest.current;
    setPeople({ label: type === "like" ? "Curtiram" : "Descurtiram", users: [], loading: true });
    try {
      const body = await read<{ people: Person[] }>(await fetch(`${api}/${notice.id}/reactions?type=${type}`, { cache: "no-store" }));
      if (active.current && requestId === rosterRequest.current) setPeople({ label: type === "like" ? "Curtiram" : "Descurtiram", users: body.people, loading: false });
    } catch (reason) {
      if (active.current && requestId === rosterRequest.current) { setPeople(null); setError(reason instanceof Error ? reason.message : "Falha ao carregar pessoas."); }
    }
  };
  return <section className="room-notices" aria-label="Recados da sala">
    {folderId&&!composing&&<button type="button" className="mural-primary-button" onClick={()=>{setComposing(true);setDestination(folderId);}}>+ Inserir nota</button>}
    {composing&&<form onSubmit={submit} className="room-notice-form">
      <label htmlFor="room-notice-text">{editingId ? "Editar nota" : folderId ? "Nova nota — título na primeira linha" : "Novo recado"}</label>
      <textarea id="room-notice-text" rows={2} required maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} />
      {editingId&&folderOptions.length>0&&<label>Mover para<select value={destination} onChange={event=>setDestination(event.target.value)}>{folderOptions.map(folder=><option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label>}
      <div><button disabled={busy || !text.trim()} className="mural-primary-button">{editingId ? "Salvar recado" : "Publicar recado"}</button>{(editingId||folderId) && <button type="button" onClick={() => { setEditingId(null); setText(""); if(folderId)setComposing(false); }}>Cancelar edição</button>}</div>
    </form>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p>Carregando recados…</p> : messages.length === 0 ? <p>Nenhum recado nesta sala.</p> : messages.map((notice) => <article key={notice.id} className="room-notice">
      <header><strong>{notice.authorName}</strong><time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleDateString("pt-BR")}</time>{notice.isPinned && <small>Fixado</small>}</header>
      <p>{notice.content}</p>
      <div className="room-notice-actions">
        {(["like", "dislike"] as const).map((type) => <span key={type}><button type="button" disabled={busy} aria-pressed={notice.myReaction === type} aria-label={type === "like" ? "Curtir recado" : "Descurtir recado"} onClick={() => void mutate(`${api}/${notice.id}/reactions`, "PUT", { reaction: type })}>{type === "like" ? "👍" : "👎"}</button><button type="button" onClick={() => void showPeople(notice, type)}>{type === "like" ? `Curtidas: ${notice.likeCount}` : `Descurtidas: ${notice.dislikeCount}`}</button></span>)}
        {(canManage || (notice.authorId === currentUserId && !notice.isPinned)) && <><button type="button" disabled={busy} onClick={() => { setComposing(true);setDestination(folderId??"");setEditingId(notice.id); setText(notice.content); }}>Editar</button><button type="button" disabled={busy} onClick={() => { if (window.confirm("Excluir este recado?")) void mutate(`${api}/${notice.id}`, "DELETE"); }}>Excluir</button></>}
        {canManage && <button type="button" disabled={busy} onClick={() => void mutate(`${api}/${notice.id}`, "PATCH", { isPinned: !notice.isPinned })}>{notice.isPinned ? "Desafixar" : "Fixar"}</button>}
      </div>
    </article>)}
    <Dialog open={people !== null} onOpenChange={(open) => { if (!open) { ++rosterRequest.current; setPeople(null); } }}>
      <DialogContent><DialogTitle>{people?.label ?? "Reações"}</DialogTitle><DialogDescription>Pessoas que reagiram a este recado.</DialogDescription>{people?.loading ? <p>Carregando…</p> : <ul>{people?.users.length ? people.users.map((person) => <li key={person.userId}>{person.name}</li>) : <li>Nenhuma reação ainda.</li>}</ul>}</DialogContent>
    </Dialog>
  </section>;
}
