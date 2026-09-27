-- SYP PostgreSQL base model. Apply only to a new, empty Supabase project.
-- PII stays in protected columns/tables; JSONB contains unit-specific extensible fields.
create extension if not exists pgcrypto;

create table public.units (
  -- Seed with the three current units, but let Admin add approved units later.
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.units(id,name) values
 ('MEYDAN','Meydan Yönetimi'),('YERINDE_COZUM','Yerinde Çözüm'),('SAHA_HIZMETLERI','Saha Hizmetleri')
on conflict(id) do nothing;

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('admin','manager','data_entry','chief','viewer')),
  unit_id text references public.units(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role <> 'chief' or unit_id is not null)
);

create table public.personnel (
  id text primary key,
  unit_id text not null references public.units(id),
  full_name text not null,
  title text not null default '',
  team text not null default '',
  status text not null default 'AKTIF' check (status in ('AKTIF','PASIF')),
  archived boolean not null default false,
  photo_path text,
  custom_fields jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);
create table public.personnel_private (
  personnel_id text primary key references public.personnel(id) on delete restrict,
  phone text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.plans (
  id text primary key,
  personnel_id text not null references public.personnel(id) on delete restrict,
  unit_id text not null references public.units(id),
  work_date date not null,
  starts_at time not null,
  ends_at time not null,
  district_id text not null,
  neighborhood_id text not null default '',
  square_id text not null default '',
  place text not null,
  canceled boolean not null default false,
  archived boolean not null default false,
  override_explanation text not null default '',
  participants text[] not null default '{}',
  extra jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  check (cardinality(participants) > 0),
  check (unit_id = any(participants)),
  check (not archived or archived_at is not null)
);
create table public.activities (
  id text primary key,
  unit_id text not null references public.units(id),
  personnel_id text references public.personnel(id) on delete restrict,
  work_date date not null,
  district_id text not null,
  neighborhood_id text not null default '',
  square_id text not null default '',
  place text not null,
  work_done text not null,
  result text not null,
  confirmed_by text not null,
  confirmed_at date not null,
  photo_path text,
  participants text[] not null default '{}',
  archived boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);
create table public.tracked_work (
  id text primary key,
  title text not null,
  responsible text not null,
  unit_id text references public.units(id),
  participants text[] not null default '{}',
  work_date date not null default current_date,
  target_date date,
  status text not null default 'Bekliyor' check (status in ('Bekliyor','Devam Ediyor','Tamamlandı')),
  closing_note text not null default '',
  closed_at timestamptz,
  archived boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  check (status <> 'Tamamlandı' or length(trim(closing_note)) > 0)
);

create table public.record_history (
  id bigint generated always as identity primary key,
  table_name text not null check (table_name in ('personnel','personnel_private','plans','activities','tracked_work')),
  record_id text not null,
  actor uuid references auth.users(id),
  actor_label text not null default '',
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create table public.unit_field_schemas (
  unit_id text primary key references public.units(id),
  fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table public.legacy_review (
  id text primary key,
  source_path text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','resolved','archived')),
  resolution text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  source_snapshot jsonb not null default '{}'::jsonb
);

create index plans_date_unit_idx on public.plans(unit_id,work_date desc);
create index plans_person_date_idx on public.plans(personnel_id,work_date desc);
create index activities_date_unit_idx on public.activities(unit_id,work_date desc);
create index activities_date_district_idx on public.activities(district_id,work_date desc);
create index tracked_work_date_idx on public.tracked_work(work_date desc);
create index tracked_work_closed_idx on public.tracked_work(closed_at desc) where status='Tamamlandı';
create index legacy_review_status_idx on public.legacy_review(status);

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
 select role from public.app_users where id=auth.uid() and active
$$;
create or replace function public.current_unit() returns text language sql stable security definer set search_path=public as $$
 select unit_id from public.app_users where id=auth.uid() and active
$$;
create or replace function public.is_manager() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_role() in ('admin','manager'),false)
$$;
create or replace function public.can_write_records() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_role() in ('admin','manager','data_entry'),false)
$$;
create or replace function public.can_read_unit(target_unit text) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_role() in ('admin','manager','data_entry','viewer') or
   (public.current_role()='chief' and public.current_unit()=target_unit),false)
