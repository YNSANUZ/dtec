create table if not exists public.room_member_presence (
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  x real not null default 0 check (x between -13 and 13),
  z real not null default 5 check (z between -7 and 11),
  action text not null default 'idle' check (action in ('idle', 'walk', 'sit', 'dance')),
  last_seen timestamptz not null default now(),
  primary key (room_slug, user_id)
);

create index if not exists room_member_presence_room_recent_idx
  on public.room_member_presence (room_slug, last_seen desc);

alter table public.room_member_presence enable row level security;
grant select (room_slug, user_id, x, z, action, last_seen)
  on public.room_member_presence to anon, authenticated;
grant insert (room_slug, user_id, x, z, action, last_seen)
  on public.room_member_presence to authenticated;
grant update (room_slug, user_id, x, z, action, last_seen)
  on public.room_member_presence to authenticated;
revoke delete on public.room_member_presence from anon, authenticated;

create policy "public can see characters in public rooms"
  on public.room_member_presence for select to anon, authenticated using (true);
create policy "members publish own room presence"
  on public.room_member_presence for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "members update own room presence"
  on public.room_member_presence for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into public.room_member_presence (room_slug, user_id, x, z, action, last_seen)
select 'dtec', user_id, x, z, action, last_seen from public.room_presence
on conflict (room_slug, user_id) do nothing;
