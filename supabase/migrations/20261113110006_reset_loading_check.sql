-- Permite desfazer uma conferência somente antes da saída, usando a mesma versão e auditoria.
begin;
alter function private.operation_command(jsonb) rename to phase3_operation_command;
revoke all on function private.phase3_operation_command(jsonb) from public,anon,authenticated;
create function private.operation_command(payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare target uuid=(payload->>'route_id')::uuid; req uuid=(payload->>'request_id')::uuid;
 r public.routes; x public.operation_items; prev private.operation_commands; next_version bigint;
begin
 if payload->>'action' is distinct from 'uncheck_load' then return private.phase3_operation_command(payload); end if;
 perform pg_advisory_xact_lock(4581021); perform private.require_route(target);
 perform private.assert_keys(payload,array['action','route_id','request_id','expected_version','item_id']);
 if req is null or octet_length(payload::text)>96000 then raise exception 'Invalid request' using errcode='22023'; end if;
 select * into prev from private.operation_commands where actor_id=auth.uid() and request_id=req;
 if found then
  if prev.digest<>md5(payload::text) or prev.route_id<>target then raise exception 'Request reused' using errcode='40001'; end if;
  return prev.result;
 end if;
 if (select count(*) from private.operation_commands where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=120 then raise exception 'Too many commands' using errcode='P0001'; end if;
 select * into r from public.routes where id=target for update;
 if r.operation_version is distinct from (payload->>'expected_version')::bigint then raise exception 'Stale operation' using errcode='40001'; end if;
 if r.status<>'loading' then raise exception 'Loading is not editable' using errcode='23514'; end if;
 select * into x from public.operation_items where id=(payload->>'item_id')::uuid and route_id=target for update;
 if not found or x.loaded is null or x.delivered is not null then raise exception 'Invalid item' using errcode='23514'; end if;
 update public.operation_items set loaded=null,load_reason='',changed_by=auth.uid(),updated_at=clock_timestamp() where id=x.id;
 update public.routes set operation_version=operation_version+1 where id=target returning operation_version into next_version;
 insert into public.audit_events(actor_id,entity,entity_id,operation,changes) values(auth.uid(),'routes',target,'OP_UNCHECK_LOAD',jsonb_build_object('item_id',x.id,'previous_loaded',x.loaded,'version',next_version));
 insert into private.operation_commands(actor_id,request_id,route_id,digest,result) values(auth.uid(),req,target,md5(payload::text),next_version);
 return next_version;
end $$;
revoke all on function private.operation_command(jsonb) from public,anon;
grant execute on function private.operation_command(jsonb) to authenticated;
commit;
