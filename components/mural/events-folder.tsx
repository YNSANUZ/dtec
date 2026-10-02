"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronRight, MapPin, PartyPopper, UsersRound } from "lucide-react";
import AvatarPreview from "@/components/avatar-preview";
import { toEventCardViewModel, type EventCardInput } from "@/lib/events/presentation";

type EventRecord = EventCardInput & { status: "open" | "closed" | "cancelled" };
type InterestedPerson = { userId: string; name: string; avatar: string; title: string };
type InterestResponse = { interested?: InterestedPerson[]; isInterested?: boolean; error?: string };
type EventsResponse = { events?: EventRecord[]; error?: string };

export function EventsFolder({ currentUserId, category, roomSlug, canManage = false }: { currentUserId: string | null; category?: EventRecord["category"]; roomSlug?: string; canManage?: boolean }) {
  const api = roomSlug ? `/api/rooms/${roomSlug}/events` : "/api/events";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", location: "", startsAt: "" });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [people, setPeople] = useState<InterestedPerson[]>([]);
  const [isInterested, setIsInterested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    const response = await fetch(api, { cache: "no-store" });
    const body = await response.json() as EventsResponse;
    if (!response.ok) throw new Error(body.error === "unauthorized" ? "Entre com o Google para consultar os eventos." : "Não foi possível carregar os eventos agora.");
    setEvents(body.events ?? []);
  }, [api]);

  useEffect(() => {
    if (!currentUserId) { window.setTimeout(() => setLoading(false), 0); return; }
    let active = true;
    fetch(api, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as EventsResponse;
        if (!response.ok) throw new Error(body.error === "unauthorized" ? "Entre com o Google para consultar os eventos." : "Não foi possível carregar os eventos agora.");
        if (active) setEvents(body.events ?? []);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar eventos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUserId, api]);

  const loadRoster = async (eventId: string) => {
    setRosterLoading(true);
    try {
      const response = await fetch(`${api}/${eventId}/interest`, { cache: "no-store" });
      const body = await response.json() as InterestResponse;
      if (!response.ok) throw new Error("Não foi possível carregar os interessados.");
      setPeople(body.interested ?? []);
      setIsInterested(Boolean(body.isInterested));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar interessados."); }
    finally { setRosterLoading(false); }
  };

  const chooseEvent = (event: EventRecord) => {
    const nextId = selectedId === event.id ? null : event.id;
    setSelectedId(nextId);
    setPeople([]);
    setError("");
    if (nextId && currentUserId) void loadRoster(nextId);
  };

  const toggleInterest = async (event: EventRecord) => {
    if (!currentUserId || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${api}/${event.id}/interest`, { method: isInterested ? "DELETE" : "POST" });
      if (!response.ok) throw new Error(response.status === 409 ? "Este evento não está mais recebendo interessados." : "Não foi possível atualizar seu interesse.");
      await Promise.all([loadEvents(), loadRoster(event.id)]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao atualizar interesse."); }
    finally { setSaving(false); }
  };

  const visibleEvents = events.filter((event) => event.status === "open" && (!category || event.category === category));
  const selectedEvent = visibleEvents.find((event) => event.id === selectedId);

  const saveEvent = async () => {
    if (!currentUserId || !canManage || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        ...draft, category: category ?? "outro", startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      }) });
      if (!response.ok) throw new Error("Não foi possível criar o evento.");
      await loadEvents(); setEditing(false); setDraft({ title: "", description: "", location: "", startsAt: "" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao criar evento."); }
    finally { setSaving(false); }
  };

  return <section className="mural-folder-content events-folder" aria-live="polite">
    <div className="mural-breadcrumb"><span>Lazer</span><ChevronRight size={14} /><strong>{category ? category[0].toUpperCase() + category.slice(1) : "Eventos"}</strong></div>
    {currentUserId && canManage && <button type="button" className="mural-secondary-button" onClick={() => setEditing(!editing)}>{editing ? "Cancelar" : "Criar evento"}</button>}
    {editing && currentUserId && canManage && <form className="fundraiser-editor" onSubmit={(event) => { event.preventDefault(); void saveEvent(); }}>
      <label>Título<input required maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Descrição<textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Local<input maxLength={160} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
      <label>Data e hora (opcional)<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label>
      <button className="mural-primary-button" disabled={saving}>Salvar evento</button>
    </form>}
    {!currentUserId ? <div className="mural-access-note"><UsersRound aria-hidden="true" /><strong>Entre com o Google para acessar os eventos.</strong><span>Qualquer conta Google autenticada pode consultar e demonstrar interesse.</span></div>
      : loading ? <p className="mural-loading">Carregando eventos…</p>
      : error && !events.length ? <p className="mural-form-error" role="alert">{error}</p>
      : visibleEvents.length === 0 ? <div className="mural-no-messages"><PartyPopper size={22} aria-hidden="true" /><strong>Nenhum evento aberto nesta pasta</strong><span>Quando um ADM ou MOD cadastrar uma atividade, ela aparecerá aqui.</span></div>
      : <div className="events-list">
        {visibleEvents.map((event) => {
          const view = toEventCardViewModel(event);
          const expanded = event.id === selectedId;
          return <article className={expanded ? "event-card expanded" : "event-card"} key={event.id}>
            <button className="event-card-summary" type="button" aria-expanded={expanded} onClick={() => chooseEvent(event)}>
              <span className="event-card-icon"><PartyPopper size={18} aria-hidden="true" /></span>
              <span className="event-card-copy"><strong>{view.title}</strong><small>{view.description || "Atividade da equipe"}</small><span>{view.whenLabel} · {view.whereLabel}</span></span>
              <span className="event-interest-count">{view.interestLabel}</span>
            </button>
            {expanded && selectedEvent && <div className="event-detail">
              <p>{selectedEvent.description || "Sem descrição adicional."}</p>
              <div className="event-detail-meta"><span><PartyPopper size={14} />{view.whenLabel}</span><span><MapPin size={14} />{view.whereLabel}</span></div>
              <div className="event-roster-heading"><strong>Interessados</strong><span>{people.length}</span></div>
              {!currentUserId ? <p className="mural-access-note">Entre com o Google para ver a lista de pessoas interessadas.</p>
                : rosterLoading ? <p className="mural-loading">Carregando lista…</p>
                : people.length === 0 ? <p className="event-roster-empty">Ainda não há pessoas interessadas.</p>
                : <div className="event-roster">{people.map((person) => <div className="event-roster-person" key={person.userId}><AvatarPreview model={person.avatar} headOnly /><span><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span></div>)}</div>}
              {currentUserId && <button className={isInterested ? "kart-interest-button selected" : "kart-interest-button"} type="button" disabled={saving || rosterLoading} onClick={() => void toggleInterest(selectedEvent)}>{saving ? "Salvando…" : isInterested ? "Remover meu interesse" : "Tenho interesse"}</button>}
              <small className="event-interest-note">Demonstrar interesse não confirma presença.</small>
            </div>}
          </article>;
        })}
        {error && <p className="mural-form-error" role="alert">{error}</p>}
      </div>}
  </section>;
}
