create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 18),
  avatar_id text not null check (avatar_id in ('a', 'c', 'f', 'j', 'n', 'r')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create policy "profiles are visible in the office"
on public.profiles for select
using (true);

create policy "users insert their own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
