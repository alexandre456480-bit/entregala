-- EntregaLá / Fase 1. Additive migration, no sample data or destructive reset.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 name text not null check (length(trim(name)) between 2 and 160),
 email text not null check (length(email) between 3 and 254),
 role text not null check (role in ('admin','driver')),
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.establishments (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 160),
 trade_name text not null default '' check(length(trade_name)<=160), phone text not null check(length(phone) between 8 and 24),
 contact_name text not null default '' check(length(contact_name)<=160), postal_code text not null check(postal_code ~ '^[0-9]{8}$'),
 street text not null check(length(trim(street)) between 2 and 200), number text not null check(length(trim(number)) between 1 and 20),
 complement text not null default '' check(length(complement)<=160), district text not null check(length(trim(district)) between 2 and 120),
 city text not null check(length(trim(city)) between 2 and 120), state text not null check(state ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'),
 full_address text generated always as (street || ', ' || number || case when complement='' then '' else ' · ' || complement end || ' — ' || district || ', ' || city || '/' || state || ' · CEP ' || postal_code) stored,
 latitude numeric(10,7) check(latitude between -90 and 90), longitude numeric(10,7) check(longitude between -180 and 180),
 notes text not null default '' check(length(notes)<=2000), receiving_hours text not null default '' check(length(receiving_hours)<=200),
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((latitude is null) = (longitude is null))
);
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 160),
 unit text not null check(length(trim(unit)) between 1 and 20), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete restrict,
 delivery_date date not null, notes text not null default '' check(length(notes)<=2000),
 status text not null default 'open' check(status in ('open','cancelled')), total numeric(16,2) not null default 0 check(total>=0),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
 product_id uuid references public.products(id) on delete restrict, name text not null check(length(trim(name)) between 2 and 160),
 quantity numeric(9,3) not null check(quantity>0 and quantity<=999999), unit text not null check(length(trim(unit)) between 1 and 20),
 unit_price numeric(9,2) check(unit_price>=0 and unit_price<=9999999),
 subtotal numeric(16,2) generated always as (round(quantity*coalesce(unit_price,0),2)) stored,
 notes text not null default '' check(length(notes)<=1000), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.routes (
 id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.profiles(id) on delete restrict,
 route_date date not null, status text not null default 'draft' check(status in ('draft','released')),
 notes text not null default '' check(length(notes)<=2000), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.route_stops (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id) on delete restrict,
 route_id uuid not null references public.routes(id) on delete restrict, position integer not null check(position between 1 and 200),
 status text not null default 'pending' check(status='pending'), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(route_id,position) deferrable initially deferred
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete restrict,
 entity text not null, entity_id uuid not null, operation text not null, changes jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.provision_limits (actor_id uuid not null references public.profiles(id), window_start timestamptz not null, attempts integer not null, primary key(actor_id,window_start));
alter table private.provision_limits enable row level security;

create index profiles_role_active on public.profiles(role,active);
create index establishments_name on public.establishments(lower(name) text_pattern_ops);
create index products_name on public.products(lower(name) text_pattern_ops);
create index orders_date on public.orders(delivery_date,status);
create index orders_establishment on public.orders(establishment_id);
create index orders_created_by on public.orders(created_by);
create index order_items_order on public.order_items(order_id);
create index order_items_product on public.order_items(product_id);
create index routes_driver_date on public.routes(driver_id,route_date,status);
create index route_stops_route on public.route_stops(route_id);
create index audit_events_actor on public.audit_events(actor_id,created_at);
create index audit_events_entity on public.audit_events(entity_id,created_at);

-- Narrow, non-exposed lookups avoid recursive profile policies. No user metadata authorization.
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and active and role='admin');
$$;
create function private.is_driver() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and active and role='driver');
$$;
create function private.can_read_order(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_driver() and exists(select 1 from public.route_stops s join public.routes r on r.id=s.route_id where s.order_id=target and r.driver_id=auth.uid() and r.status='released');
$$;
create function private.can_read_establishment(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_driver() and exists(select 1 from public.orders o join public.route_stops s on s.order_id=o.id join public.routes r on r.id=s.route_id where o.establishment_id=target and r.driver_id=auth.uid() and r.status='released');
$$;
create function private.require_admin() returns void language plpgsql security invoker set search_path='' as $$
begin if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if; end; $$;
create function private.assert_keys(data jsonb, allowed text[]) returns void language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(data) k where not k=any(allowed)) then
 raise exception 'Invalid fields' using errcode='22023'; end if;
end; $$;
create function private.touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=clock_timestamp(); return new; end; $$;
create function private.audit() returns trigger language plpgsql security definer set search_path='' as $$
declare before_data jsonb; after_data jsonb; delta jsonb;
begin
 before_data=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_data=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 -- Allowlist: no addresses, passwords, email or free-text notes in audit payloads.
 select coalesce(jsonb_object_agg(k,jsonb_build_object('before',before_data->k,'after',after_data->k)),'{}') into delta
 from unnest(array['quantity','unit_price','total','status','driver_id','route_id','order_id','position','active','role','delivery_date','establishment_id','name','unit','product_id']) k
 where before_data->k is distinct from after_data->k;
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes) values(auth.uid(),tg_table_name,coalesce(new.id,old.id),tg_op,delta);
 return coalesce(new,old);
