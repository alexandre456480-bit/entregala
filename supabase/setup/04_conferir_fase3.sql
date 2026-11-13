-- Somente consulta. Executar depois da migration phase3_operations.
select tablename,rowsecurity as rls_ativo from pg_tables
where schemaname='public' and tablename in ('operation_items','operation_issues','route_signals');
-- Esperado: tres tabelas, todas com RLS.
select tablename,policyname,cmd,roles from pg_policies
where schemaname='public' and tablename in ('operation_items','operation_issues','route_signals');
-- Somente SELECT para authenticated; sem escrita generica.
select routine_schema,routine_name,grantee,privilege_type from information_schema.routine_privileges
where routine_schema in ('public','private') and routine_name in ('operation_context','operation_command','phase1_save_route','phase2_claim_map_request')
order by routine_schema,routine_name,grantee;
-- anon/PUBLIC nao executam estas funcoes; helpers phase1/phase2 sao internos.
select pubname,schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='route_signals';
-- Esperado: route_signals habilitada no Realtime. Se ausente, habilitar apenas esta tabela na publication do painel.
select indexname from pg_indexes where schemaname='public' and indexname='one_active_journey';
-- Esperado: indice unico de jornada em andamento por motorista.

select position('claim_map_request.kind' in pg_get_functiondef('private.phase2_claim_map_request(text,text,uuid)'::regprocedure))=0 as controle_mapas_corrigido;
-- Esperado: true depois da migration 20261111170825_fix_map_request_scope.sql.
