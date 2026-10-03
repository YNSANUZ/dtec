-- Approved room refresh. Additive: retain content IDs, payments and audit.
create table public.room_departures (
  room_slug text not null references public.rooms(slug) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  primary key(room_slug,user_id)
);
alter table public.room_departures enable row level security;
revoke all on public.room_departures from public,anon,authenticated;
grant select(room_slug,user_id) on public.room_departures to anon,authenticated;
create policy "public membership departure signal" on public.room_departures for select to anon,authenticated using(true);

create function public.is_content_room_member(p_room_slug text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where user_id=(select auth.uid()))
    and not exists(select 1 from public.room_departures where room_slug=p_room_slug and user_id=(select auth.uid()))
    and (p_room_slug='dtec'
      or public.has_room_role(p_room_slug,array['owner','leader'])
      or exists(select 1 from public.room_member_presence where room_slug=p_room_slug and user_id=(select auth.uid())));
$$;
revoke all on function public.is_content_room_member(text) from public,anon;
grant execute on function public.is_content_room_member(text) to authenticated;

create table public.room_board_nodes (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.rooms(slug) on delete cascade,
  parent_id uuid,
  title text not null check(char_length(trim(title)) between 1 and 60),
  kind text not null check(kind in ('panel','folder')),
  content_kind text check(content_kind in ('notes','events','fundraisers','birthdays')),
  legacy_key text,
  sort_order integer not null default 0 check(sort_order between 0 and 999),
  archived boolean not null default false,
  created_by uuid references public.profiles(user_id) on delete set null,
  unique(room_slug,id), unique(room_slug,legacy_key),
  foreign key(room_slug,parent_id) references public.room_board_nodes(room_slug,id) on delete restrict,
  check((kind='panel' and parent_id is null and content_kind is null) or (kind='folder' and parent_id is not null))
);
create index room_board_nodes_parent_idx on public.room_board_nodes(room_slug,parent_id,sort_order);
alter table public.room_board_nodes enable row level security;
revoke all on public.room_board_nodes from public,anon,authenticated;
grant select on public.room_board_nodes to authenticated;
grant insert(room_slug,parent_id,title,kind,content_kind,sort_order,created_by),update(parent_id,title,sort_order,archived) on public.room_board_nodes to authenticated;
create policy "completed profiles read room organization" on public.room_board_nodes for select to authenticated
  using(exists(select 1 from public.profiles where user_id=(select auth.uid())));
create policy "room staff creates organization" on public.room_board_nodes for insert to authenticated
  with check(created_by=(select auth.uid()) and public.has_room_role(room_slug,array['owner','leader']));
create policy "room staff updates organization" on public.room_board_nodes for update to authenticated
  using(public.has_room_role(room_slug,array['owner','leader'])) with check(public.has_room_role(room_slug,array['owner','leader']));

alter table public.room_events add column board_node_id uuid, add column deleted_at timestamptz;
alter table public.fundraisers add column board_node_id uuid, add column deleted_at timestamptz;
alter table public.mural_messages add column board_node_id uuid;
alter table public.room_events add foreign key(room_slug,board_node_id) references public.room_board_nodes(room_slug,id) on delete restrict;
alter table public.fundraisers add foreign key(room_slug,board_node_id) references public.room_board_nodes(room_slug,id) on delete restrict;
alter table public.mural_messages add foreign key(room_slug,board_node_id) references public.room_board_nodes(room_slug,id) on delete restrict;
grant insert(board_node_id),update(board_node_id,deleted_at) on public.room_events,public.fundraisers to authenticated;
grant insert(board_node_id),update(board_node_id) on public.mural_messages to authenticated;

drop policy "staff create events in own room" on public.room_events;
drop policy "staff update events in own room" on public.room_events;
create policy "members create own room events" on public.room_events for insert to authenticated
  with check(created_by=(select auth.uid()) and public.is_content_room_member(room_slug));
create policy "authors and staff update room events" on public.room_events for update to authenticated
  using(public.has_room_role(room_slug,array['owner','leader']) or (created_by=(select auth.uid()) and public.is_content_room_member(room_slug)))
  with check(public.has_room_role(room_slug,array['owner','leader']) or (created_by=(select auth.uid()) and public.is_content_room_member(room_slug)));
drop policy "staff create fundraiser in own room" on public.fundraisers;
drop policy "staff update fundraiser in own room" on public.fundraisers;
create policy "members create own room fundraisers" on public.fundraisers for insert to authenticated
  with check(created_by=(select auth.uid()) and public.is_content_room_member(room_slug));
create policy "authors and staff update room fundraisers" on public.fundraisers for update to authenticated
  using(public.has_room_role(room_slug,array['owner','leader']) or (created_by=(select auth.uid()) and public.is_content_room_member(room_slug)))
  with check(public.has_room_role(room_slug,array['owner','leader']) or (created_by=(select auth.uid()) and public.is_content_room_member(room_slug)));
