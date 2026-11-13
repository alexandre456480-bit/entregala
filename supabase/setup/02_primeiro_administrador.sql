-- EXECUTAR SOMENTE DEPOIS DA MIGRATION DA FASE 1.
-- 1. Authentication > Users > Add user: crie seu usuário com e-mail e senha.
--    Confirme o e-mail no painel (opção Auto Confirm User, quando disponível).
-- 2. Substitua SOMENTE as duas variáveis abaixo por seu e-mail e nome.
-- 3. Execute este arquivo inteiro no SQL Editor do MESMO projeto.
-- Nunca coloque senhas neste SQL. Não edita nem promove perfis já existentes.
begin;
do $$
declare
  admin_email text := 'SUBSTITUA_PELO_SEU_EMAIL';
  admin_name text := 'SUBSTITUA_PELO_SEU_NOME';
  target_user uuid;
begin
  perform pg_advisory_xact_lock(4581023);
  -- Valida o formato, sem repetir os marcadores: "substituir tudo" é seguro.
  if admin_email is null
     or trim(admin_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or admin_name is null
     or trim(admin_name) ~* '^SUBSTITUA_'
     or length(trim(admin_name)) not between 2 and 160 then
    raise exception 'Substitua admin_email e admin_name antes de executar.';
  end if;
  if exists(select 1 from public.profiles where role='admin') then
    raise exception 'Já existe administrador. Nenhuma conta foi alterada.';
  end if;
  select id into target_user from auth.users
    where lower(email)=lower(trim(admin_email)) and email_confirmed_at is not null;
  if target_user is null then
    raise exception 'Crie e confirme primeiro o usuário em Authentication > Users.';
  end if;
  if exists(select 1 from public.profiles where id=target_user) then
    raise exception 'Este usuário já tem perfil. Nenhum privilégio foi alterado.';
  end if;
  insert into public.profiles(id,name,email,role,active)
    values(target_user,trim(admin_name),lower(trim(admin_email)),'admin',true);
end $$;
commit;
select 'Administrador provisionado. Entre no EntregaLá com o e-mail e a senha do Auth.' as resultado;
