alter table public.profiles
  add column if not exists title text not null default '' check (char_length(title) <= 48),
  add column if not exists bio text not null default '' check (char_length(bio) <= 280),
  add column if not exists birth_day_month text check (
    birth_day_month is null or (
      birth_day_month ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and to_char(to_date('2000-' || birth_day_month, 'YYYY-MM-DD'), 'MM-DD') = birth_day_month
    )
  ),
  add column if not exists whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^[0-9]{10,15}$');

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check
  check (char_length(trim(display_name)) between 5 and 48 and display_name ~ '^[^[:space:]]+[[:space:]]+[^[:space:]]+$') not valid;

drop policy if exists "profiles are visible in the office" on public.profiles;
drop policy if exists "authenticated members can see profiles" on public.profiles;
create policy "authenticated members can see profiles"
  on public.profiles for select to authenticated using (true);
revoke select on public.profiles from anon;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_id, title, bio, birth_day_month, whatsapp, updated_at)
  on public.profiles to authenticated;

create table if not exists public.room_presence (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  x real not null default 0 check (x between -13 and 13),
  z real not null default 5 check (z between -7 and 11),
  action text not null default 'idle' check (action in ('idle','walk','sit','dance')),
  last_seen timestamptz not null default now()
);
create index if not exists room_presence_last_seen_idx on public.room_presence(last_seen desc);
alter table public.room_presence enable row level security;
grant select, insert, update, delete on public.room_presence to authenticated;
drop policy if exists "members see room presence" on public.room_presence;
create policy "members see room presence" on public.room_presence for select to authenticated using (true);
drop policy if exists "members publish own presence" on public.room_presence;
create policy "members publish own presence" on public.room_presence for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "members update own presence" on public.room_presence;
create policy "members update own presence" on public.room_presence for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "members clear own presence" on public.room_presence;
create policy "members clear own presence" on public.room_presence for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.room_roles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('owner','leader')),
  appointed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint room_role_appointment_recorded check (role = 'owner' or appointed_by is not null)
);
alter table public.room_roles enable row level security;
grant select, insert, delete on public.room_roles to authenticated;
create or replace function public.is_room_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.room_roles where user_id = (select auth.uid()) and role = 'owner');
$$;
revoke all on function public.is_room_owner() from public;
grant execute on function public.is_room_owner() to authenticated;
drop policy if exists "members see room roles" on public.room_roles;
create policy "members see room roles" on public.room_roles for select to authenticated using (true);
drop policy if exists "owner appoints leaders" on public.room_roles;
create policy "owner appoints leaders" on public.room_roles for insert to authenticated
  with check (role = 'leader' and (select public.is_room_owner()));
drop policy if exists "owner removes leaders" on public.room_roles;
create policy "owner removes leaders" on public.room_roles for delete to authenticated
  using (role = 'leader' and (select public.is_room_owner()));

create table if not exists public.activity_interests (
  activity_key text not null check (activity_key in ('kart')),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_key, user_id)
);
alter table public.activity_interests enable row level security;
grant select, insert, delete on public.activity_interests to authenticated;
drop policy if exists "members see activity interests" on public.activity_interests;
create policy "members see activity interests" on public.activity_interests for select to authenticated using (true);
drop policy if exists "members add own activity interest" on public.activity_interests;
create policy "members add own activity interest" on public.activity_interests for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "members remove own activity interest" on public.activity_interests;
create policy "members remove own activity interest" on public.activity_interests for delete to authenticated using ((select auth.uid()) = user_id);