$$;
create or replace function public.can_read_participants(target_units text[]) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.current_role() in ('admin','manager','data_entry','viewer') or
   (public.current_role()='chief' and public.current_unit()=any(target_units)),false)
$$;

alter table public.units enable row level security;
alter table public.app_users enable row level security;
alter table public.personnel enable row level security;
alter table public.personnel_private enable row level security;
alter table public.plans enable row level security;
alter table public.activities enable row level security;
alter table public.tracked_work enable row level security;
alter table public.record_history enable row level security;
alter table public.unit_field_schemas enable row level security;
alter table public.legacy_review enable row level security;

create policy units_read on public.units for select to authenticated using (public.current_role() is not null);
create policy units_admin_create on public.units for insert to authenticated with check (public.current_role()='admin');
create policy units_admin_update on public.units for update to authenticated using (public.current_role()='admin') with check (public.current_role()='admin');
create policy users_read_self_or_admin on public.app_users for select to authenticated using (id=auth.uid() or public.current_role()='admin');
create policy users_admin_create on public.app_users for insert to authenticated with check (public.current_role()='admin');
create policy users_admin_update on public.app_users for update to authenticated using (public.current_role()='admin') with check (public.current_role()='admin');
create policy personnel_read on public.personnel for select to authenticated using (public.can_read_unit(unit_id));
create policy personnel_write on public.personnel for insert to authenticated with check (public.can_write_records());
create policy personnel_update on public.personnel for update to authenticated using (public.can_write_records()) with check (public.can_write_records() and unit_id=(select unit_id from public.personnel p where p.id=personnel.id));
create policy personnel_private_manager_read on public.personnel_private for select to authenticated using (public.is_manager());
create policy personnel_private_manager_insert on public.personnel_private for insert to authenticated with check (public.is_manager());
create policy personnel_private_manager_update on public.personnel_private for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy plans_read on public.plans for select to authenticated using (public.can_read_participants(participants));
create policy plans_write on public.plans for insert to authenticated with check (public.current_role() in ('admin','manager','data_entry'));
create policy plans_update on public.plans for update to authenticated using (public.current_role() in ('admin','manager','data_entry')) with check (public.current_role() in ('admin','manager','data_entry'));
create policy activities_read on public.activities for select to authenticated using (public.can_read_participants(participants));
create policy activities_write on public.activities for insert to authenticated with check (public.can_write_records());
create policy activities_update on public.activities for update to authenticated using (public.can_write_records()) with check (public.can_write_records());
create policy tasks_read on public.tracked_work for select to authenticated using (public.can_read_participants(participants));
create policy tasks_write on public.tracked_work for insert to authenticated with check (public.can_write_records() or public.current_role()='manager');
create policy tasks_update on public.tracked_work for update to authenticated using (public.can_write_records() or public.current_role()='manager') with check (public.can_write_records() or public.current_role()='manager');
create policy history_read on public.record_history for select to authenticated using (
 public.current_role()='admin' or exists(select 1 from public.personnel p where p.id=record_history.record_id and public.can_read_unit(p.unit_id)) or
 exists(select 1 from public.plans p where p.id=record_history.record_id and public.can_read_participants(p.participants)) or
 exists(select 1 from public.activities a where a.id=record_history.record_id and public.can_read_participants(a.participants)) or
 exists(select 1 from public.tracked_work t where t.id=record_history.record_id and public.can_read_participants(t.participants))
);
create policy schema_admin_read on public.unit_field_schemas for select to authenticated using (public.current_role()='admin' or public.can_read_unit(unit_id));
create policy schema_admin_write on public.unit_field_schemas for all to authenticated using (public.current_role()='admin') with check (public.current_role()='admin');
create policy legacy_review_admin on public.legacy_review for all to authenticated using (public.current_role()='admin') with check (public.current_role()='admin');

