-- Fase 3. Executar inteira uma unica vez, depois das Fases 1 e 2.
begin;
alter table public.routes drop constraint routes_status_check;
alter table public.routes add constraint routes_status_check check(status in ('draft','released','loading','in_progress','completed'));
alter table public.routes add column operation_version bigint not null default 0,
 add column loading_started_at timestamptz, add column started_at timestamptz, add column finished_at timestamptz,
 add column started_by uuid references public.profiles(id), add column finished_by uuid references public.profiles(id);
create unique index one_active_journey on public.routes(driver_id) where status='in_progress';
alter table public.route_stops drop constraint route_stops_status_check;
alter table public.route_stops add constraint route_stops_status_check check(status in ('pending','in_service','delivered','partial','not_delivered'));
alter table public.route_stops add column served_at timestamptz, add column finished_at timestamptz,
 add column finished_by uuid references public.profiles(id);
alter table public.route_stops add unique(id,route_id,order_id);
alter table public.order_items add unique(id,order_id);

create table public.operation_items(
 id uuid primary key default gen_random_uuid(),route_id uuid not null,stop_id uuid not null,order_id uuid not null,
 original_item_id uuid unique,additional_name text not null default '',additional_unit text not null default '',
 adjusted_name text not null default '' check(length(adjusted_name)<=160),adjusted_unit text not null default '' check(length(adjusted_unit)<=20),
 loaded numeric(9,3) check(loaded between 0 and 999999),delivered numeric(9,3) check(delivered between 0 and 999999),
 load_reason text not null default '' check(length(load_reason)<=1000),delivery_reason text not null default '' check(length(delivery_reason)<=1000),
 changed_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 foreign key(stop_id,route_id,order_id) references public.route_stops(id,route_id,order_id) on delete restrict,
 foreign key(original_item_id,order_id) references public.order_items(id,order_id) on delete restrict,
 check(delivered is null or (loaded is not null and delivered<=loaded)),
 check(original_item_id is not null or (length(trim(additional_name)) between 2 and 160 and length(trim(additional_unit)) between 1 and 20))
);
create index operation_items_route on public.operation_items(route_id,stop_id);
create index operation_items_order on public.operation_items(order_id);
create index operation_items_actor on public.operation_items(changed_by);
create table public.operation_issues(
 id uuid primary key default gen_random_uuid(),route_id uuid not null references public.routes(id),stop_id uuid,
 order_id uuid,item_id uuid references public.operation_items(id),
 category text not null check(category in ('closed','unavailable','missing','quantity','refused','address','substitution','other')),
 description text not null default '' check(length(description)<=1000),phase text not null check(phase in ('loading','delivery','journey')),
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 foreign key(stop_id,route_id,order_id) references public.route_stops(id,route_id,order_id),
 check((stop_id is null)=(order_id is null)),check(category<>'other' or length(trim(description))>=3)
);
create index operation_issues_route on public.operation_issues(route_id,created_at);
create index operation_issues_stop on public.operation_issues(stop_id);
create index operation_issues_item on public.operation_issues(item_id);
create index operation_issues_actor on public.operation_issues(actor_id);
-- Realtime publishes only this minimal invalidation signal, never checklist descriptions.
create table public.route_signals(route_id uuid primary key references public.routes(id),version bigint not null,updated_at timestamptz not null default now());
create table private.operation_commands(actor_id uuid not null references public.profiles(id),request_id uuid not null,
 route_id uuid not null references public.routes(id),digest text not null,result bigint not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
create index operation_commands_actor_time on private.operation_commands(actor_id,created_at);
create index operation_commands_route on private.operation_commands(route_id);
alter table private.operation_commands enable row level security;
revoke all on private.operation_commands from public,anon,authenticated;

create function private.can_read_route(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or (private.is_driver() and exists(select 1 from public.routes where id=target and driver_id=auth.uid() and status<>'draft'));
$$;
revoke all on function private.can_read_route(uuid) from public,anon;
grant execute on function private.can_read_route(uuid) to authenticated;
create or replace function private.require_route(target uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.routes where id=target) or not private.can_read_route(target) then raise exception 'Route forbidden' using errcode='42501';end if;end $$;
create or replace function private.can_read_order(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_driver() and exists(select 1 from public.route_stops s join public.routes r on r.id=s.route_id where s.order_id=target and r.driver_id=auth.uid() and r.status<>'draft');$$;
create or replace function private.can_read_establishment(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_driver() and exists(select 1 from public.orders o join public.route_stops s on s.order_id=o.id join public.routes r on r.id=s.route_id where o.establishment_id=target and r.driver_id=auth.uid() and r.status<>'draft');$$;
drop policy routes_read on public.routes;
create policy routes_read on public.routes for select to authenticated using((select private.is_admin()) or ((select private.is_driver()) and driver_id=(select auth.uid()) and status<>'draft'));
do $$declare t text;begin foreach t in array array['operation_items','operation_issues','route_signals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy operational_read on public.%I for select to authenticated using(private.can_read_route(route_id))',t);
 end loop;end $$;
create function private.signal_operation() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.operation_version is distinct from old.operation_version then
 insert into public.route_signals(route_id,version) values(new.id,new.operation_version) on conflict(route_id) do update set version=excluded.version,updated_at=clock_timestamp();end if;return new;end $$;
revoke all on function private.signal_operation() from public,anon,authenticated;
create trigger signal_operation after update on public.routes for each row execute function private.signal_operation();
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='route_signals') then alter publication supabase_realtime add table public.route_signals;end if;end $$;

-- Preserve the planning RPC, but reject every operational state at its boundary.
alter function private.save_route(jsonb) rename to phase1_save_route;
revoke all on function private.phase1_save_route(jsonb) from public,anon,authenticated;
create function private.save_route(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.require_admin();perform pg_advisory_xact_lock(4581021);
 if payload->>'status' not in ('draft','released') or exists(select 1 from public.routes where id=(payload->>'id')::uuid and status<>'draft') then raise exception 'Planning locked' using errcode='23514';end if;
 return private.phase1_save_route(payload);end $$;
revoke all on function private.save_route(jsonb) from public,anon;
grant execute on function private.save_route(jsonb) to authenticated;
create function private.freeze_commercial() returns trigger language plpgsql security definer set search_path='' as $$declare target uuid;begin
 perform pg_advisory_xact_lock(4581021);
 if tg_table_name='orders' then target=coalesce(old.id,new.id);else target=coalesce(old.order_id,new.order_id);end if;
 if exists(select 1 from public.route_stops s join public.routes r on r.id=s.route_id where s.order_id=target and r.status<>'draft') then raise exception 'Original order is frozen' using errcode='23514';end if;
 return coalesce(new,old);end $$;
revoke all on function private.freeze_commercial() from public,anon,authenticated;
create trigger freeze_commercial before update or delete on public.orders for each row execute function private.freeze_commercial();
create trigger freeze_commercial before insert or update or delete on public.order_items for each row execute function private.freeze_commercial();

create function private.operation_context(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform private.require_route(target);
 select to_jsonb(r)||jsonb_build_object('driver_name',(select name from public.profiles where id=r.driver_id),
 'stops',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('order',to_jsonb(o),'establishment',to_jsonb(e),
 'items',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('name',coalesce(i.name,x.additional_name),'unit',coalesce(i.unit,x.additional_unit),'requested',coalesce(i.quantity,0),'product_id',i.product_id,'unit_price',i.unit_price,'notes',coalesce(i.notes,'')) order by x.id) from public.operation_items x left join public.order_items i on i.id=x.original_item_id where x.stop_id=s.id),'[]'),
 'original_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.order_items i where i.order_id=o.id),'[]')) order by s.position)
 from public.route_stops s join public.orders o on o.id=s.order_id join public.establishments e on e.id=o.establishment_id where s.route_id=r.id),'[]'),
 'issues',coalesce((select jsonb_agg(to_jsonb(i) order by created_at desc) from public.operation_issues i where i.route_id=r.id),'[]'),
 'history',coalesce((select jsonb_agg(h) from(select operation,actor_id,created_at,changes from public.audit_events where entity_id=r.id and operation like 'OP_%' order by created_at desc limit 100) h),'[]')) into result from public.routes r where r.id=target;
 return result;end $$;
create function public.operation_context(target uuid) returns jsonb language sql security invoker set search_path='' as $$select private.operation_context(target)$$;

create function private.operation_command(payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare r public.routes;s public.route_stops;x public.operation_items;i public.order_items;prev private.operation_commands;
 action text=payload->>'action';target uuid=(payload->>'route_id')::uuid;req uuid=(payload->>'request_id')::uuid;
 q numeric;reason text=coalesce(payload->>'reason','');old_values jsonb;result_version bigint;result_status text;has_difference boolean;item_id uuid;group_key text;first_key text;
begin
 perform pg_advisory_xact_lock(4581021);perform private.require_route(target);
 perform private.assert_keys(payload,array['action','route_id','request_id','expected_version','stop_id','item_id','quantity','reason','acknowledge','allow_excess','name','unit','item_ids','category','phase']);
 if req is null or octet_length(payload::text)>96000 then raise exception 'Invalid request' using errcode='22023';end if;
 select * into prev from private.operation_commands where actor_id=auth.uid() and request_id=req;
 if found then if prev.digest<>md5(payload::text) or prev.route_id<>target then raise exception 'Request reused' using errcode='40001';end if;return prev.result;end if;
 if (select count(*) from private.operation_commands where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=120 then raise exception 'Too many commands' using errcode='P0001';end if;
 select * into r from public.routes where id=target for update;
 if r.operation_version is distinct from (payload->>'expected_version')::bigint then raise exception 'Stale operation' using errcode='40001';end if;
 if r.status in ('draft','completed') then raise exception 'Journey not editable' using errcode='23514';end if;
 if length(reason)>1000 then raise exception 'Reason too long' using errcode='22023';end if;
 if action in ('begin_loading','start','finish') and (not private.is_driver() or r.driver_id<>auth.uid()) then raise exception 'Driver required' using errcode='42501';end if;
 if payload->>'stop_id' is not null then
 select * into s from public.route_stops where id=(payload->>'stop_id')::uuid and route_id=target for update;
 if not found then raise exception 'Invalid stop' using errcode='42501';end if;end if;
 if payload->>'item_id' is not null then
 select * into x from public.operation_items where id=(payload->>'item_id')::uuid and route_id=target for update;
 if not found or (s.id is not null and s.id<>x.stop_id) then raise exception 'Invalid item' using errcode='42501';end if;
 select * into s from public.route_stops where id=x.stop_id for update;
 select * into i from public.order_items where id=x.original_item_id;
 end if;
 old_values=jsonb_build_object('status',r.status,'stop_status',s.status,'item_id',x.id,'loaded',x.loaded,'delivered',x.delivered,'adjusted_name',x.adjusted_name,'adjusted_unit',x.adjusted_unit);
 if action='begin_loading' then
 if r.status<>'released' then raise exception 'Already loading or started' using errcode='23514';end if;
 insert into public.operation_items(route_id,stop_id,order_id,original_item_id,changed_by)
 select target,s0.id,s0.order_id,i0.id,auth.uid() from public.route_stops s0 join public.order_items i0 on i0.order_id=s0.order_id where s0.route_id=target;
 update public.routes set status='loading',loading_started_at=clock_timestamp() where id=target;
 elsif action in ('load_item','deliver_item','adjust_item') then
 if x.id is null or s.status not in ('pending','in_service') then raise exception 'Item locked' using errcode='23514';end if;
 q=(payload->>'quantity')::numeric;
 if q is null or q<0 or q>999999 or q<>round(q,3) then raise exception 'Invalid quantity' using errcode='22023';end if;
 if action in ('load_item','adjust_item') then
 if r.status not in ('loading','in_progress') then raise exception 'Loading required' using errcode='23514';end if;
 if (q<>coalesce(i.quantity,0) or r.status='in_progress' or action='adjust_item') and length(trim(reason))<3 then raise exception 'Explain adjustment' using errcode='22023';end if;
 if q>coalesce(i.quantity,0) and coalesce((payload->>'allow_excess')::boolean,false) is not true then raise exception 'Explicit excess correction required' using errcode='23514';end if;
 if x.delivered is not null and q<x.delivered then raise exception 'Less than delivered' using errcode='23514';end if;
 update public.operation_items set loaded=q,load_reason=reason,changed_by=auth.uid(),updated_at=clock_timestamp(),
 adjusted_name=case when action='adjust_item' then coalesce(payload->>'name','') else adjusted_name end,
 adjusted_unit=case when action='adjust_item' then coalesce(payload->>'unit','') else adjusted_unit end where id=x.id;
 else
 if r.status<>'in_progress' or x.loaded is null or q>x.loaded then raise exception 'Correct loaded amount first' using errcode='23514';end if;
 if (q<>coalesce(i.quantity,0) or x.adjusted_name<>'' or x.adjusted_unit<>'') and length(trim(reason))<3 then raise exception 'Explain delivery difference' using errcode='22023';end if;
 update public.operation_items set delivered=q,delivery_reason=reason,changed_by=auth.uid(),updated_at=clock_timestamp() where id=x.id;
 update public.route_stops set status='in_service',served_at=coalesce(served_at,clock_timestamp()) where id=s.id;
 end if;
 if length(trim(reason))>=3 then insert into public.operation_issues(route_id,stop_id,order_id,item_id,category,description,phase,actor_id)values(target,s.id,s.order_id,x.id,case when action='adjust_item' then 'substitution' else 'quantity' end,reason,case when r.status='loading' then 'loading' else 'delivery' end,auth.uid());end if;
 elsif action='load_group' then
 if r.status<>'loading' or jsonb_typeof(payload->'item_ids') is distinct from 'array' or jsonb_array_length(payload->'item_ids') not between 1 and 100 or coalesce((payload->>'acknowledge')::boolean,false) is not true then raise exception 'Invalid group confirmation' using errcode='22023';end if;
 if jsonb_array_length(payload->'item_ids')<>(select count(distinct value) from jsonb_array_elements_text(payload->'item_ids')) then raise exception 'Duplicate item' using errcode='22023';end if;
 for item_id in select value::uuid from jsonb_array_elements_text(payload->'item_ids') loop
 select * into x from public.operation_items where id=item_id and route_id=target;
 if not found or x.original_item_id is null or x.loaded is not null or x.adjusted_name<>'' or x.adjusted_unit<>'' then raise exception 'Group contains treated or invalid item' using errcode='23514';end if;
 select * into i from public.order_items where id=x.original_item_id;
 group_key=coalesce(i.product_id::text,i.id::text)||'|'||i.unit;
 if first_key is not null and group_key<>first_key then raise exception 'Different product or unit' using errcode='23514';end if;first_key=group_key;
 update public.operation_items set loaded=i.quantity,changed_by=auth.uid(),updated_at=clock_timestamp() where id=x.id;
 end loop;
 elsif action='add_item' then
 if s.id is null or s.status not in ('pending','in_service') or r.status not in ('loading','in_progress') or length(trim(reason))<3 then raise exception 'Additional item needs justification' using errcode='23514';end if;
 q=(payload->>'quantity')::numeric;if q is null or q<=0 or q>999999 or q<>round(q,3) then raise exception 'Invalid quantity' using errcode='22023';end if;
 insert into public.operation_items(route_id,stop_id,order_id,additional_name,additional_unit,loaded,load_reason,changed_by)values(target,s.id,s.order_id,trim(payload->>'name'),trim(payload->>'unit'),q,reason,auth.uid()) returning id into item_id;
 insert into public.operation_issues(route_id,stop_id,order_id,item_id,category,description,phase,actor_id)values(target,s.id,s.order_id,item_id,'other',reason,case when r.status='loading' then 'loading' else 'delivery' end,auth.uid());
 elsif action='start' then
 if r.status<>'loading' or not exists(select 1 from public.operation_items where route_id=target) or exists(select 1 from public.operation_items where route_id=target and loaded is null) then raise exception 'Finish loading checklist' using errcode='23514';end if;
 has_difference=exists(select 1 from public.operation_items x0 left join public.order_items i0 on i0.id=x0.original_item_id where x0.route_id=target and (x0.loaded<>coalesce(i0.quantity,0) or x0.adjusted_name<>'' or x0.adjusted_unit<>''));
 if has_difference and coalesce((payload->>'acknowledge')::boolean,false) is not true then raise exception 'Acknowledge loading differences' using errcode='23514';end if;
 update public.routes set status='in_progress',started_at=clock_timestamp(),started_by=auth.uid() where id=target;
 elsif action='serve' then
 if r.status<>'in_progress' or s.id is null or s.status<>'pending' then raise exception 'Invalid service state' using errcode='23514';end if;
 update public.route_stops set status='in_service',served_at=clock_timestamp() where id=s.id;
 elsif action='finish_stop' then
 if r.status<>'in_progress' or s.id is null or s.status not in ('pending','in_service') or not exists(select 1 from public.operation_items where stop_id=s.id) or exists(select 1 from public.operation_items where stop_id=s.id and delivered is null) then raise exception 'Finish delivery checklist' using errcode='23514';end if;
 if not exists(select 1 from public.operation_items where stop_id=s.id and delivered>0) then result_status='not_delivered';
 elsif not exists(select 1 from public.operation_items x0 left join public.order_items i0 on i0.id=x0.original_item_id where x0.stop_id=s.id and (x0.delivered<>coalesce(i0.quantity,0) or x0.adjusted_name<>'' or x0.adjusted_unit<>'')) then result_status='delivered';else result_status='partial';end if;
 if result_status<>'delivered' and length(trim(reason))<3 then raise exception 'Explain final result' using errcode='22023';end if;
 update public.route_stops set status=result_status,finished_at=clock_timestamp(),finished_by=auth.uid() where id=s.id;
 if reason<>'' then insert into public.operation_issues(route_id,stop_id,order_id,category,description,phase,actor_id)values(target,s.id,s.order_id,'other',reason,'delivery',auth.uid());end if;
 elsif action='issue' then
 if r.status not in ('loading','in_progress') then raise exception 'Journey not started' using errcode='23514';end if;
 if payload->>'category' in ('quantity','substitution','other') and length(trim(reason))<3 then raise exception 'Description required' using errcode='22023';end if;
 insert into public.operation_issues(route_id,stop_id,order_id,item_id,category,description,phase,actor_id)values(target,s.id,s.order_id,x.id,payload->>'category',reason,payload->>'phase',auth.uid());
 elsif action='reopen_stop' then
 perform private.require_admin();if r.status<>'in_progress' or s.id is null or s.status not in ('delivered','partial','not_delivered') or length(trim(reason))<3 then raise exception 'Invalid administrative correction' using errcode='23514';end if;
 update public.route_stops set status='in_service',finished_at=null,finished_by=null where id=s.id;
 elsif action='finish' then
 if r.status<>'in_progress' or exists(select 1 from public.route_stops where route_id=target and status in ('pending','in_service')) then raise exception 'Pending stops remain' using errcode='23514';end if;
 update public.routes set status='completed',finished_at=clock_timestamp(),finished_by=auth.uid() where id=target;
 else raise exception 'Unknown action' using errcode='22023';end if;
 update public.routes set operation_version=operation_version+1 where id=target returning operation_version into result_version;
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes)values(auth.uid(),'routes',target,'OP_'||upper(action),jsonb_build_object('before',old_values,'after',jsonb_build_object('version',result_version,'stop_id',s.id,'item_id',coalesce(x.id,item_id),'quantity',q,'stop_result',result_status,'name',payload->>'name','unit',payload->>'unit'),'reason',reason));
 insert into private.operation_commands(actor_id,request_id,route_id,digest,result)values(auth.uid(),req,target,md5(payload::text),result_version);
 return result_version;end $$;
create function public.operation_command(payload jsonb) returns bigint language sql security invoker set search_path='' as $$select private.operation_command(payload)$$;
revoke all on function private.operation_context(uuid),private.operation_command(jsonb),public.operation_context(uuid),public.operation_command(jsonb) from public,anon,authenticated;
grant execute on function private.operation_context(uuid),private.operation_command(jsonb),public.operation_context(uuid),public.operation_command(jsonb) to authenticated;
create or replace function private.map_context(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; fingerprint text;
begin
 perform private.require_route(target);
 select jsonb_build_object('route_id',r.id,'driver_id',r.driver_id,'status',r.status,'updated_at',r.updated_at,
 'origin',(select to_jsonb(b) from public.operation_base b where b.id),
 'stops',coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'establishment_id',e.id,'name',e.name,'address',e.full_address,'position',s.position,'status',s.status,'latitude',e.latitude,'longitude',e.longitude,'location_status',e.location_status,'location_updated_at',e.updated_at) order by s.position)
 from public.route_stops s join public.orders o on o.id=s.order_id join public.establishments e on e.id=o.establishment_id where s.route_id=r.id),'[]')) into result from public.routes r where r.id=target;
 fingerprint=md5(jsonb_build_object('driver_id',result->'driver_id','origin',result->'origin','stops',(select jsonb_agg(value-'status') from jsonb_array_elements(result->'stops')))::text||'drive-v1');
 return result||jsonb_build_object('fingerprint',fingerprint);
