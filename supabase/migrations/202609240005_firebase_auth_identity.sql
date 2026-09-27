-- Keep Firebase Auth as the identity provider while moving product data to Postgres.
-- Firebase UIDs are strings, not UUIDs; never coerce them through auth.uid().
-- Drop the only policy expression that binds app_users.id before changing its type.
drop policy if exists users_read_self_or_admin on public.app_users;
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conrelid in (
        'public.app_users'::regclass, 'public.personnel'::regclass,
        'public.personnel_private'::regclass, 'public.plans'::regclass,
        'public.activities'::regclass, 'public.tracked_work'::regclass,
        'public.record_history'::regclass, 'public.unit_field_schemas'::regclass,
        'public.legacy_review'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', c.table_name, c.conname);
  end loop;
end $$;

alter table public.app_users alter column id type text using id::text;
alter table public.personnel alter column updated_by type text using updated_by::text;
alter table public.personnel alter column archived_by type text using archived_by::text;
alter table public.personnel_private alter column updated_by type text using updated_by::text;
alter table public.plans alter column updated_by type text using updated_by::text;
alter table public.plans alter column archived_by type text using archived_by::text;
alter table public.activities alter column updated_by type text using updated_by::text;
alter table public.activities alter column archived_by type text using archived_by::text;
alter table public.tracked_work alter column updated_by type text using updated_by::text;
alter table public.tracked_work alter column archived_by type text using archived_by::text;
alter table public.record_history alter column actor type text using actor::text;
alter table public.unit_field_schemas alter column updated_by type text using updated_by::text;
alter table public.legacy_review alter column reviewed_by type text using reviewed_by::text;

create or replace function public.current_user_id() returns text
language sql stable security invoker set search_path=public,auth as $$
  select nullif(auth.jwt()->>'sub','')
$$;
create or replace function public.current_role() returns text
language sql stable security definer set search_path=public,auth as $$
  select role from public.app_users where id=public.current_user_id() and active
$$;
create or replace function public.current_unit() returns text
language sql stable security definer set search_path=public,auth as $$
  select unit_id from public.app_users where id=public.current_user_id() and active
$$;
create or replace function public.is_syp_firebase_identity() returns boolean
language sql stable security invoker set search_path=public,auth as $$
  select coalesce(
    auth.jwt()->>'iss' = 'https://securetoken.google.com/foodsense-e1bf6'
    and auth.jwt()->>'aud' = 'foodsense-e1bf6'
    and auth.jwt()->>'role' = 'authenticated', false
  )
$$;

create policy users_read_self_or_admin on public.app_users for select to authenticated
  using (id=public.current_user_id() or public.current_role()='admin');

-- Restrictive issuer guard applies in addition to every role/unit policy.
do $$
declare t text;
begin
  foreach t in array array['units','app_users','personnel','personnel_private','plans','activities','tracked_work','record_history','unit_field_schemas','legacy_review']
  loop
    execute format('drop policy if exists firebase_identity_guard on public.%I', t);
    execute format('create policy firebase_identity_guard on public.%I as restrictive for all to authenticated using (public.is_syp_firebase_identity()) with check (public.is_syp_firebase_identity())', t);
  end loop;
end $$;

create or replace function public.audit_syp_record() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare
  old_json jsonb := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old)-'phone' end;
  new_json jsonb := to_jsonb(new)-'phone';
  key text; delta jsonb := '{}'::jsonb; record_key text; label text; action_label text;
begin
  record_key := coalesce(new_json->>'personnel_id',new_json->>'id',old_json->>'personnel_id',old_json->>'id');
  select display_name into label from public.app_users where id=public.current_user_id();
  if tg_op='INSERT' then action_label := 'Oluşturuldu';
  elsif coalesce((to_jsonb(new)->>'archived')::boolean,false) and not coalesce((to_jsonb(old)->>'archived')::boolean,false) then action_label := 'Pasife alındı';
  elsif not coalesce((to_jsonb(new)->>'archived')::boolean,false) and coalesce((to_jsonb(old)->>'archived')::boolean,false) then action_label := 'Yeniden etkinleştirildi';
  else action_label := 'Güncellendi'; end if;
  if tg_op='UPDATE' then
    for key in select jsonb_object_keys(new_json) loop
      if old_json->key is distinct from new_json->key then
        delta := delta || jsonb_build_object(key,jsonb_build_object('before',old_json->key,'after',new_json->key));
      end if;
    end loop;
  end if;
  insert into public.record_history(table_name,record_id,actor,actor_label,action,changes)
  values(tg_table_name,record_key,public.current_user_id(),coalesce(label,'SYP veri geçişi'),action_label,delta);
  return new;
end $$;

create or replace function public.guard_syp_update() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare old_json jsonb:=to_jsonb(old); new_json jsonb:=to_jsonb(new);
begin
  if tg_op='UPDATE' and coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    if (old_json->'archived') is distinct from (new_json->'archived') and public.current_role()<>'admin' then
      raise exception 'Yalnız Admin kaydı pasife alabilir veya geri yükleyebilir' using errcode='42501';
    end if;
    if tg_table_name='personnel' and old.unit_id is distinct from new.unit_id then
      raise exception 'Personelin birimi değiştirilemez; yeni birim kaydı oluşturulmalıdır' using errcode='23514';
    end if;
  end if;
  new.updated_at:=now();
  new.updated_by:=public.current_user_id();
  return new;
end $$;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.is_syp_firebase_identity() to authenticated;