-- Column-level privilege keeps phone out of ordinary role queries even if RLS allows the row.
revoke all on public.personnel_private from anon, authenticated;
grant select,insert,update on public.personnel_private to authenticated;
revoke select on public.personnel_private from authenticated;
grant select on public.personnel_private to authenticated;
revoke select(phone) on public.personnel_private from authenticated;
grant select(personnel_id,updated_at,updated_by) on public.personnel_private to authenticated;
grant select(phone) on public.personnel_private to authenticated;

-- Public roles may read but cannot forge or erase audit history.
grant select on public.record_history to authenticated;
revoke insert,update,delete,truncate on public.record_history from anon,authenticated;

-- File objects live in the private `syp-records` Storage bucket; file metadata/path only here.

create or replace function public.audit_syp_record() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  old_json jsonb := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old)-'phone' end;
  new_json jsonb := to_jsonb(new)-'phone';
  key text;
  delta jsonb := '{}'::jsonb;
  record_key text;
  label text;
  action_label text;
begin
  record_key := coalesce(new_json->>'personnel_id',new_json->>'id',old_json->>'personnel_id',old_json->>'id');
  select display_name into label from public.app_users where id=auth.uid();
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
  values(tg_table_name,record_key,auth.uid(),coalesce(label,'SYP veri geçişi'),action_label,delta);
  return new;
end $$;
create trigger personnel_audit after insert or update on public.personnel for each row execute function public.audit_syp_record();
create trigger phone_audit after insert or update on public.personnel_private for each row execute function public.audit_syp_record();
create trigger plans_audit after insert or update on public.plans for each row execute function public.audit_syp_record();
create trigger activities_audit after insert or update on public.activities for each row execute function public.audit_syp_record();
create trigger tasks_audit after insert or update on public.tracked_work for each row execute function public.audit_syp_record();

create or replace function public.guard_syp_update() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_json jsonb:=to_jsonb(old);new_json jsonb:=to_jsonb(new); key text;
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
 new.updated_by:=auth.uid();
 return new;
end $$;
create trigger personnel_guard before update on public.personnel for each row execute function public.guard_syp_update();
create trigger plan_guard_update before update on public.plans for each row execute function public.guard_syp_update();
create trigger activity_guard_update before update on public.activities for each row execute function public.guard_syp_update();
create trigger task_guard_update before update on public.tracked_work for each row execute function public.guard_syp_update();

create or replace function public.guard_plan() returns trigger language plpgsql security definer set search_path=public as $$
declare p_unit text; starts_ts timestamptz; ends_ts timestamptz; conflict_exists boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.personnel_id||':'||new.work_date::text,0));
 if public.current_role() = 'manager' and length(trim(coalesce(new.override_explanation, ''))) = 0 then
  raise exception 'Yönetici plan istisnası için açıklama zorunludur' using errcode='42501';
 end if;
 select unit_id into p_unit from public.personnel where id=new.personnel_id and not archived;
 if p_unit is null or p_unit<>new.unit_id then raise exception 'Personel etkin olmalı ve kendi biriminde görev almalı' using errcode='23514'; end if;
 if not new.unit_id=any(new.participants) then raise exception 'Görevlendirilen birim katılımcılar arasında bulunmalı' using errcode='23514'; end if;
 starts_ts := (new.work_date::text||' '||new.starts_at::text)::timestamp at time zone 'Europe/Istanbul';
 ends_ts := ((new.work_date + case when new.ends_at<=new.starts_at then 1 else 0 end)::text||' '||new.ends_at::text)::timestamp at time zone 'Europe/Istanbul';
 select exists(select 1 from public.plans p where p.personnel_id=new.personnel_id and p.work_date=new.work_date and p.id<>new.id and not p.archived and not p.canceled and tstzrange(
  (p.work_date::text||' '||p.starts_at::text)::timestamp at time zone 'Europe/Istanbul',
  ((p.work_date + case when p.ends_at<=p.starts_at then 1 else 0 end)::text||' '||p.ends_at::text)::timestamp at time zone 'Europe/Istanbul','[)') && tstzrange(starts_ts,ends_ts,'[)')) into conflict_exists;
 if conflict_exists and not (public.current_role() in ('admin','manager') and length(trim(new.override_explanation))>0) then
  raise exception 'Bu personelin aynı zaman aralığında başka görevi var; yönetici açıklamalı istisna gerekir' using errcode='23P01';
 end if;
 return new;
