create table if not exists public.rooms (
  slug text primary key check (slug ~ '^[a-z0-9]{3,20}$' and slug not in ('api', 'auth', 'www')),
  title text not null check (char_length(trim(title)) between 3 and 60),
  description text not null default '' check (char_length(description) <= 280),
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
grant select on public.rooms to anon, authenticated;
grant insert (slug, title, description, created_by) on public.rooms to authenticated;
revoke update, delete on public.rooms from anon, authenticated;

create policy "public rooms can be discovered"
  on public.rooms for select to anon, authenticated using (true);
create policy "members create rooms they own"
  on public.rooms for insert to authenticated
  with check ((select auth.uid()) = created_by);

insert into public.rooms (slug, title, description)
values ('dtec', 'DTEC', 'Diretoria de Tecnologia da Informação')
on conflict (slug) do nothing;
