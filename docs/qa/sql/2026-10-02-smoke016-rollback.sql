-- ONLY dtec-staging; fictitious fixture, no Pix and no transfer.
begin;
do $$
declare
  v_actor uuid;
  v_room text := 'qa016' || substr(replace(gen_random_uuid()::text,'-',''),1,8);
  v_campaign uuid;
  v_today date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_due date;
  v_rejected boolean := false;
begin
  select user_id into v_actor from public.profiles order by user_id limit 1;
  if v_actor is null then raise exception 'smoke requires an existing staging profile'; end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  insert into public.rooms(slug,title,created_by) values(v_room,'QA016 ficticio - rollback',v_actor);
  insert into public.fundraisers(room_slug,title,description,monthly_amount_cents,due_day,payment_instructions,created_by)
    values(v_room,'QA016 ficticio','Nao efetue pagamento',1000,extract(day from v_today)::integer,'Sem Pix. Nao efetue pagamento.',v_actor)
    returning id into v_campaign;
  insert into public.fundraiser_participants(fundraiser_id,user_id) values(v_campaign,v_actor);
  insert into public.fundraiser_contributions(fundraiser_id,user_id,cycle_due_date,status,marked_by,marked_at)
    values(v_campaign,v_actor,v_today,'paid',v_actor,statement_timestamp());
  execute 'set local role authenticated';
  v_due := public.ensure_room_fundraiser_current_cycle(v_room,v_campaign);
  if v_due <= v_today then raise exception 'current cycle did not advance on due day'; end if;
  if not exists(select 1 from public.fundraiser_contributions where fundraiser_id=v_campaign and user_id=v_actor and cycle_due_date=v_today and status='paid')
  or not exists(select 1 from public.fundraiser_contributions where fundraiser_id=v_campaign and user_id=v_actor and cycle_due_date=v_due and status='pending')
  then raise exception 'paid history/new pending cycle verification failed'; end if;
  begin
    perform public.set_room_fundraiser_payment(v_room,v_campaign,v_today,v_actor,false);
  exception when invalid_parameter_value then v_rejected := true;
  end;
  if not v_rejected then raise exception 'old cycle payment accepted'; end if;
  if not public.set_room_fundraiser_payment(v_room,v_campaign,v_due,v_actor,true)
  or public.set_room_fundraiser_payment(v_room,v_campaign,v_due,v_actor,true)
  then raise exception 'idempotence verification failed'; end if;
  execute 'reset role';
  if (select count(*) from public.fundraiser_payment_audit where fundraiser_id=v_campaign) <> 1
  then raise exception 'audit duplicate or stale write'; end if;
  if not exists(select 1 from public.fundraiser_contributions where fundraiser_id=v_campaign and cycle_due_date=v_today and status='paid')
  then raise exception 'history was changed'; end if;
end;
$$;
rollback;
select 'smoke016_passed_rollback' as result,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.fundraisers) as campaigns,
  (select count(*) from public.fundraiser_contributions) as contributions,
  (select count(*) from public.fundraiser_payment_audit) as audit_rows;
