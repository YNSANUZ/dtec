-- Read Google identity photos without copying them into editable profile data.
create or replace function public.room_google_photos(p_user_ids uuid[])
returns table(user_id uuid, photo_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id,
    case
      when coalesce(nullif(identity.identity_data->>'avatar_url', ''), nullif(identity.identity_data->>'picture', ''))
        ~* '^https://([a-z0-9-]+\.)*googleusercontent\.com(/|$)'
      then coalesce(nullif(identity.identity_data->>'avatar_url', ''), nullif(identity.identity_data->>'picture', ''))
      else null
    end as photo_url
  from public.profiles as p
  left join lateral (
    select i.identity_data
    from auth.identities as i
    where i.user_id = p.user_id and i.provider = 'google'
    order by i.created_at desc
    limit 1
  ) as identity on true
  where auth.uid() is not null
    and exists (select 1 from public.profiles as viewer where viewer.user_id = auth.uid())
    and cardinality(p_user_ids) between 1 and 500
    and p.user_id = any(p_user_ids)
  order by p.user_id;
$$;

revoke all on function public.room_google_photos(uuid[]) from public, anon;
grant execute on function public.room_google_photos(uuid[]) to authenticated;
