-- Fase 2: executar inteira, uma única vez, após a Fase 1. Sem dados demonstrativos.
begin;
alter table public.establishments add column location_status text not null default 'unconfigured' check(location_status in ('unconfigured','review','confirmed')),
 add column location_confirmed_at timestamptz, add column location_confirmed_by uuid references public.profiles(id) on delete restrict;
create index establishments_location_actor on public.establishments(location_confirmed_by);
alter table public.establishments add constraint confirmed_coordinates check(location_status<>'confirmed' or (latitude is not null and longitude is not null and location_confirmed_at is not null));

create table public.operation_base(
 id boolean primary key default true check(id),name text not null check(length(trim(name)) between 2 and 160),
 address text not null check(length(trim(address)) between 5 and 500),latitude numeric(10,7) not null check(latitude between -90 and 90),
 longitude numeric(10,7) not null check(longitude between -180 and 180),notes text not null default '' check(length(notes)<=2000),updated_at timestamptz not null default now()
);
alter table public.operation_base enable row level security;
revoke all on public.operation_base from public,anon,authenticated;
grant select on public.operation_base to authenticated;
grant all on public.operation_base to service_role;
create policy base_read on public.operation_base for select to authenticated using((select private.is_admin()) or (select private.is_driver()));
create trigger touch before update on public.operation_base for each row execute function private.touch();

create function private.location_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
   new.location_status=case when new.latitude is null then 'unconfigured' else 'review' end;
 elsif row(new.postal_code,new.street,new.number,new.complement,new.district,new.city,new.state,new.latitude,new.longitude)
   is distinct from row(old.postal_code,old.street,old.number,old.complement,old.district,old.city,old.state,old.latitude,old.longitude) then
   new.location_status='review';new.location_confirmed_at=null;new.location_confirmed_by=null;
 end if;
 return new;
end $$;
create trigger location_changed before insert or update on public.establishments for each row execute function private.location_changed();
create function private.audit_location() returns trigger language plpgsql security definer set search_path='' as $$begin
 if row(new.latitude,new.longitude,new.location_status) is distinct from row(old.latitude,old.longitude,old.location_status) then
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes) values(auth.uid(),'establishments',new.id,'LOCATION_CHANGED',jsonb_build_object('before',old.location_status,'after',new.location_status));end if;
 return new;end $$;
revoke all on function private.audit_location() from public,anon,authenticated;
create trigger audit_location after update on public.establishments for each row execute function private.audit_location();

create function private.confirm_location(target uuid,lat numeric,lon numeric,expected timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.establishments;
begin
 perform private.require_admin();perform pg_advisory_xact_lock(4581021);
 select * into previous from public.establishments where id=target for update;
 if not found then raise exception 'Not found' using errcode='P0002';end if;
 if previous.updated_at is distinct from expected then raise exception 'Stale location' using errcode='40001';end if;
 if lat is null or lon is null or not(lat between -90 and 90 and lon between -180 and 180) then raise exception 'Invalid coordinates' using errcode='22023';end if;
 update public.establishments set latitude=lat,longitude=lon,location_status='review' where id=target;
 update public.establishments set location_status='confirmed',location_confirmed_at=now(),location_confirmed_by=auth.uid() where id=target;
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes) values(auth.uid(),'establishments',target,'LOCATION_CONFIRMED',jsonb_build_object('status','confirmed'));
 return target;
end $$;
create function public.confirm_location(target uuid,lat numeric,lon numeric,expected timestamptz) returns uuid language sql security invoker set search_path='' as $$select private.confirm_location(target,lat,lon,expected)$$;
create function private.save_base(payload jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare previous public.operation_base;
begin
 perform private.require_admin();perform pg_advisory_xact_lock(4581021);
 perform private.assert_keys(payload,array['name','address','latitude','longitude','notes','expected_updated_at']);
 select * into previous from public.operation_base where id for update;
 if previous.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then raise exception 'Stale base' using errcode='40001';end if;
 insert into public.operation_base(id,name,address,latitude,longitude,notes) values(true,payload->>'name',payload->>'address',(payload->>'latitude')::numeric,(payload->>'longitude')::numeric,payload->>'notes')
 on conflict(id) do update set name=excluded.name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,notes=excluded.notes;
 insert into public.audit_events(actor_id,entity,entity_id,operation) values(auth.uid(),'operation_base',auth.uid(),'BASE_CHANGED');
 return true;
end $$;
create function public.save_base(payload jsonb) returns boolean language sql security invoker set search_path='' as $$select private.save_base(payload)$$;

create function private.require_route(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.routes where id=target and (private.is_admin() or (private.is_driver() and driver_id=auth.uid() and status='released'))) then raise exception 'Route forbidden' using errcode='42501';end if;
end $$;
create function private.map_context(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; fingerprint text;
begin
 perform private.require_route(target);
 select jsonb_build_object('route_id',r.id,'driver_id',r.driver_id,'status',r.status,'updated_at',r.updated_at,
 'origin',(select to_jsonb(b) from public.operation_base b where b.id),
 'stops',coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'establishment_id',e.id,'name',e.name,'address',e.full_address,'position',s.position,'latitude',e.latitude,'longitude',e.longitude,'location_status',e.location_status,'location_updated_at',e.updated_at) order by s.position)
 from public.route_stops s join public.orders o on o.id=s.order_id join public.establishments e on e.id=o.establishment_id where s.route_id=r.id),'[]')) into result from public.routes r where r.id=target;
 fingerprint=md5((result-'updated_at')::text||'drive-v1');
 return result||jsonb_build_object('fingerprint',fingerprint);
