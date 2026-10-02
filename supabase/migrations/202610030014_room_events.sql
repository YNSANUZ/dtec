revoke insert on public.room_events from authenticated;
grant insert (room_slug,title,description,category,starts_at,location,created_by)
  on public.room_events to authenticated;
-- Existing column-level UPDATE grants exclude room_slug and created_by.
drop policy if exists "ADM MOD create room events" on public.room_events;
drop policy if exists "ADM MOD update room events" on public.room_events;
drop policy if exists "DTEC ADM MOD create room events" on public.room_events;
drop policy if exists "DTEC ADM MOD update room events" on public.room_events;
create policy "staff create events in own room" on public.room_events
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.has_room_role(room_slug,array['owner','leader'])
  );
create policy "staff update events in own room" on public.room_events
  for update to authenticated
  using (public.has_room_role(room_slug,array['owner','leader']))
  with check (public.has_room_role(room_slug,array['owner','leader']));

drop policy if exists "completed members read event interests" on public.room_event_interests;
create policy "profiles read interests through room event" on public.room_event_interests
  for select to authenticated using (exists (select 1 from public.room_events where id = event_id));
drop policy if exists "members remove own event interest" on public.room_event_interests;
create policy "members remove own open event interest" on public.room_event_interests
  for delete to authenticated using (
    user_id = (select auth.uid())
    and exists (select 1 from public.room_events where id = event_id and status = 'open')
  );
