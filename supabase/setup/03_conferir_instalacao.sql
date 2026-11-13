-- Somente consulta. Execute depois dos arquivos 01 (migration) e 02 (administrador).
-- Não retorna endereços, pedidos, senhas ou chaves.
select tablename, rowsecurity as rls_ativo
from pg_tables
where schemaname='public' and tablename in
  ('profiles','establishments','products','orders','order_items','routes','route_stops','audit_events')
order by tablename;
-- Esperado: 8 tabelas, todas com rls_ativo=true.

select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename in
  ('profiles','establishments','products','orders','order_items','routes','route_stops','audit_events')
order by tablename,cmd;
-- Esperado: políticas para authenticated, nenhuma liberação anônima.

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public' and routine_name in
  ('save_order','save_route','set_driver_active','claim_driver_provision')
order by routine_name,grantee;
-- PUBLIC e anon não devem ter EXECUTE nas quatro funções.

select role, active, count(*) as quantidade from public.profiles group by role,active;
-- Depois do arquivo 02: um administrador ativo.

select exists(
  select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.role='admin' and p.active and u.email_confirmed_at is not null
) as administrador_pronto;
-- Esperado: true. Ainda é necessário homologar os fluxos com contas reais.
