-- Existing event rows belong to the original DTEC room. Keep their IDs and interests.
alter table public.room_events
  add column if not exists room_slug text not null default 'dtec'
  references public.rooms(slug) on delete cascade;

create index if not exists room_events_room_status_idx
  on public.room_events (room_slug, status, starts_at, created_at desc);

drop policy if exists "ADM MOD create room events" on public.room_events;
create policy "DTEC ADM MOD create room events"
  on public.room_events for insert to authenticated
  with check (
    room_slug = 'dtec'
    and created_by = (select auth.uid())
    and (select public.is_room_moderator())
  );

drop policy if exists "ADM MOD update room events" on public.room_events;
create policy "DTEC ADM MOD update room events"
  on public.room_events for update to authenticated
  using (room_slug = 'dtec' and (select public.is_room_moderator()))
  with check (room_slug = 'dtec' and (select public.is_room_moderator()));
