"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CakeSlice,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Megaphone,
  MessageSquareText,
  Pencil,
  PartyPopper,
  Send,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MuralId } from "@/lib/mural-types";
import AvatarPreview from "@/components/avatar-preview";
import { EventsFolder } from "@/components/mural/events-folder";
import { FundraisersFolder } from "@/components/mural/fundraisers-folder";
import { MuralPeopleStack, type PeoplePreview } from "@/components/mural/people-stack";
import { formatBirthday, orderBirthdays, saoPauloMonthDay } from "@/lib/birthdays/order";
import type { MuralReaction } from "@/lib/mural-reactions";
import { createLatestRequest } from "@/lib/mural/latest-request";

type FolderInfo = {
  title: string;
  summary: string;
  emptyMessage: string;
  Icon: typeof FolderOpen;
};

type MuralInfo = {
  title: string;
  description: string;
  Icon: typeof Megaphone;
  folders: FolderInfo[];
};

const muralInfo: Record<MuralId, MuralInfo> = {
  information: {
    title: "Mural de Informações",
    description: "Recados, avisos e informações compartilhadas do ambiente.",
    Icon: Megaphone,
    folders: [
      { title: "Recados", summary: "Mensagens da equipe.", emptyMessage: "Os recados publicados pela equipe aparecerão aqui.", Icon: Megaphone },
      { title: "Comunicados", summary: "Avisos importantes.", emptyMessage: "Os comunicados oficiais aparecerão aqui.", Icon: ClipboardList },
      { title: "Lembretes", summary: "Datas para acompanhar.", emptyMessage: "Os lembretes da equipe aparecerão aqui.", Icon: CakeSlice },
      { title: "Vaquinhas", summary: "Iniciativas coletivas.", emptyMessage: "As vaquinhas abertas aparecerão aqui.", Icon: UsersRound },
    ],
  },
  demands: {
    title: "Lembretes",
    description: "Acompanhe itens e tarefas que o grupo precisa lembrar.",
    Icon: ClipboardList,
    folders: [
      { title: "Equipamentos", summary: "Necessidades de equipamentos.", emptyMessage: "As demandas de equipamentos aparecerão aqui.", Icon: ClipboardList },
      { title: "Solicitações", summary: "Pedidos para acompanhar.", emptyMessage: "As solicitações da equipe aparecerão aqui.", Icon: FolderOpen },
      { title: "Atividades da equipe", summary: "Tarefas compartilhadas.", emptyMessage: "As atividades cadastradas aparecerão aqui.", Icon: UsersRound },
    ],
  },
  leisure: {
    title: "Lazer",
    description: "Atividades sociais e interesses da equipe.",
    Icon: PartyPopper,
    folders: [
      { title: "Futebol", summary: "Partidas e interesse da equipe.", emptyMessage: "Os eventos e a lista de interessados aparecerão aqui. Interesse não confirma presença.", Icon: PartyPopper },
      { title: "Paintball", summary: "Atividades e eventos.", emptyMessage: "Os eventos e a lista de interessados aparecerão aqui. Interesse não confirma presença.", Icon: PartyPopper },
      { title: "Kart", summary: "Sugestões e atividades.", emptyMessage: "Os eventos e a lista de interessados aparecerão aqui. Interesse não confirma presença.", Icon: PartyPopper },
      { title: "Confraternizações", summary: "Encontros da equipe.", emptyMessage: "As confraternizações cadastradas aparecerão aqui.", Icon: UsersRound },
    ],
  },
  birthdays: {
    title: "Aniversariantes",
    description: "Próximas datas da equipe, em ordem a partir de hoje.",
    Icon: CakeSlice,
    folders: [],
  },
};

const participationFolders: Record<MuralId, string[]> = {
  information: ["recados", "comunicados", "lembretes", "vaquinhas"],
  demands: ["equipamentos", "solicitacoes", "atividades"],
  leisure: ["futebol", "paintball", "kart", "confraternizacoes"],
  birthdays: [],
};

type ParticipationPerson = { userId: string; name: string; title: string; photoUrl: string | null };

type MuralMessage = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  dislikeCount: number;
  myReaction: MuralReaction | null;
};

type ReactionPerson = { userId: string; name: string; avatar: string };