end $$;
create function public.map_context(target uuid) returns jsonb language sql security invoker set search_path='' as $$select private.map_context(target)$$;

create table private.map_results(id uuid primary key default gen_random_uuid(),route_id uuid not null references public.routes(id),fingerprint text not null,kind text not null check(kind in ('routing','optimize')),result jsonb not null check(octet_length(result::text)<=2000000),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '6 hours',unique(route_id,fingerprint,kind));
alter table private.map_results enable row level security;
create table private.map_requests(id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),route_id uuid references public.routes(id),kind text not null,scope text not null,credits integer not null,created_at timestamptz not null default now(),lease_until timestamptz not null default now()+interval '100 seconds');
create index map_requests_actor on private.map_requests(actor_id,created_at);
create index map_requests_scope on private.map_requests(kind,scope,lease_until);
create index map_requests_route on private.map_requests(route_id,created_at);
alter table private.map_requests enable row level security;
create table private.map_budget(day date primary key,credits integer not null default 0);
alter table private.map_budget enable row level security;

create function private.cached_map(target uuid,kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;result jsonb;
begin
 context=private.map_context(target);
 select jsonb_build_object('id',m.id,'fingerprint',m.fingerprint,'kind',m.kind,'created_at',m.created_at,'result',m.result) into result from private.map_results m where m.route_id=target and m.kind=cached_map.kind and m.fingerprint=context->>'fingerprint' and m.expires_at>now();
 return result;
end $$;
create function public.cached_map(target uuid,kind text) returns jsonb language sql security invoker set search_path='' as $$select private.cached_map(target,kind)$$;

create function private.claim_map_request(kind text,scope text,target uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from private.map_requests m where m.kind=claim_map_request.kind and m.scope=claim_map_request.scope and m.lease_until>now()) then raise exception 'Request in progress';end if;
 if (select count(*) from private.map_requests m where m.actor_id=auth.uid() and m.kind=claim_map_request.kind and m.created_at>now()-interval '1 hour')>=(case kind when 'optimize' then 4 when 'routing' then 12 else 30 end) then raise exception 'User request limit';end if;
 if target is not null and (select count(*) from private.map_requests m where m.route_id=target and m.kind=claim_map_request.kind and m.created_at>now()-interval '1 hour')>=(case kind when 'optimize' then 4 else 12 end) then raise exception 'Route request limit';end if;
 insert into private.map_budget(day,credits) values((now() at time zone 'UTC')::date,cost) on conflict(day) do update set credits=private.map_budget.credits+excluded.credits returning credits into total;
 if total>1800 then raise exception 'Daily backend budget exceeded';end if;
 insert into private.map_requests(actor_id,route_id,kind,scope,credits) values(auth.uid(),target,kind,scope,cost) returning id into request;
 delete from private.map_requests where created_at<now()-interval '2 days';delete from private.map_budget where day<current_date-7;
 return request;
end $$;
create function public.claim_map_request(kind text,scope text,target uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.claim_map_request(kind,scope,target)$$;
create function public.finish_map_request(request uuid) returns void language plpgsql security invoker set search_path='' as $$begin perform private.finish_map_request(request);end $$;
create function private.finish_map_request(request uuid) returns void language plpgsql security definer set search_path='' as $$begin update private.map_requests set lease_until=now() where id=request and actor_id=auth.uid();end $$;

-- Only the server service role can store provider responses. No client-supplied geometry is trusted.
create function public.store_map_result(target uuid,source_fingerprint text,kind text,result jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid;
begin
 -- service_role has RLS bypass, but explicit table/function grants are still required.
 insert into private.map_results(route_id,fingerprint,kind,result) values(target,source_fingerprint,kind,result)
 on conflict on constraint map_results_route_id_fingerprint_kind_key do update set result=excluded.result,created_at=now(),expires_at=now()+interval '6 hours' returning id into result_id;
 delete from private.map_results where expires_at<now();return result_id;
end $$;

create function private.reorder_route(target uuid,ids uuid[],expected timestamptz,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.routes;original uuid[];i integer;
begin
 perform pg_advisory_xact_lock(4581021);perform private.require_route(target);
 select * into previous from public.routes where id=target for update;
 if previous.updated_at is distinct from expected then raise exception 'Stale route' using errcode='40001';end if;
 select array_agg(order_id order by order_id) into original from public.route_stops where route_id=target;
 if cardinality(ids) is null or cardinality(ids) not between 1 and 200 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or (select array_agg(x order by x) from unnest(ids) x) is distinct from original then raise exception 'Sequence must preserve every order' using errcode='22023';end if;
 for i in 1..cardinality(ids) loop update public.route_stops set position=i where route_id=target and order_id=ids[i];end loop;
 update public.routes set updated_at=clock_timestamp() where id=target;
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes) values(auth.uid(),'routes',target,reason,jsonb_build_object('order_ids',to_jsonb(ids)));
 return target;
end $$;
create function private.manual_reorder(target uuid,ids uuid[],expected timestamptz) returns uuid language plpgsql security definer set search_path='' as $$begin return private.reorder_route(target,ids,expected,'MANUAL_REORDER');end $$;
create function public.reorder_route(target uuid,ids uuid[],expected timestamptz) returns uuid language sql security invoker set search_path='' as $$select private.manual_reorder(target,ids,expected)$$;
create function private.apply_map_proposal(target uuid,proposal uuid,expected timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare p private.map_results;context jsonb;ids uuid[];
begin
 perform pg_advisory_xact_lock(4581021);perform private.require_route(target);
 perform 1 from public.operation_base where id for share;
 perform 1 from public.establishments where id in(select o.establishment_id from public.orders o join public.route_stops s on s.order_id=o.id where s.route_id=target) order by id for share;
 context=private.map_context(target);
 select * into p from private.map_results where id=proposal and route_id=target and kind='optimize' and expires_at>now();
 if not found or p.fingerprint is distinct from context->>'fingerprint' then raise exception 'Stale proposal' using errcode='40001';end if;
 select array_agg(value::uuid order by ordinality) into ids from jsonb_array_elements_text(p.result->'order_ids') with ordinality;
 perform private.reorder_route(target,ids,expected,'OPTIMIZATION_APPLIED');
 -- Keep a calculated optimized trajectory under the resulting sequence fingerprint.
 context=private.map_context(target);
 if p.result->'geometry' is not null and p.result->'geometry'<>'null'::jsonb then
 insert into private.map_results(route_id,fingerprint,kind,result) values(target,context->>'fingerprint','routing',p.result)
 on conflict on constraint map_results_route_id_fingerprint_kind_key do update set result=excluded.result,expires_at=now()+interval '6 hours';end if;
 return target;
end $$;
create function public.apply_map_proposal(target uuid,proposal uuid,expected timestamptz) returns uuid language sql security invoker set search_path='' as $$select private.apply_map_proposal(target,proposal,expected)$$;

revoke all on all tables in schema private from public,anon,authenticated;
grant select,insert,update,delete on private.map_results to service_role;
revoke all on function private.location_changed(),private.confirm_location(uuid,numeric,numeric,timestamptz),private.save_base(jsonb),private.require_route(uuid),private.map_context(uuid),private.cached_map(uuid,text),private.claim_map_request(text,text,uuid),private.finish_map_request(uuid),private.reorder_route(uuid,uuid[],timestamptz,text),private.apply_map_proposal(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function private.manual_reorder(uuid,uuid[],timestamptz) from public,anon;
grant execute on function private.confirm_location(uuid,numeric,numeric,timestamptz),private.save_base(jsonb),private.map_context(uuid),private.cached_map(uuid,text),private.claim_map_request(text,text,uuid),private.finish_map_request(uuid),private.manual_reorder(uuid,uuid[],timestamptz),private.apply_map_proposal(uuid,uuid,timestamptz) to authenticated;
revoke all on function public.confirm_location(uuid,numeric,numeric,timestamptz),public.save_base(jsonb),public.map_context(uuid),public.cached_map(uuid,text),public.claim_map_request(text,text,uuid),public.finish_map_request(uuid),public.reorder_route(uuid,uuid[],timestamptz),public.apply_map_proposal(uuid,uuid,timestamptz),public.store_map_result(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_location(uuid,numeric,numeric,timestamptz),public.save_base(jsonb),public.map_context(uuid),public.cached_map(uuid,text),public.claim_map_request(text,text,uuid),public.finish_map_request(uuid),public.reorder_route(uuid,uuid[],timestamptz),public.apply_map_proposal(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.store_map_result(uuid,text,text,jsonb) to service_role;
commit;
