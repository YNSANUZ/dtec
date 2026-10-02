alter table public.profiles
  add column if not exists instagram text not null default ''
  check (instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$');

grant update (instagram) on public.profiles to authenticated;