function RecadosContent({ currentUserId }: { currentUserId: string | null }) {
  const [messages, setMessages] = useState<MuralMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [reactionDialog, setReactionDialog] = useState<{ messageId: string; type: MuralReaction } | null>(null);
  const [reactionPeople, setReactionPeople] = useState<ReactionPerson[]>([]);
  const [reactionLoading, setReactionLoading] = useState(false);
  const [reactionError, setReactionError] = useState("");

  useEffect(() => {
    if (!currentUserId) {
      window.setTimeout(() => setLoading(false), 0);
      return;
    }
    let active = true;
    fetch("/api/mural/messages", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { messages?: MuralMessage[]; error?: string };
        if (!response.ok) throw new Error(body.error === "unauthorized" ? "Entre com o Google para consultar os recados." : "Não foi possível carregar o mural agora.");
        if (active) setMessages(body.messages ?? []);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os recados.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUserId]);

  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = messageText.trim();
    if (!content || !currentUserId || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch(editingId ? `/api/mural/messages/${editingId}` : "/api/mural/messages", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await response.json() as { message?: MuralMessage; error?: string };
      if (!response.ok || !body.message) throw new Error(body.error && !body.error.includes("failed") ? body.error : "Não foi possível salvar o recado.");
      setMessages((current) => editingId
        ? current.map((message) => message.id === editingId ? { ...message, ...body.message! } : message)
        : [{ ...body.message!, likeCount: 0, dislikeCount: 0, myReaction: null }, ...current]);
      setMessageText("");
      setEditingId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o recado.");
    } finally {
      setSaving(false);
    }
  };

  const toggleReaction = async (message: MuralMessage, reaction: MuralReaction) => {
    try {
      const response = await fetch(`/api/mural/messages/${message.id}/reactions`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reaction }),
      });
      const body = await response.json() as { likeCount?: number; dislikeCount?: number; myReaction?: MuralReaction | null };
      if (!response.ok) throw new Error("Não foi possível registrar sua reação.");
      setMessages((items) => items.map((item) => item.id === message.id ? {
        ...item, likeCount: body.likeCount ?? item.likeCount, dislikeCount: body.dislikeCount ?? item.dislikeCount,
        myReaction: body.myReaction ?? null,
      } : item));
    } catch {
      setFormError("Não foi possível registrar sua reação. Tente novamente.");
    }
  };

  const showReactionPeople = async (messageId: string, type: MuralReaction) => {
    setReactionDialog({ messageId, type });
    setReactionPeople([]);
    setReactionError("");
    setReactionLoading(true);
    try {
      const response = await fetch(`/api/mural/messages/${messageId}/reactions?type=${type}`, { cache: "no-store" });
      const body = await response.json() as { people?: ReactionPerson[] };
      if (!response.ok) throw new Error("Não foi possível consultar as reações.");
      setReactionPeople(body.people ?? []);
    } catch (error) {
      setReactionError(error instanceof Error ? error.message : "Não foi possível consultar as reações.");
    } finally { setReactionLoading(false); }
  };

  const deleteMessage = async (message: MuralMessage) => {
    if (!window.confirm("Excluir este recado?")) return;
    setFormError("");
    try {
      const response = await fetch(`/api/mural/messages/${message.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível excluir o recado.");
      setMessages((current) => current.filter((item) => item.id !== message.id));
      if (editingId === message.id) { setEditingId(null); setMessageText(""); }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível excluir o recado.");
    }
  };

  return (
    <>
    <section className="mural-folder-content mural-recados" aria-live="polite">
      <div className="mural-breadcrumb"><span>Mural de Informações</span><ChevronRight size={14} /><strong>Recados</strong></div>
      {!currentUserId ? (
        <div className="mural-access-note"><MessageSquareText aria-hidden="true" /><strong>Entre com o Google para acessar os recados.</strong><span>Qualquer conta Google pode participar do mural.</span></div>
      ) : (
        <>
          <form className="mural-composer" onSubmit={submitMessage}>
            <label htmlFor="mural-message-input">{editingId ? "Editar recado" : "Novo recado"}</label>
            <textarea id="mural-message-input" value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={1000} rows={3} placeholder="Compartilhe uma informação com a equipe…" required />
            <div className="mural-composer-actions"><small>{messageText.length}/1000</small><div>{editingId && <button type="button" className="mural-secondary-button" onClick={() => { setEditingId(null); setMessageText(""); setFormError(""); }}>Cancelar</button>}<button type="submit" className="mural-primary-button" disabled={saving || !messageText.trim()}><Send size={14} aria-hidden="true" />{saving ? "Salvando…" : editingId ? "Salvar alteração" : "Publicar recado"}</button></div></div>
            {formError && <p className="mural-form-error" role="alert">{formError}</p>}
          </form>
          {loading ? <p className="mural-loading">Carregando recados…</p> : loadError ? <p className="mural-form-error" role="alert">{loadError}</p> : messages.length === 0 ? (
            <div className="mural-no-messages"><MessageSquareText size={22} aria-hidden="true" /><strong>O mural ainda está vazio</strong><span>Seu recado pode ser o primeiro.</span></div>
          ) : (
            <div className="mural-message-list">
              {messages.map((message) => <article className="mural-message-card" key={message.id}>
                <div className="mural-message-heading"><div><strong>{message.authorName}</strong><time dateTime={message.createdAt}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))}</time></div>{message.authorId === currentUserId && <div className="mural-message-actions"><button type="button" aria-label="Editar recado" title="Editar" onClick={() => { setEditingId(message.id); setMessageText(message.content); setFormError(""); }}><Pencil size={14} /></button><button type="button" aria-label="Excluir recado" title="Excluir" onClick={() => void deleteMessage(message)}><Trash2 size={14} /></button></div>}</div>
                <p className="mural-message-body">{message.content}</p>
                <div className="mural-reaction-row" aria-label="Reações ao recado">
                  <button type="button" className={`mural-reaction-toggle ${message.myReaction === "like" ? "is-selected" : ""}`} aria-label="Curtir recado" aria-pressed={message.myReaction === "like"} onClick={() => void toggleReaction(message, "like")}><ThumbsUp size={15} aria-hidden="true" /></button>
                  <button type="button" className="mural-reaction-count" aria-label={`Ver quem curtiu: ${message.likeCount}`} onClick={() => void showReactionPeople(message.id, "like")}>{message.likeCount}</button>
                  <button type="button" className={`mural-reaction-toggle ${message.myReaction === "dislike" ? "is-selected" : ""}`} aria-label="Descurtir recado" aria-pressed={message.myReaction === "dislike"} onClick={() => void toggleReaction(message, "dislike")}><ThumbsDown size={15} aria-hidden="true" /></button>
                  <button type="button" className="mural-reaction-count" aria-label={`Ver quem descurtiu: ${message.dislikeCount}`} onClick={() => void showReactionPeople(message.id, "dislike")}>{message.dislikeCount}</button>
                </div>
              </article>)}
            </div>
          )}
          <p className="mural-privacy-note">Recados visíveis a qualquer pessoa autenticada com Google. Você pode editar ou excluir os seus.</p>
        </>
      )}
    </section>
    <Dialog open={reactionDialog !== null} onOpenChange={(open) => { if (!open) setReactionDialog(null); }}>
      <DialogContent className="mural-reaction-dialog">
        <DialogHeader>
          <DialogTitle>{reactionDialog?.type === "dislike" ? "Quem descurtiu" : "Quem curtiu"}</DialogTitle>
          <DialogDescription>Lista de colegas autenticados que reagiram a este recado.</DialogDescription>
        </DialogHeader>
        {reactionLoading ? <p className="mural-loading">Carregando…</p> : reactionError ? <p className="mural-form-error" role="alert">{reactionError}</p> : reactionPeople.length ? (
          <ul className="mural-reaction-people">{reactionPeople.map((person) => <li key={person.userId}><AvatarPreview model={person.avatar} headOnly /><strong>{person.name}</strong></li>)}</ul>
        ) : <p className="mural-loading">Ainda não há reações deste tipo.</p>}
      </DialogContent>
    </Dialog>
    </>
  );
}

type BirthdayPerson = { userId: string; name: string; avatar: string; title: string; birthDayMonth: string };

function BirthdayDirectory({ currentUserId }: { currentUserId: string | null }) {
  const [people, setPeople] = useState<BirthdayPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUserId) { window.setTimeout(() => setLoading(false), 0); return; }
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/birthdays", { cache: "no-store" });
        const body = await response.json() as { birthdays?: BirthdayPerson[] };
        if (!response.ok) throw new Error("Não foi possível carregar os aniversários.");
        if (active) setPeople(orderBirthdays(body.birthdays ?? [], saoPauloMonthDay()));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os aniversários.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    const refresh = window.setInterval(() => void load(), 60_000);
    return () => { active = false; clearInterval(refresh); };
  }, [currentUserId]);

  return <section className="birthday-directory" aria-live="polite">
    <div className="birthday-directory-heading"><CakeSlice size={20} aria-hidden="true" /><strong>Próximos aniversários</strong><span>Dia e mês</span></div>
    {!currentUserId ? <p className="mural-access-note">Entre com o Google para ver os aniversários cadastrados.</p>
      : loading ? <p className="mural-loading">Carregando a lista…</p>
      : error ? <p className="mural-form-error" role="alert">{error}</p>
      : people.length === 0 ? <div className="mural-no-messages"><CakeSlice size={21} /><strong>Nenhum aniversário cadastrado ainda</strong><span>Quem quiser pode adicionar apenas o dia e o mês no próprio perfil.</span></div>
      : <div className="birthday-members-list" aria-label="Aniversários em ordem cronológica">
        {people.map((person) => <article className="birthday-member" key={person.userId}>
          <AvatarPreview model={person.avatar} headOnly />
          <div className="birthday-member-name"><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</div>
          <time dateTime={person.birthDayMonth}>{formatBirthday(person.birthDayMonth)}</time>
        </article>)}
      </div>}
    <p className="birthday-directory-note">A lista começa pelo próximo aniversário; os que já passaram ficam no fim. A data é opcional e não inclui o ano.</p>
  </section>;
}

export default function MuralWindow({
  muralId,
  onClose,
  currentUserId,
  isAdminOrMod = false,
}: {
  muralId: MuralId;
  onClose: () => void;
  currentUserId: string | null;
  isAdminOrMod?: boolean;
}) {
  const [folderIndex, setFolderIndex] = useState<number | null>(null);
  const [participation, setParticipation] = useState<Record<string, PeoplePreview>>({});
  const [peopleTarget, setPeopleTarget] = useState<{ key: string; title: string } | null>(null);
  const [people, setPeople] = useState<ParticipationPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const peopleRequest = useRef(createLatestRequest<ParticipationPerson[]>());
  const mural = muralInfo[muralId];
  const folder = folderIndex === null ? null : mural.folders[folderIndex];
  const Icon = mural.Icon;
  const FolderIcon = folder?.Icon;

  useEffect(() => {
    if (!currentUserId || muralId === "birthdays" || folderIndex !== null) return;
    let active = true;
    fetch(`/api/mural/participation?mural=${muralId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("participation_unavailable");
        return response.json() as Promise<{ folders: Record<string, PeoplePreview> }>;
      })
      .then((body) => { if (active) setParticipation(body.folders); })
      .catch(() => { if (active) setParticipation({}); });
    return () => { active = false; };
  }, [currentUserId, muralId, folderIndex]);

  useEffect(() => () => peopleRequest.current.invalidate(), [currentUserId]);

  const openPeople = (key: string, title: string) => {
    setPeopleTarget({ key, title });
    setPeople([]);
    setPeopleError("");
    setPeopleLoading(true);
    void peopleRequest.current.run(async () => {
      const response = await fetch(`/api/mural/participation?mural=${muralId}&folder=${key}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar a lista agora.");
      const body = await response.json() as { people: ParticipationPerson[] };
      return body.people;
    }, setPeople, (error) => {
      setPeopleError(error instanceof Error ? error.message : "Não foi possível carregar a lista agora.");
    }, () => setPeopleLoading(false));
  };

  return (
    <>
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="mural-dialog mural-window-retro" overlayClassName="mural-overlay">
        <div className="mural-titlebar">
          <span className="mural-title-icon"><Icon aria-hidden="true" /></span>
          <DialogHeader className="mural-heading">
            <DialogTitle>{folder?.title ?? mural.title}</DialogTitle>
            <DialogDescription>{folder?.summary ?? mural.description}</DialogDescription>
          </DialogHeader>
          {folder && (
            <button className="mural-back" onClick={() => setFolderIndex(null)} type="button">
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
        </div>

        {muralId === "birthdays" ? (
          <BirthdayDirectory currentUserId={currentUserId} />
        ) : folder && muralId === "information" && folderIndex === 0 ? (
          <RecadosContent currentUserId={currentUserId} />
        ) : folder && muralId === "information" && folder.title === "Vaquinhas" ? (
          <FundraisersFolder currentUserId={currentUserId} isAdminOrMod={isAdminOrMod} />
        ) : folder && muralId === "leisure" && folder.title === "Futebol" ? (
          <EventsFolder currentUserId={currentUserId} category="futebol" />
        ) : folder && muralId === "leisure" && folder.title === "Paintball" ? (
          <EventsFolder currentUserId={currentUserId} category="paintball" />
        ) : folder && muralId === "leisure" && folder.title === "Kart" ? (
          <EventsFolder currentUserId={currentUserId} category="kart" />
        ) : folder ? (
          <section className="mural-folder-content" aria-live="polite">
            <div className="mural-breadcrumb"><span>{mural.title}</span><ChevronRight size={14} /><strong>{folder.title}</strong></div>
            <div className="mural-empty-state">
              <div className="mural-empty-icon">{FolderIcon && <FolderIcon aria-hidden="true" />}</div>
              <h3>Nenhum item por enquanto</h3>
              <p>{folder.emptyMessage}</p>
            </div>
            <span className="mural-demo-label">Prévia da organização — ainda sem dados compartilhados</span>
          </section>
        ) : (
          <div className="mural-dashboard" aria-label={`Seções de ${mural.title}`}>
            <div className="mural-dashboard-heading">
              <div><strong>{mural.title}</strong><small>Escolha uma seção para consultar.</small></div>
            </div>
            <div className="mural-folder-list">
            {mural.folders.map((item, index) => {
              const key = participationFolders[muralId][index];
              const preview = currentUserId ? participation[key] : undefined;
              return <div className={`mural-folder-card ${preview && preview.count > 0 ? "has-people" : ""}`} key={item.title}>
                <button className="mural-folder-open" onClick={() => setFolderIndex(index)} type="button">
                  <span className="mural-folder-icon"><item.Icon aria-hidden="true" /></span>
                  <span className="mural-folder-copy"><strong>{item.title}</strong><small>{item.summary}</small></span>
                </button>
                {preview && preview.count > 0 && <MuralPeopleStack title={item.title} count={preview.count} photos={preview.photos}
                  onClick={() => openPeople(key, item.title)} />}
                <button className="mural-folder-arrow-button" type="button" aria-label={`Abrir ${item.title}`} onClick={() => setFolderIndex(index)}>
                  <ChevronRight className="mural-folder-arrow" size={16} aria-hidden="true" />
                </button>
              </div>;
            })}
            </div>
            <div className="mural-notice"><Megaphone size={16} aria-hidden="true"/><span>{currentUserId && Object.values(participation).some((item) => item.count > 0)
              ? "Toque nas fotos para ver quem participa; abra a seção para ler os detalhes."
              : "As informações aparecerão aqui quando forem cadastradas."}</span></div>
          </div>
        )}

        <footer className="mural-statusbar">
          <UsersRound size={14} aria-hidden="true" />
          <span>{muralId === "birthdays"
            ? "Lista opcional · apenas dia e mês · ordenada pelo próximo aniversário"
            : muralId === "information" && folderIndex === 0
            ? "Recados compartilhados entre contas Google autenticadas"
            : folderIndex === null && currentUserId && Object.values(participation).some((item) => item.count > 0)
            ? "Prévia de participação · toque nas fotos para ver detalhes"
            : "Interface 2D leve · Esta seção ainda não possui dados cadastrados"}</span>
        </footer>
      </DialogContent>
    </Dialog>
    <Dialog open={peopleTarget !== null && Boolean(currentUserId)} onOpenChange={(open) => { if (!open) { peopleRequest.current.invalidate(); setPeopleTarget(null); } }}>
      <DialogContent className="mural-people-dialog">
        <DialogHeader>
          <DialogTitle>Pessoas em {peopleTarget?.title}</DialogTitle>
          <DialogDescription>{peopleTarget?.key === "recados" ? "Autores e pessoas que reagiram aos recados." : peopleTarget?.key === "vaquinhas" ? "Participantes ativos das vaquinhas." : "Pessoas interessadas nos eventos abertos."}</DialogDescription>
        </DialogHeader>
        {peopleLoading ? <p className="mural-loading">Carregando pessoas…</p>
          : peopleError ? <p className="mural-form-error" role="alert">{peopleError}</p>
          : <ul className="mural-people-list">{people.map((person) => <li key={person.userId}>
            <span className="mural-people-detail-photo">
              {person.photoUrl ? <Image src={person.photoUrl} alt="" width={42} height={42} unoptimized referrerPolicy="no-referrer" />
                : <UserRound size={22} aria-hidden="true" />}
            </span>
            <span><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span>
          </li>)}</ul>}
      </DialogContent>
    </Dialog>
    </>
  );
}
