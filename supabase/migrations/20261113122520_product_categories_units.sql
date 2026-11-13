begin;
create table public.product_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 100)
);
create unique index product_categories_name_unique on public.product_categories(lower(regexp_replace(trim(name),'\s+',' ','g')));
create function private.protect_default_category() returns trigger language plpgsql set search_path='' as $$
begin
 if old.id='00000000-0000-4000-8000-000000000001' then raise exception 'Categoria padrão não pode ser excluída' using errcode='23503'; end if;
 return old;
end $$;
create trigger protect_default_category before delete on public.product_categories for each row execute function private.protect_default_category();
revoke all on function private.protect_default_category() from public,anon,authenticated;
insert into public.product_categories(id,name) values ('00000000-0000-4000-8000-000000000001','Sem categoria');
alter table public.products add column category_id uuid default '00000000-0000-4000-8000-000000000001' references public.product_categories(id) on delete restrict;
update public.products set category_id=(select id from public.product_categories where name='Sem categoria');
alter table public.products alter column category_id set not null;
alter table public.products alter column unit set default 'un';
grant insert(category_id), update(category_id) on public.products to authenticated;

create table public.measurement_units (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 abbreviation text not null check(length(trim(abbreviation)) between 1 and 20)
);
create unique index measurement_units_name_unique on public.measurement_units(lower(regexp_replace(trim(name),'\s+',' ','g')));
create unique index measurement_units_abbreviation_unique on public.measurement_units(lower(regexp_replace(trim(abbreviation),'\s+',' ','g')));
insert into public.measurement_units(name,abbreviation)
 select distinct on (lower(regexp_replace(trim(u),'\s+',' ','g'))) trim(u),trim(u)
 from (select unit u from public.products union all select unit from public.order_items union all select 'un') existing
 where length(trim(u)) between 1 and 20
 order by lower(regexp_replace(trim(u),'\s+',' ','g')), trim(u);

create function private.protect_used_unit() returns trigger language plpgsql set search_path='' as $$
begin
 if (tg_op='DELETE' or old.abbreviation is distinct from new.abbreviation) and exists
   (select 1 from public.order_items where lower(trim(unit))=lower(trim(old.abbreviation))) then
   raise exception 'Unidade utilizada em pedidos não pode ser excluída ou ter a abreviação alterada' using errcode='23503';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger protect_used_unit before update or delete on public.measurement_units for each row execute function private.protect_used_unit();
revoke all on function private.protect_used_unit() from public,anon,authenticated;
alter table public.product_categories enable row level security;
alter table public.measurement_units enable row level security;
revoke all on public.product_categories,public.measurement_units from public,anon,authenticated;
grant select,insert,update,delete on public.product_categories,public.measurement_units to authenticated;
grant all on public.product_categories,public.measurement_units to service_role;
create policy category_admin on public.product_categories for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy unit_admin on public.measurement_units for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
commit;
