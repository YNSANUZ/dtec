create table if not exists public.room_staff (
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in ('owner', 'leader')),
  appointed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_slug, user_id),
  constraint room_staff_appointment_recorded check (role = 'owner' or appointed_by is not null)
);

create index if not exists room_staff_user_idx on public.room_staff(user_id, room_slug);
alter table public.room_staff enable row level security;
revoke all on public.room_staff from public, anon, authenticated;
grant select, insert (room_slug, user_id, role, appointed_by), delete on public.room_staff to authenticated;

create or replace function public.has_room_role(p_room_slug text, p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_staff
    where room_slug = p_room_slug
      and user_id = (select auth.uid())
      and role = any(p_roles)
  );
$$;
revoke all on function public.has_room_role(text, text[]) from public, anon;
grant execute on function public.has_room_role(text, text[]) to authenticated;

drop policy if exists "authenticated see room staff" on public.room_staff;
create policy "authenticated see room staff"
  on public.room_staff for select to authenticated using (true);
drop policy if exists "room owner appoints leader" on public.room_staff;
create policy "room owner appoints leader"
  on public.room_staff for insert to authenticated
  with check (
    role = 'leader'
    and appointed_by = (select auth.uid())
    and (select public.has_room_role(room_slug, array['owner']::text[]))
  );
drop policy if exists "room owner removes leader" on public.room_staff;
create policy "room owner removes leader"
  on public.room_staff for delete to authenticated
  using (
    role = 'leader'
    and (select public.has_room_role(room_slug, array['owner']::text[]))
  );

insert into public.room_staff (room_slug, user_id, role, appointed_by, created_at)
select 'dtec', user_id, role, appointed_by, created_at from public.room_roles
on conflict (room_slug, user_id) do nothing;

create or replace function public.appoint_new_room_owner()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.room_staff (room_slug, user_id, role)
    values (new.slug, new.created_by, 'owner');
  end if;
  return new;
end;
$$;
revoke all on function public.appoint_new_room_owner() from public, anon, authenticated;
drop trigger if exists appoint_new_room_owner on public.rooms;
create trigger appoint_new_room_owner
  after insert on public.rooms for each row
  execute function public.appoint_new_room_owner();

-- Keep DTEC's existing no-argument policies functional while routes migrate.
create or replace function public.is_room_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_room_role('dtec', array['owner']::text[]);
$$;
create or replace function public.is_room_moderator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_room_role('dtec', array['owner', 'leader']::text[]);
$$;
revoke insert, delete on public.room_roles from authenticated;
