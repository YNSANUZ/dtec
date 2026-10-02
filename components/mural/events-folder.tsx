"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, MapPin, PartyPopper, UsersRound } from "lucide-react";
import AvatarPreview from "@/components/avatar-preview";
import { eventLocalDateTime, toEventCardViewModel, type EventCardInput } from "@/lib/events/presentation";
import { normalizeRoomEvent } from "@/lib/events/validation";
import { MuralPeopleStack, type PeoplePreview } from "@/components/mural/people-stack";

type EventRecord = EventCardInput & { status: "open" | "closed" | "cancelled"; photos?: PeoplePreview["photos"] };
type InterestedPerson = { userId: string; name: string; avatar: string; title: string };
type InterestResponse = { interested?: InterestedPerson[]; isInterested?: boolean; error?: string };
type EventsResponse = { events?: EventRecord[]; error?: string };

type EventProps = { currentUserId: string | null; category?: EventRecord["category"]; roomSlug?: string; canManage?: boolean };

export function EventsFolder(props: EventProps) {
  return <ScopedEventsFolder key={`${props.roomSlug ?? "dtec"}:${props.currentUserId ?? "visitor"}:${props.category ?? "all"}`} {...props} />;
}

function ScopedEventsFolder({ currentUserId, category, roomSlug, canManage = false }: EventProps) {
  const api = roomSlug ? `/api/rooms/${roomSlug}/events` : "/api/events";
  const listApi = `${api}?includeArchived=1`;
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", location: "", startsAt: "", category: category ?? "outro" });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [people, setPeople] = useState<InterestedPerson[]>([]);
  const [isInterested, setIsInterested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rosterRequest = useRef(0);

  const loadEvents = useCallback(async () => {
    const response = await fetch(listApi, { cache: "no-store" });
    const body = await response.json() as EventsResponse;
    if (!response.ok) throw new Error(body.error === "unauthorized" ? "Entre com o Google para consultar os eventos." : "Não foi possível carregar os eventos agora.");
    setEvents(body.events ?? []);
  }, [listApi]);

  useEffect(() => {
    if (!currentUserId) { window.setTimeout(() => setLoading(false), 0); return; }
    let active = true;
    fetch(listApi, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as EventsResponse;
        if (!response.ok) throw new Error(body.error === "unauthorized" ? "Entre com o Google para consultar os eventos." : "Não foi possível carregar os eventos agora.");
        if (active) setEvents(body.events ?? []);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar eventos."); })
      .finally(() => { if (active) setLoading(false); });
    // This is a request counter, not a DOM node: invalidate every in-flight roster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { active = false; ++rosterRequest.current; };
  }, [currentUserId, listApi]);

  const loadRoster = async (eventId: string) => {
    const request = ++rosterRequest.current;
    setRosterLoading(true);
    try {
      const response = await fetch(`${api}/${eventId}/interest`, { cache: "no-store" });
      const body = await response.json() as InterestResponse;
      if (!response.ok) throw new Error("Não foi possível carregar os interessados.");
      if (request === rosterRequest.current) { setPeople(body.interested ?? []); setIsInterested(Boolean(body.isInterested)); }
    } catch (reason) { if (request === rosterRequest.current) setError(reason instanceof Error ? reason.message : "Falha ao carregar interessados."); }
    finally { if (request === rosterRequest.current) setRosterLoading(false); }
  };

  const chooseEvent = (event: EventRecord) => {
    const nextId = selectedId === event.id ? null : event.id;
    ++rosterRequest.current;
    setSelectedId(nextId);
    setPeople([]);
    setError("");
    if (nextId && currentUserId) void loadRoster(nextId);
  };

  const toggleInterest = async (event: EventRecord) => {
    if (!currentUserId || saving || event.status !== "open") return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${api}/${event.id}/interest`, { method: isInterested ? "DELETE" : "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "Este evento não está mais recebendo interessados." : "Não foi possível atualizar seu interesse.");
      await Promise.all([loadEvents(), loadRoster(event.id)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao atualizar interesse."); }
    finally { setSaving(false); }
  };

  const visibleEvents = events.filter((event) => (showArchived ? event.status !== "open" : event.status === "open") && (!category || event.category === category));
  const selectedEvent = visibleEvents.find((event) => event.id === selectedId);

  const saveEvent = async () => {
    if (!currentUserId || !canManage || saving) return;
    setSaving(true); setError("");
    try {
      const payload = normalizeRoomEvent({ ...draft, startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null });
      const response = await fetch(editingId ? `${api}/${editingId}` : api, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(response.status === 403 ? "Somente ADM ou MOD desta sala pode gerenciar eventos." : "Não foi possível salvar o evento.");
      await loadEvents(); setEditing(false); setEditingId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar evento."); }
    finally { setSaving(false); }
  };

  const beginEdit = (event?: EventRecord) => {
    setError(""); setEditingId(event?.id ?? null);
    setDraft({ title: event?.title ?? "", description: event?.description ?? "", location: event?.location ?? "", startsAt: eventLocalDateTime(event?.startsAt ?? null), category: event?.category ?? category ?? "outro" });
    setEditing(true);
  };
  const changeStatus = async (event: EventRecord, status: EventRecord["status"]) => {
    if (!currentUserId || !canManage || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${api}/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error(response.status === 403 ? "Somente ADM ou MOD desta sala pode gerenciar eventos." : "Não foi possível atualizar o evento.");
      await loadEvents(); setSelectedId(null); ++rosterRequest.current; setPeople([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao atualizar evento."); }
    finally { setSaving(false); }
  };

  return <section className="mural-folder-content events-folder" aria-live="polite">
    <div className="mural-breadcrumb"><span>Lazer</span><ChevronRight size={14} /><strong>{category ? category[0].toUpperCase() + category.slice(1) : "Eventos"}</strong></div>
    {currentUserId && <div className="event-admin-actions"><button type="button" className="mural-secondary-button" onClick={() => { setShowArchived(!showArchived); setSelectedId(null); ++rosterRequest.current; }} aria-pressed={showArchived}>{showArchived ? "Ver eventos abertos" : "Ver encerrados e cancelados"}</button>{canManage && <button type="button" className="mural-secondary-button" onClick={() => editing ? setEditing(false) : beginEdit()} disabled={saving}>{editing ? "Cancelar edição" : "Criar evento"}</button>}</div>}
    {editing && currentUserId && canManage && <form className="fundraiser-editor" onSubmit={(event) => { event.preventDefault(); void saveEvent(); }}>
      <strong>{editingId ? "Editar evento" : "Novo evento"}</strong>
      <label>Título<input required maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Descrição<textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Local<input maxLength={160} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
      {!category && <label>Categoria<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="outro">Outro</option><option value="futebol">Futebol</option><option value="paintball">Paintball</option><option value="kart">Kart</option></select></label>}
      <label>Data e hora (opcional)<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label>
      <button className="mural-primary-button" disabled={saving}>Salvar evento</button>
    </form>}
    {error && <p className="mural-form-error" role="alert">{error}</p>}
    {!currentUserId ? <div className="mural-access-note"><UsersRound aria-hidden="true" /><strong>Entre com o Google para acessar os eventos.</strong><span>Qualquer conta Google autenticada pode consultar e demonstrar interesse.</span></div>
      : loading ? <p className="mural-loading">Carregando eventos…</p>
      : visibleEvents.length === 0 ? <div className="mural-no-messages"><PartyPopper size={22} aria-hidden="true" /><strong>{showArchived ? "Nenhum evento encerrado ou cancelado nesta pasta" : "Nenhum evento aberto nesta pasta"}</strong><span>Quando um ADM ou MOD cadastrar uma atividade, ela aparecerá aqui.</span></div>
      : <div className="events-list">
        {visibleEvents.map((event) => {
          const view = toEventCardViewModel(event);
          const expanded = event.id === selectedId;
          return <article className={expanded ? "event-card expanded" : "event-card"} key={event.id}>
            <button className="event-card-summary" type="button" aria-expanded={expanded} onClick={() => chooseEvent(event)}>
              <span className="event-card-icon"><PartyPopper size={18} aria-hidden="true" /></span>
              <span className="event-card-copy"><strong>{view.title}</strong><small>{view.description || "Atividade da equipe"}</small><span>{view.whenLabel} · {view.whereLabel}</span></span>
              <span className="event-interest-count">{view.interestLabel}</span>
              {event.status !== "open" && <small>{event.status === "closed" ? "Encerrado" : "Cancelado"}</small>}
            </button>
            {roomSlug && event.photos && event.interestCount > 0 && <div className="event-photo-preview">
              <MuralPeopleStack title={event.title} count={event.interestCount} photos={event.photos} onClick={() => { if (!expanded) chooseEvent(event); }} />
            </div>}
            {expanded && selectedEvent && <div className="event-detail">
              <p>{selectedEvent.description || "Sem descrição adicional."}</p>
              <div className="event-detail-meta"><span><PartyPopper size={14} />{view.whenLabel}</span><span><MapPin size={14} />{view.whereLabel}</span></div>
              <div className="event-roster-heading"><strong>Interessados</strong><span>{people.length}</span></div>
              {!currentUserId ? <p className="mural-access-note">Entre com o Google para ver a lista de pessoas interessadas.</p>
                : rosterLoading ? <p className="mural-loading">Carregando lista…</p>
                : people.length === 0 ? <p className="event-roster-empty">Ainda não há pessoas interessadas.</p>
                : <div className="event-roster">{people.map((person) => <div className="event-roster-person" key={person.userId}><AvatarPreview model={person.avatar} headOnly /><span><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span></div>)}</div>}
              {currentUserId && selectedEvent.status === "open" && <button className={isInterested ? "kart-interest-button selected" : "kart-interest-button"} type="button" disabled={saving || rosterLoading} onClick={() => void toggleInterest(selectedEvent)}>{saving ? "Salvando…" : isInterested ? "Remover meu interesse" : "Tenho interesse"}</button>}
              {currentUserId && canManage && <div className="event-admin-actions"><button className="mural-secondary-button" type="button" disabled={saving} onClick={() => beginEdit(selectedEvent)}>Editar evento</button>{selectedEvent.status === "open" ? <><button type="button" className="mural-secondary-button" disabled={saving} onClick={() => void changeStatus(selectedEvent, "closed")}>Encerrar evento</button><button type="button" className="mural-secondary-button" disabled={saving} onClick={() => void changeStatus(selectedEvent, "cancelled")}>Cancelar evento</button></> : <button type="button" className="mural-secondary-button" disabled={saving} onClick={() => void changeStatus(selectedEvent, "open")}>Reabrir evento</button>}</div>}
              <small className="event-interest-note">Demonstrar interesse não confirma presença.</small>
            </div>}
          </article>;
        })}
      </div>}
  </section>;
}