end $$;
create trigger plan_validate before insert or update of personnel_id,unit_id,participants,work_date,starts_at,ends_at,canceled,archived,override_explanation on public.plans for each row execute function public.guard_plan();

create or replace function public.guard_activity() returns trigger language plpgsql security definer set search_path=public as $$
declare p_unit text;
begin
 if cardinality(new.participants)=0 then new.participants:=array[new.unit_id]; end if;
 if not new.unit_id=any(new.participants) then raise exception 'Çalışmanın kayıt birimi katılımcılar arasında bulunmalı' using errcode='23514'; end if;
 if new.personnel_id is not null then
  select unit_id into p_unit from public.personnel where id=new.personnel_id and not archived;
  if p_unit is null or p_unit<>new.unit_id then raise exception 'Personel etkin olmalı ve kendi biriminde görünmeli' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger activity_validate before insert or update of unit_id,personnel_id,participants on public.activities for each row execute function public.guard_activity();

create or replace function public.guard_task() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if cardinality(new.participants)=0 and new.unit_id is not null then new.participants:=array[new.unit_id]; end if;
 if new.unit_id is not null and not new.unit_id=any(new.participants) then raise exception 'İşin kayıt birimi katılımcılar arasında bulunmalı' using errcode='23514'; end if;
 if new.status='Tamamlandı' and new.closed_at is null then new.closed_at:=now(); end if;
 if new.status<>'Tamamlandı' then new.closed_at:=null; end if;
 return new;
end $$;
create trigger task_validate before insert or update of unit_id,participants,status,closed_at on public.tracked_work for each row execute function public.guard_task();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('syp-records','syp-records',false,350000,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=350000,allowed_mime_types=array['image/jpeg'];
create policy syp_photo_read on storage.objects for select to authenticated using (
  bucket_id='syp-records' and (
  public.current_role() in ('admin','manager','data_entry') or
  (public.current_role()='viewer' and (
   (storage.foldername(name))[1]='plans' and exists(select 1 from public.plans p where p.id=(storage.foldername(name))[2]) or
   (storage.foldername(name))[1]='activities' and exists(select 1 from public.activities a where a.id=(storage.foldername(name))[2]) or
   (storage.foldername(name))[1]='personnel' and exists(select 1 from public.personnel p where p.id=(storage.foldername(name))[2])
  )) or
  (public.current_role()='chief' and (
   exists(select 1 from public.plans p where p.id=(storage.foldername(name))[2] and p.unit_id=public.current_unit()) or
   exists(select 1 from public.activities a where a.id=(storage.foldername(name))[2] and public.current_unit()=any(a.participants)) or
   exists(select 1 from public.personnel p where p.id=(storage.foldername(name))[2] and p.unit_id=public.current_unit())
  ))
 )
);
create policy syp_photo_write on storage.objects for insert to authenticated with check (
 bucket_id='syp-records' and public.can_write_records() and
 (array_length(storage.foldername(name),1)=2) and
 ((storage.foldername(name))[1]='plans' and exists(select 1 from public.plans p where p.id=(storage.foldername(name))[2]) or
  (storage.foldername(name))[1]='activities' and exists(select 1 from public.activities a where a.id=(storage.foldername(name))[2]) or
  (storage.foldername(name))[1]='personnel' and exists(select 1 from public.personnel p where p.id=(storage.foldername(name))[2]))
);
create policy syp_photo_admin_delete on storage.objects for delete to authenticated using (
 bucket_id='syp-records' and public.current_role()='admin'
);
