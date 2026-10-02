create table if not exists public.room_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default 'outro' check (category in ('futebol', 'paintball', 'kart', 'outro')),
  starts_at timestamptz,
  location text not null default '' check (char_length(location) <= 160),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists room_events_status_starts_at_idx
  on public.room_events(status, starts_at, created_at desc);

alter table public.room_events enable row level security;
revoke all on public.room_events from public, anon;
grant select, insert on public.room_events to authenticated;
grant update (title, description, category, starts_at, location, status, updated_at)
  on public.room_events to authenticated;

create or replace function public.is_room_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_roles
    where user_id = (select auth.uid())
      and role in ('owner', 'leader')
  );
$$;
revoke all on function public.is_room_moderator() from public, anon;
grant execute on function public.is_room_moderator() to authenticated;

drop policy if exists "completed members read room events" on public.room_events;
create policy "completed members read room events"
  on public.room_events for select to authenticated
  using (exists (
    select 1 from public.profiles where user_id = (select auth.uid())
  ));

drop policy if exists "ADM MOD create room events" on public.room_events;
create policy "ADM MOD create room events"
  on public.room_events for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.is_room_moderator())
  );

drop policy if exists "ADM MOD update room events" on public.room_events;
create policy "ADM MOD update room events"
  on public.room_events for update to authenticated
  using ((select public.is_room_moderator()))
  with check ((select public.is_room_moderator()));

create table if not exists public.room_event_interests (
  event_id uuid not null references public.room_events(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists room_event_interests_user_idx
  on public.room_event_interests(user_id, created_at desc);

alter table public.room_event_interests enable row level security;
revoke all on public.room_event_interests from public, anon;
grant select, insert, delete on public.room_event_interests to authenticated;

drop policy if exists "completed members read event interests" on public.room_event_interests;
create policy "completed members read event interests"
  on public.room_event_interests for select to authenticated
  using (exists (
    select 1 from public.profiles where user_id = (select auth.uid())
  ));

drop policy if exists "members add own open event interest" on public.room_event_interests;
create policy "members add own open event interest"
  on public.room_event_interests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_events
      where id = event_id and status = 'open'
    )
  );

drop policy if exists "members remove own event interest" on public.room_event_interests;
create policy "members remove own event interest"
  on public.room_event_interests for delete to authenticated
  using (user_id = (select auth.uid()));

insert into public.room_events (
  id, title, description, category, location, status, created_by
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Kart',
  'Atividade de kart da equipe.',
  'kart',
  '',
  'open',
  (select user_id from public.room_roles where role = 'owner' order by created_at limit 1)
on conflict (id) do nothing;

insert into public.room_event_interests (event_id, user_id, created_at)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  interests.user_id,
  interests.created_at
from public.activity_interests as interests
where interests.activity_key = 'kart'
on conflict (event_id, user_id) do nothing;
