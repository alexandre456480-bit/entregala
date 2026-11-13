-- Correcao incremental apos a Fase 3. Executar inteiro; nao reaplicar migrations anteriores.
-- Preserva as reservas, limites e dados existentes. Nenhuma credencial neste arquivo.
begin;
create or replace function private.phase2_claim_map_request(kind text,scope text,target uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare n integer;cost integer;request uuid;total integer;
begin
 perform pg_advisory_xact_lock(4581024);
 if kind='geocode' then perform private.require_admin();cost=1;
 elsif kind in ('routing','optimize') then
 perform private.require_route(target);select count(*) into n from public.route_stops where route_id=target;
 if n not between 1 and 30 then raise exception 'Routing supports 1 to 30 stops' using errcode='22023';end if;
 cost=case when kind='optimize' then (n+1)*least(n+1,10)+n+10 else n+10 end;
 else raise exception 'Invalid service' using errcode='22023';end if;
 if length(scope) not between 1 and 80 then raise exception 'Invalid scope' using errcode='22023';end if;
 if exists(select 1 from private.map_requests m where m.kind=$1 and m.scope=$2 and m.lease_until>now()) then raise exception 'Request in progress';end if;
 if (select count(*) from private.map_requests m where m.actor_id=auth.uid() and m.kind=$1 and m.created_at>now()-interval '1 hour')>=(case kind when 'optimize' then 4 when 'routing' then 12 else 30 end) then raise exception 'User request limit';end if;
 if target is not null and (select count(*) from private.map_requests m where m.route_id=target and m.kind=$1 and m.created_at>now()-interval '1 hour')>=(case kind when 'optimize' then 4 else 12 end) then raise exception 'Route request limit';end if;
 insert into private.map_budget(day,credits) values((now() at time zone 'UTC')::date,cost) on conflict(day) do update set credits=private.map_budget.credits+excluded.credits returning credits into total;
 if total>1800 then raise exception 'Daily backend budget exceeded';end if;
 insert into private.map_requests(actor_id,route_id,kind,scope,credits) values(auth.uid(),target,kind,scope,cost) returning id into request;
 delete from private.map_requests where created_at<now()-interval '2 days';delete from private.map_budget where day<current_date-7;
 return request;
end $$;
revoke all on function private.phase2_claim_map_request(text,text,uuid) from public,anon,authenticated;
commit;