-- No DELETE grant on campaigns/events: removing from the UI preserves history.

create function public.guard_room_board_content() returns trigger language plpgsql security definer set search_path='' as $$
declare n public.room_board_nodes; expected text; default_key text;
begin
  expected:=case tg_table_name when 'room_events' then 'events' when 'fundraisers' then 'fundraisers' else 'notes' end;
  if new.board_node_id is null then
    default_key:=case expected when 'notes' then 'recados' when 'fundraisers' then 'vaquinhas' else 'eventos' end;
    if expected='events' and new.room_slug='dtec' then
      default_key:=case when new.category in('futebol','paintball','kart') then new.category else 'confraternizacoes' end;
    end if;
    select id into new.board_node_id from public.room_board_nodes
      where room_slug=new.room_slug and not archived and content_kind=expected
      order by (legacy_key=default_key) desc nulls last,sort_order,id limit 1;
    if new.board_node_id is null then raise exception 'create a content folder first' using errcode='23514'; end if;
  end if;
  select * into n from public.room_board_nodes where id=new.board_node_id and room_slug=new.room_slug for update;
  if not found or n.archived or n.content_kind is distinct from expected then
    raise exception 'invalid content folder' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function public.guard_room_board_content() from public,anon,authenticated;
create trigger validate_event_folder before insert or update of board_node_id on public.room_events for each row execute function public.guard_room_board_content();
create trigger validate_fundraiser_folder before insert or update of board_node_id on public.fundraisers for each row execute function public.guard_room_board_content();
create trigger validate_notice_folder before insert or update of board_node_id on public.mural_messages for each row execute function public.guard_room_board_content();

create function public.guard_room_board_node() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.room_board_nodes; depth integer;
begin
  -- Serialize modifications within this room, including concurrent moves.
  perform pg_advisory_xact_lock(hashtext('room-board:'||new.room_slug));
  if tg_op='UPDATE' and (new.room_slug<>old.room_slug or new.kind<>old.kind or new.content_kind is distinct from old.content_kind or new.created_by is distinct from old.created_by) then
    raise exception 'immutable node identity' using errcode='23514';
  end if;
  if new.parent_id is not null then
    select * into p from public.room_board_nodes where id=new.parent_id and room_slug=new.room_slug for update;
    if not found or p.archived or p.content_kind is not null then raise exception 'invalid parent folder' using errcode='23514'; end if;
    with recursive ancestors as (
      select id,parent_id,1 d from public.room_board_nodes where id=new.parent_id
      union all select n.id,n.parent_id,a.d+1 from public.room_board_nodes n join ancestors a on n.id=a.parent_id where a.d<=8
    ) select max(d) into depth from ancestors;
    if depth>=6 or exists(with recursive ancestors as (
      select id,parent_id from public.room_board_nodes where id=new.parent_id
      union all select n.id,n.parent_id from public.room_board_nodes n join ancestors a on n.id=a.parent_id
    ) select 1 from ancestors where id=new.id) then raise exception 'cyclic or overly deep folders' using errcode='23514'; end if;
  end if;
  if tg_op='INSERT' and (select count(*) from public.room_board_nodes where room_slug=new.room_slug and not archived)>=100 then
    raise exception 'room organization limit' using errcode='23514';
  end if;
  if new.kind='panel' and not new.archived and (select count(*) from public.room_board_nodes where room_slug=new.room_slug and kind='panel' and not archived and id<>new.id)>=6 then
    raise exception 'maximum six panels' using errcode='23514';
  end if;
  if new.archived and (tg_op='INSERT' or not old.archived) then
    if new.kind='panel' and auth.uid() is not null and not public.has_room_role(new.room_slug,array['owner']) then
      raise exception 'only ADM removes panels' using errcode='42501';
    end if;
    if exists(select 1 from public.room_board_nodes where parent_id=new.id and not archived)
      or exists(select 1 from public.mural_messages where board_node_id=new.id)
      or exists(select 1 from public.room_events where board_node_id=new.id and deleted_at is null)
      or exists(select 1 from public.fundraisers where board_node_id=new.id and deleted_at is null) then
      raise exception 'folder not empty: move or remove its contents first' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_room_board_node() from public,anon,authenticated;
create trigger validate_board_node before insert or update on public.room_board_nodes for each row execute function public.guard_room_board_node();

