"use client";

import { useEffect, useState } from "react";
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
import { formatBirthday, orderBirthdays, saoPauloMonthDay } from "@/lib/birthdays/order";

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

type MuralMessage = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

function RecadosContent({ currentUserId }: { currentUserId: string | null }) {
  const [messages, setMessages] = useState<MuralMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [messageText, setMessageText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

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
        ? current.map((message) => message.id === editingId ? body.message! : message)
        : [body.message!, ...current]);
      setMessageText("");
      setEditingId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o recado.");
    } finally {
      setSaving(false);
    }
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
              </article>)}
            </div>
          )}
          <p className="mural-privacy-note">Recados visíveis a qualquer pessoa autenticada com Google. Você pode editar ou excluir os seus.</p>
        </>
      )}
    </section>
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
}: {
  muralId: MuralId;
  onClose: () => void;
  currentUserId: string | null;
}) {
  const [folderIndex, setFolderIndex] = useState<number | null>(null);
  const mural = muralInfo[muralId];
  const folder = folderIndex === null ? null : mural.folders[folderIndex];
  const Icon = mural.Icon;
  const FolderIcon = folder?.Icon;

  return (
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
            {mural.folders.map((item, index) => (
              <button
                className="mural-folder-card"
                key={item.title}
                onClick={() => setFolderIndex(index)}
                type="button"
              >
                <span className="mural-folder-icon"><item.Icon aria-hidden="true" /></span>
                <span className="mural-folder-copy">
                  <strong>{item.title}</strong>
                  <small>{item.summary}</small>
                </span>
                <ChevronRight className="mural-folder-arrow" size={16} aria-hidden="true" />
              </button>
            ))}
            </div>
            <div className="mural-notice"><Megaphone size={16} aria-hidden="true"/><span>As informações aparecerão aqui quando forem cadastradas.</span></div>
          </div>
        )}

        <footer className="mural-statusbar">
          <UsersRound size={14} aria-hidden="true" />
          <span>{muralId === "birthdays"
            ? "Lista opcional · apenas dia e mês · ordenada pelo próximo aniversário"
            : muralId === "information" && folderIndex === 0
            ? "Recados compartilhados entre contas Google autenticadas"
            : "Interface 2D leve · Esta seção ainda não possui dados cadastrados"}</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