end; $$;

do $$ declare t text; begin
 foreach t in array array['profiles','establishments','products','orders','order_items','routes','route_stops'] loop
 execute format('create trigger touch before update on public.%I for each row execute function private.touch()',t);
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit()',t);
 end loop;
 foreach t in array array['profiles','establishments','products','orders','order_items','routes','route_stops','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create policy profiles_read on public.profiles for select to authenticated using((select private.is_admin()) or (id=(select auth.uid()) and active));
create policy establishments_read on public.establishments for select to authenticated using((select private.is_admin()) or private.can_read_establishment(id));
create policy products_read on public.products for select to authenticated using((select private.is_admin()));
create policy orders_read on public.orders for select to authenticated using((select private.is_admin()) or private.can_read_order(id));
create policy items_read on public.order_items for select to authenticated using((select private.is_admin()) or private.can_read_order(order_id));
create policy routes_read on public.routes for select to authenticated using((select private.is_admin()) or ((select private.is_driver()) and driver_id=(select auth.uid()) and status='released'));
create policy stops_read on public.route_stops for select to authenticated using((select private.is_admin()) or private.can_read_order(order_id));
create policy audit_read on public.audit_events for select to authenticated using((select private.is_admin()));
-- Only low-risk master data has direct writes; immutable identity/control columns are excluded from grants.
grant insert(name,trade_name,phone,contact_name,postal_code,street,number,complement,district,city,state,latitude,longitude,notes,receiving_hours,active), update(name,trade_name,phone,contact_name,postal_code,street,number,complement,district,city,state,latitude,longitude,notes,receiving_hours,active) on public.establishments to authenticated;
create policy establishments_insert on public.establishments for insert to authenticated with check((select private.is_admin()));
create policy establishments_update on public.establishments for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
grant insert(name,unit,active), update(name,unit,active) on public.products to authenticated;
create policy products_insert on public.products for insert to authenticated with check((select private.is_admin()));
create policy products_update on public.products for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));

