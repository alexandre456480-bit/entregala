-- Permite cadastros incompletos, mantendo validação para valores informados.
begin;
alter table public.establishments
  drop constraint establishments_name_check,
  drop constraint establishments_phone_check,
  drop constraint establishments_postal_code_check,
  drop constraint establishments_street_check,
  drop constraint establishments_number_check,
  drop constraint establishments_district_check,
  drop constraint establishments_city_check,
  drop constraint establishments_state_check,
  add constraint establishments_name_check check(name = '' or length(trim(name)) between 2 and 160),
  add constraint establishments_phone_check check(phone = '' or length(phone) between 8 and 24),
  add constraint establishments_postal_code_check check(postal_code = '' or postal_code ~ '^[0-9]{8}$'),
  add constraint establishments_street_check check(street = '' or length(trim(street)) between 2 and 200),
  add constraint establishments_number_check check(number = '' or length(trim(number)) between 1 and 20),
  add constraint establishments_district_check check(district = '' or length(trim(district)) between 2 and 120),
  add constraint establishments_city_check check(city = '' or length(trim(city)) between 2 and 120),
  add constraint establishments_state_check check(state = '' or state ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$');
commit;