create function public.seed_room_board(p_slug text) returns void language plpgsql security definer set search_path='' as $$
declare panel uuid; section text; name text;
begin
  if p_slug='dtec' then
    for section,name in select * from(values('information','Informações'),('demands','Lembretes'),('leisure','Lazer'),('birthdays','Aniversariantes')) as s(k,t) loop
      insert into public.room_board_nodes(room_slug,title,kind,legacy_key,sort_order) values(p_slug,name,'panel',section,case section when 'information' then 0 when 'demands' then 1 when 'leisure' then 2 else 3 end) returning id into panel;
      if section='information' then
        insert into public.room_board_nodes(room_slug,parent_id,title,kind,content_kind,legacy_key,sort_order) values
          (p_slug,panel,'Recados','folder','notes','recados',0),(p_slug,panel,'Comunicados','folder','notes','comunicados',1),(p_slug,panel,'Lembretes','folder','notes','lembretes',2),(p_slug,panel,'Vaquinhas','folder','fundraisers','vaquinhas',3);
      elsif section='demands' then
        insert into public.room_board_nodes(room_slug,parent_id,title,kind,content_kind,legacy_key,sort_order) values
          (p_slug,panel,'Equipamentos','folder',null,'equipamentos',0),(p_slug,panel,'Solicitações','folder','notes','solicitacoes',1),(p_slug,panel,'Atividades da equipe','folder','notes','atividades',2);
      elsif section='leisure' then
        insert into public.room_board_nodes(room_slug,parent_id,title,kind,content_kind,legacy_key,sort_order) values
          (p_slug,panel,'Futebol','folder','events','futebol',0),(p_slug,panel,'Paintball','folder','events','paintball',1),(p_slug,panel,'Kart','folder','events','kart',2),(p_slug,panel,'Confraternizações','folder','events','confraternizacoes',3);
      else
        insert into public.room_board_nodes(room_slug,parent_id,title,kind,content_kind,legacy_key) values(p_slug,panel,'Aniversários dos membros','folder','birthdays','birthday-list');
      end if;
    end loop;
  else
    insert into public.room_board_nodes(room_slug,title,kind,legacy_key) values(p_slug,'Quadro de avisos','panel','default') returning id into panel;
    insert into public.room_board_nodes(room_slug,parent_id,title,kind,content_kind,legacy_key,sort_order) values
      (p_slug,panel,'Recados','folder','notes','recados',0),(p_slug,panel,'Eventos','folder','events','eventos',1),(p_slug,panel,'Vaquinhas','folder','fundraisers','vaquinhas',2),(p_slug,panel,'Aniversariantes','folder','birthdays','birthday-list',3);
  end if;
end; $$;
revoke all on function public.seed_room_board(text) from public,anon,authenticated;
do $$ declare slug text; begin for slug in select r.slug from public.rooms r loop perform public.seed_room_board(slug); end loop; end $$;
update public.mural_messages m set board_node_id=n.id from public.room_board_nodes n where m.room_slug=n.room_slug and n.legacy_key='recados';
update public.fundraisers f set board_node_id=n.id from public.room_board_nodes n where f.room_slug=n.room_slug and n.legacy_key='vaquinhas';
update public.room_events e set board_node_id=n.id from public.room_board_nodes n where e.room_slug=n.room_slug and n.legacy_key=case when e.room_slug='dtec' then case when e.category in('futebol','paintball','kart') then e.category else 'confraternizacoes' end else 'eventos' end;
create function public.seed_new_room_board() returns trigger language plpgsql security definer set search_path='' as $$ begin perform public.seed_room_board(new.slug); return new; end; $$;
revoke all on function public.seed_new_room_board() from public,anon,authenticated;
create trigger seed_new_room_board after insert on public.rooms for each row execute function public.seed_new_room_board();

create function public.leave_content_room(p_room_slug text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
begin
  if actor is null or not exists(select 1 from public.profiles where user_id=actor) then raise exception 'unauthorized' using errcode='42501'; end if;
  if not exists(select 1 from public.rooms where slug=p_room_slug) then raise exception 'room not found' using errcode='P0002'; end if;
  insert into public.room_departures(room_slug,user_id) values(p_room_slug,actor) on conflict do nothing;
  delete from public.room_member_presence where room_slug=p_room_slug and user_id=actor;
  if p_room_slug='dtec' then delete from public.room_presence where user_id=actor; end if;
  -- Auth identity, global profile, roles, messages, payments and interests stay intact.
end; $$;
revoke all on function public.leave_content_room(text) from public,anon;
grant execute on function public.leave_content_room(text) to authenticated;
create function public.rejoin_content_room() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='room_presence' then
    delete from public.room_departures where room_slug='dtec' and user_id=new.user_id;
  else
    delete from public.room_departures where room_slug=new.room_slug and user_id=new.user_id;
  end if;
  return new;
end; $$;
revoke all on function public.rejoin_content_room() from public,anon,authenticated;
create trigger rejoin_dtec_presence after insert or update on public.room_presence for each row execute function public.rejoin_content_room();
create trigger rejoin_generic_presence after insert or update on public.room_member_presence for each row execute function public.rejoin_content_room();