create function private.save_order(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare oid uuid; old_order public.orders; item jsonb; rid uuid; row_route public.routes; item_total numeric; q numeric; price numeric; existing_route uuid; existing_products uuid[];
begin
 perform private.require_admin();
 perform pg_advisory_xact_lock(4581021);
 perform private.assert_keys(payload,array['id','establishment_id','delivery_date','notes','status','expected_updated_at','route_id','items']);
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Invalid items' using errcode='22023'; end if;
 if not exists(select 1 from public.establishments where id=(payload->>'establishment_id')::uuid and (active or id=(select establishment_id from public.orders where id=(payload->>'id')::uuid))) then raise exception 'Inactive establishment' using errcode='23514'; end if;
 oid=(payload->>'id')::uuid; rid=(payload->>'route_id')::uuid;
 if oid is not null then
 select * into old_order from public.orders where id=oid for update;
 if not found then raise exception 'Not found' using errcode='P0002'; end if;
 if (payload->>'expected_updated_at')::timestamptz is distinct from old_order.updated_at then raise exception 'Stale order' using errcode='40001'; end if;
 select s.route_id into existing_route from public.route_stops s where s.order_id=oid;
 if existing_route is not null then
 select * into row_route from public.routes where id=existing_route;
 if row_route.status='released' or row_route.route_date<>(payload->>'delivery_date')::date or payload->>'status'='cancelled' then raise exception 'Assigned order cannot change date or be cancelled' using errcode='23514'; end if;
 if rid is not null and rid<>existing_route then raise exception 'Already assigned' using errcode='23505'; end if;
 end if;
 update public.orders set establishment_id=(payload->>'establishment_id')::uuid,delivery_date=(payload->>'delivery_date')::date,notes=payload->>'notes',status=payload->>'status' where id=oid;
 select array_agg(product_id) into existing_products from public.order_items where order_id=oid and product_id is not null;
 delete from public.order_items where order_id=oid;
 else
 insert into public.orders(establishment_id,delivery_date,notes,status,created_by) values((payload->>'establishment_id')::uuid,(payload->>'delivery_date')::date,payload->>'notes',payload->>'status',auth.uid()) returning id into oid;
 end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
 perform private.assert_keys(item,array['product_id','name','quantity','unit','unit_price','notes']);
 q=(item->>'quantity')::numeric; price=(item->>'unit_price')::numeric;
 if q<>round(q,3) or (price is not null and price<>round(price,2)) then raise exception 'Precision invalid' using errcode='22023'; end if;
 if item->>'product_id' is not null and not exists(select 1 from public.products where id=(item->>'product_id')::uuid and (active or id=any(existing_products))) then raise exception 'Inactive product' using errcode='23514'; end if;
 insert into public.order_items(order_id,product_id,name,quantity,unit,unit_price,notes) values(oid,(item->>'product_id')::uuid,trim(item->>'name'),q,trim(item->>'unit'),price,item->>'notes');
 end loop;
 select sum(subtotal) into item_total from public.order_items where order_id=oid;
 update public.orders set total=item_total where id=oid;
 if rid is not null and existing_route is null then
 select * into row_route from public.routes where id=rid for update;
 if not found or row_route.status<>'draft' or row_route.route_date<>(payload->>'delivery_date')::date or payload->>'status'<>'open' then raise exception 'Invalid route' using errcode='23514'; end if;
 insert into public.route_stops(order_id,route_id,position) select oid,rid,coalesce(max(position),0)+1 from public.route_stops where route_id=rid;
 update public.routes set updated_at=clock_timestamp() where id=rid;
 end if;
 return oid;
end; $$;
create function public.save_order(payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.save_order(payload); $$;

create function private.save_route(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; old_route public.routes; ids uuid[]; target uuid; n integer=0;
begin
 perform private.require_admin(); perform pg_advisory_xact_lock(4581021);
 perform private.assert_keys(payload,array['id','driver_id','route_date','notes','status','expected_updated_at','order_ids']);
 if jsonb_typeof(payload->'order_ids') is distinct from 'array' or jsonb_array_length(payload->'order_ids')>200 then raise exception 'Invalid stops' using errcode='22023'; end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(payload->'order_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Duplicate order' using errcode='23505'; end if;
 if not exists(select 1 from public.profiles where id=(payload->>'driver_id')::uuid and role='driver' and active) then raise exception 'Invalid driver' using errcode='23514'; end if;
 rid=(payload->>'id')::uuid;
 if rid is not null then
 select * into old_route from public.routes where id=rid for update;
 if not found then raise exception 'Not found' using errcode='P0002'; end if;
 if old_route.status='released' then raise exception 'Released route is read-only' using errcode='23514'; end if;
 if (payload->>'expected_updated_at')::timestamptz is distinct from old_route.updated_at then raise exception 'Stale route' using errcode='40001'; end if;
 end if;
 foreach target in array ids loop
 if not exists(select 1 from public.orders where id=target and delivery_date=(payload->>'route_date')::date and status='open') then raise exception 'Invalid order/date' using errcode='23514'; end if;
 if exists(select 1 from public.route_stops where order_id=target and route_id is distinct from rid) then raise exception 'Order already assigned' using errcode='23505'; end if;
 end loop;
 if payload->>'status'='released' and cardinality(ids)=0 then raise exception 'Empty route' using errcode='23514'; end if;
 if rid is null then
 insert into public.routes(driver_id,route_date,status,notes) values((payload->>'driver_id')::uuid,(payload->>'route_date')::date,payload->>'status',payload->>'notes') returning id into rid;
 else
 update public.routes set driver_id=(payload->>'driver_id')::uuid,route_date=(payload->>'route_date')::date,status=payload->>'status',notes=payload->>'notes' where id=rid;
 end if;
 -- Delete/reinsert is transactional and audited, commercial orders/items are retained.
 delete from public.route_stops where route_id=rid;
 foreach target in array ids loop
 n=n+1; insert into public.route_stops(order_id,route_id,position) values(target,rid,n);
 end loop;
 return rid;
end; $$;
create function public.save_route(payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.save_route(payload); $$;

create function private.set_driver_active(driver uuid,enabled boolean) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.require_admin(); perform pg_advisory_xact_lock(4581021);
 if enabled is null then raise exception 'Invalid status' using errcode='22023'; end if;
 update public.profiles set active=enabled where id=driver and role='driver';
 if not found then raise exception 'Driver not found' using errcode='P0002'; end if;
 return driver;
end; $$;
create function public.set_driver_active(driver uuid,enabled boolean) returns uuid language sql security invoker set search_path='' as $$ select private.set_driver_active(driver,enabled); $$;
create function private.claim_driver_provision() returns void language plpgsql security definer set search_path='' as $$
declare attempts integer; bucket timestamptz=date_trunc('hour',now());
begin
 perform private.require_admin();
 insert into private.provision_limits values(auth.uid(),bucket,1) on conflict(actor_id,window_start) do update set attempts=private.provision_limits.attempts+1 returning provision_limits.attempts into attempts;
 if attempts>12 then raise exception 'Provision rate limit'; end if;
 delete from private.provision_limits where window_start<now()-interval '2 days';
end; $$;
create function public.claim_driver_provision() returns void language sql security invoker set search_path='' as $$ select private.claim_driver_provision(); $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(),private.is_driver(),private.can_read_order(uuid),private.can_read_establishment(uuid),private.save_order(jsonb),private.save_route(jsonb),private.set_driver_active(uuid,boolean),private.claim_driver_provision() to authenticated;
revoke all on function public.save_order(jsonb),public.save_route(jsonb),public.set_driver_active(uuid,boolean),public.claim_driver_provision() from public,anon;
grant execute on function public.save_order(jsonb),public.save_route(jsonb),public.set_driver_active(uuid,boolean),public.claim_driver_provision() to authenticated;
commit;