end $$;
create or replace function private.reorder_route(target uuid,ids uuid[],expected timestamptz,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.routes;original uuid[];i integer;
begin
 perform pg_advisory_xact_lock(4581021);perform private.require_route(target);
 select * into previous from public.routes where id=target for update;
 if previous.status='completed' then raise exception 'Journey completed' using errcode='23514';end if;
 if exists(select 1 from public.route_stops s where s.route_id=target and s.status<>'pending' and ids[s.position] is distinct from s.order_id) then raise exception 'Only pending stops can move' using errcode='23514';end if;
 if previous.updated_at is distinct from expected then raise exception 'Stale route' using errcode='40001';end if;
 select array_agg(order_id order by order_id) into original from public.route_stops where route_id=target;
 if cardinality(ids) is null or cardinality(ids) not between 1 and 200 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or (select array_agg(x order by x) from unnest(ids) x) is distinct from original then raise exception 'Sequence must preserve every order' using errcode='22023';end if;
 for i in 1..cardinality(ids) loop update public.route_stops set position=i where route_id=target and order_id=ids[i];end loop;
 update public.routes set operation_version=operation_version+1,updated_at=clock_timestamp() where id=target;
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes) values(auth.uid(),'routes',target,reason,jsonb_build_object('order_ids',to_jsonb(ids)));
 return target;
end $$;

alter function private.claim_map_request(text,text,uuid) rename to phase2_claim_map_request;
revoke all on function private.phase2_claim_map_request(text,text,uuid) from public,anon,authenticated;
create function private.claim_map_request(kind text,scope text,target uuid default null) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(4581021);
 if kind in ('routing','optimize') then
 perform private.require_route(target);
 if exists(select 1 from public.routes where id=target and status='completed') or (kind='optimize' and exists(select 1 from public.route_stops where route_id=target and status<>'pending')) then raise exception 'Only entirely pending routes may be optimized' using errcode='23514';end if;end if;
 return private.phase2_claim_map_request(kind,scope,target);end $$;
revoke all on function private.claim_map_request(text,text,uuid) from public,anon;
grant execute on function private.claim_map_request(text,text,uuid) to authenticated;

commit;
