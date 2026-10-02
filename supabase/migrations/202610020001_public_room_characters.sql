-- Public room entry reveals only a member's chosen display name and avatar,
-- plus the room coordinates needed to render persistent characters.
grant select (user_id, display_name, avatar_id) on public.profiles to anon;
drop policy if exists "visitors see public character cards" on public.profiles;
create policy "visitors see public character cards"
  on public.profiles for select to anon using (true);

grant select (user_id, x, z, action, last_seen) on public.room_presence to anon;
drop policy if exists "visitors see room character presence" on public.room_presence;
create policy "visitors see room character presence"
  on public.room_presence for select to anon using (true);
