-- Exclusões administrativas antes do início da operação. Executar após as migrations anteriores.
begin;
create function private.delete_route(target uuid, expected timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_route public.routes;
begin
 perform private.require_admin();
 perform pg_advisory_xact_lock(4581021);
 select * into current_route from public.routes where id=target for update;
 if not found then raise exception 'Route not found' using errcode='P0002'; end if;
 if expected is null or current_route.updated_at is distinct from expected then raise exception 'Stale route' using errcode='40001'; end if;
 if current_route.status not in ('draft','released')
   or exists(select 1 from public.operation_items where route_id=target)
   or exists(select 1 from public.operation_issues where route_id=target)
   or exists(select 1 from private.operation_commands where route_id=target) then
   raise exception 'Journey has started' using errcode='P0001';
 end if;
 if exists(select 1 from private.map_requests where route_id=target and lease_until>now()) then
   raise exception 'Map request in progress' using errcode='55006';
 end if;
 -- Preserve accounting/rate-limit history; cached geometry can be discarded.
 update private.map_requests set route_id=null where route_id=target;
 delete from private.map_results where route_id=target;
 delete from public.route_signals where route_id=target;
 delete from public.route_stops where route_id=target;
 delete from public.routes where id=target;
 return target;
end $$;
create function public.delete_route(target uuid, expected timestamptz) returns uuid
language sql security invoker set search_path='' as $$select private.delete_route(target,expected)$$;

create function private.delete_order(target uuid, expected timestamptz, expected_route uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_order public.orders; attached uuid; route_state text;
begin
 perform private.require_admin();
 perform pg_advisory_xact_lock(4581021);
 select * into current_order from public.orders where id=target for update;
 if not found then raise exception 'Order not found' using errcode='P0002'; end if;
 if expected is null or current_order.updated_at is distinct from expected then raise exception 'Stale order' using errcode='40001'; end if;
 select s.route_id,r.status into attached,route_state from public.route_stops s join public.routes r on r.id=s.route_id where s.order_id=target;
 if attached is distinct from expected_route then raise exception 'Order assignment changed' using errcode='40001'; end if;
 if attached is not null and route_state<>'draft' then raise exception 'Order in protected route' using errcode='P0001'; end if;
 if exists(select 1 from public.operation_items where order_id=target) or exists(select 1 from public.operation_issues where order_id=target) then
   raise exception 'Order has operational history' using errcode='P0001';
 end if;
 if attached is not null then
   delete from public.route_stops where order_id=target;
   with ordered as (select id,row_number() over(order by position)::integer as position from public.route_stops where route_id=attached)
   update public.route_stops s set position=o.position from ordered o where s.id=o.id and s.position<>o.position;
   update public.routes set operation_version=operation_version+1 where id=attached;
 end if;
 delete from public.order_items where order_id=target;
 delete from public.orders where id=target;
 return target;
end $$;
create function public.delete_order(target uuid, expected timestamptz, expected_route uuid) returns uuid
language sql security invoker set search_path='' as $$select private.delete_order(target,expected,expected_route)$$;
revoke all on function private.delete_route(uuid,timestamptz),private.delete_order(uuid,timestamptz,uuid),public.delete_route(uuid,timestamptz),public.delete_order(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function private.delete_route(uuid,timestamptz),private.delete_order(uuid,timestamptz,uuid),public.delete_route(uuid,timestamptz),public.delete_order(uuid,timestamptz,uuid) to authenticated;
commit;
