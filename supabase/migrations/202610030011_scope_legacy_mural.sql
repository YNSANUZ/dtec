-- Preserve every existing notice and reaction as part of the DTEC room.
alter table public.mural_messages
  add column if not exists room_slug text not null default 'dtec'
  references public.rooms(slug) on delete cascade;

create index if not exists mural_messages_room_order_idx
  on public.mural_messages (room_slug, is_pinned desc, created_at desc);

drop policy if exists "authors create their own unpinned messages" on public.mural_messages;
create policy "DTEC authors create their own unpinned messages"
  on public.mural_messages for insert to authenticated
  with check (room_slug = 'dtec' and (select auth.uid()) = author_id and is_pinned = false);

drop policy if exists "authors update their own unpinned messages" on public.mural_messages;
create policy "DTEC authors update their own unpinned messages"
  on public.mural_messages for update to authenticated
  using (room_slug = 'dtec' and (select auth.uid()) = author_id and is_pinned = false)
  with check (room_slug = 'dtec' and (select auth.uid()) = author_id and is_pinned = false);

drop policy if exists "authors delete their own unpinned messages" on public.mural_messages;
create policy "DTEC authors delete their own unpinned messages"
  on public.mural_messages for delete to authenticated
  using (room_slug = 'dtec' and (select auth.uid()) = author_id and is_pinned = false);
