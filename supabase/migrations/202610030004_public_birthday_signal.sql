create or replace function public.birthday_today_user_ids()
returns table(user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
  from public.profiles as p
  where p.birth_day_month = to_char((now() at time zone 'America/Sao_Paulo')::date, 'MM-DD');
$$;

revoke all on function public.birthday_today_user_ids() from public;
grant execute on function public.birthday_today_user_ids() to anon, authenticated;
