"use client";

import React, { useEffect, useState } from "react";
import AvatarPreview from "@/components/avatar-preview";
import { formatBirthday, orderBirthdays, saoPauloMonthDay, type BirthdayEntry } from "@/lib/birthdays/order";

export function RoomBirthdays(props: { roomSlug: string; currentUserId: string }) {
  return <BirthdayList key={`${props.roomSlug}:${props.currentUserId}`} roomSlug={props.roomSlug} />;
}

function BirthdayList({ roomSlug }: { roomSlug: string }) {
  const [people, setPeople] = useState<BirthdayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/rooms/${roomSlug}/birthdays`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as { birthdays: BirthdayEntry[] };
        if (!response.ok || !Array.isArray(body.birthdays)) throw new Error("Não foi possível carregar os aniversários.");
        if (active) { setPeople(orderBirthdays(body.birthdays, saoPauloMonthDay())); setError(""); }
      } catch {
        if (active) setError("Não foi possível carregar os aniversários.");
      } finally {
        if (active) { setLoading(false); timer = setTimeout(() => void load(), 60_000); }
      }
    };
    void load();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [roomSlug]);
  return <section className="birthday-directory" aria-live="polite">
    <div className="birthday-directory-heading"><strong>Próximos aniversários</strong><span>Dia e mês</span></div>
    {loading ? <p>Carregando a lista…</p> : error ? <p role="alert">{error}</p> : !people.length
      ? <div className="mural-no-messages"><strong>Nenhum aniversário cadastrado ainda</strong><span>Adicione apenas dia e mês no seu perfil, se quiser.</span></div>
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
