"use client";

import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, CreditCard, Megaphone, CakeSlice } from "lucide-react";
import AvatarPreview from "@/components/avatar-preview";
import { MuralPeopleStack, type PeoplePreview } from "@/components/mural/people-stack";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

type Section = "notices" | "events" | "fundraisers";
type Person = { userId: string; name: string; avatar: string; title: string };
type Roster = { section: Section; people: Person[]; loading: boolean; error: string };
const sections = [
  { id: "notices", title: "Recados", description: "Autores e pessoas que reagiram aos avisos.", Icon: Megaphone },
  { id: "events", title: "Eventos", description: "Interessados nas atividades abertas.", Icon: CalendarDays },
  { id: "fundraisers", title: "Vaquinhas", description: "Participantes das contribuições abertas.", Icon: CreditCard },
] as const;

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("Não foi possível carregar as pessoas. Tente novamente.");
  return await response.json() as T;
}

export function RoomBoardOverview({ roomSlug, onOpen }: { roomSlug: string; onOpen: (section: Section | "birthdays") => void }) {
  const api = `/api/rooms/${roomSlug}/participation`;
  const [previews, setPreviews] = useState<Partial<Record<Section, PeoplePreview>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const detailRequest = useRef({ id: 0, controller: null as AbortController | null });
  useEffect(() => {
    const detailScope = detailRequest.current;
    const controller = new AbortController();
    let active = true;
    void fetch(api, { cache: "no-store", signal: controller.signal }).then((response) => read<{ sections: Partial<Record<Section, PeoplePreview>> }>(response))
      .then((body) => { if (active) setPreviews(body.sections ?? {}); })
      .catch(() => { if (active) setError("Não foi possível carregar o resumo de participantes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); ++detailScope.id; detailScope.controller?.abort(); };
  }, [api]);
  const closeRoster = () => { ++detailRequest.current.id; detailRequest.current.controller?.abort(); setRoster(null); };
  const showPeople = async (section: Section) => {
    const scope = detailRequest.current;
    const lookup = ++scope.id;
    scope.controller?.abort();
    const controller = new AbortController();
    scope.controller = controller;
    setRoster({ section, people: [], loading: true, error: "" });
    try {
      const body = await read<{ people: Person[] }>(await fetch(`${api}?section=${section}`, { cache: "no-store", signal: controller.signal }));
      if (!controller.signal.aborted && scope.id === lookup) setRoster({ section, people: body.people, loading: false, error: "" });
    } catch {
      if (!controller.signal.aborted && scope.id === lookup) setRoster({ section, people: [], loading: false, error: "Não foi possível carregar as pessoas." });
    }
  };
  return <section className="room-board-overview" aria-label="Visão geral do quadro">
    <h3>Escolha uma seção</h3>
    {loading && <p>Carregando participantes…</p>}{error && <p role="alert">{error}</p>}
    {sections.map(({ id, title, description, Icon }) => <article className="room-board-section" key={id}>
      <button type="button" className="room-board-section-open" aria-label={`Abrir ${title}`} onClick={() => onOpen(id)}><Icon size={20} aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={18} aria-hidden="true" /></button>
      {previews[id] && <MuralPeopleStack title={title} {...previews[id]} onClick={() => void showPeople(id)} />}
    </article>)}
    <article className="room-board-section"><button type="button" className="room-board-section-open" aria-label="Abrir Aniversariantes" onClick={() => onOpen("birthdays")}><CakeSlice size={20} aria-hidden="true" /><span><strong>Aniversariantes</strong><small>Próximas datas dos membros da sala.</small></span><ChevronRight size={18} aria-hidden="true" /></button></article>
    <p className="room-board-overview-note">As fotos indicam pessoas distintas que participaram; não significam que estão online ou que pagaram.</p>
    <Dialog open={roster !== null} onOpenChange={(open) => { if (!open) closeRoster(); }}>
      <DialogContent className="mural-people-dialog" showCloseButton={false}>
        <DialogTitle>{sections.find((section) => section.id === roster?.section)?.title ?? "Participantes"}</DialogTitle>
        <DialogDescription>Pessoas que participam desta seção na sala /{roomSlug}.</DialogDescription>
        <DialogClose className="room-board-roster-close" aria-label="Fechar participantes">×</DialogClose>
        {roster?.loading ? <p>Carregando pessoas…</p> : roster?.error ? <p role="alert">{roster.error}</p> : <ul className="mural-people-list">{roster?.people.length ? roster.people.map((person) => <li key={person.userId}><AvatarPreview model={person.avatar} headOnly /><span><strong>{person.name}</strong>{person.title && <small>{person.title}</small>}</span></li>) : <li>Nenhuma participação nesta seção.</li>}</ul>}
      </DialogContent>
    </Dialog>
  </section>;
}
