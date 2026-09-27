-- The fourth field unit and its physical service locations. No point or staff
-- records are seeded: the institution will provide the verified inventory.
update public.units set name='Meydan Yönetim Şefliği' where id='MEYDAN';
update public.units set name='Yerinde Çözüm Şefliği' where id='YERINDE_COZUM';
update public.units set name='Saha Hizmetleri Şefliği' where id='SAHA_HIZMETLERI';
insert into public.units(id,name) values
  ('COZUM_NOKTALARI','Çözüm Noktaları ve Şubeleri Şefliği')
on conflict(id) do update set name=excluded.name;

create table public.service_points (
  id text primary key check(id ~ '^[A-Za-z0-9_-]{2,100}$'),
  unit_id text not null default 'COZUM_NOKTALARI' references public.units(id)
    check(unit_id='COZUM_NOKTALARI'),
  name text not null check(length(trim(name)) between 2 and 160),
  district_id text not null check(length(trim(district_id))>0),
  neighborhood_id text not null default '',
  square_id text not null default '',
  address text not null default '',
  description text not null default '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  active boolean not null default true,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  deactivated_at timestamptz,
  deactivated_by text,
  check((latitude is null and longitude is null) or
        (latitude between 40 and 42 and longitude between 27 and 31)),
  check(active or deactivated_at is not null)
);
create index service_points_district_idx on public.service_points(district_id,name);
create index service_points_neighborhood_idx on public.service_points(neighborhood_id) where neighborhood_id<>'';

alter table public.personnel add column service_point_id text references public.service_points(id);
alter table public.plans add column service_point_id text references public.service_points(id);
alter table public.activities add column service_point_id text references public.service_points(id);
create index personnel_service_point_idx on public.personnel(service_point_id) where service_point_id is not null;
create index plans_service_point_date_idx on public.plans(service_point_id,work_date) where service_point_id is not null;
create index activities_service_point_date_idx on public.activities(service_point_id,work_date) where service_point_id is not null;

create or replace function public.guard_service_point_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
declare point_unit text; point_district text; point_neighborhood text; point_square text;
begin
  if new.service_point_id is null then return new; end if;
  select unit_id,district_id,neighborhood_id,square_id
    into point_unit,point_district,point_neighborhood,point_square
    from public.service_points where id=new.service_point_id and active;
  if point_unit is null then raise exception 'Çözüm noktası bulunamadı veya pasif' using errcode='23514'; end if;
  if new.unit_id<>point_unit then raise exception 'Personel ve görev, çözüm noktasının birimine ait olmalı' using errcode='23514'; end if;
  if tg_table_name in ('plans','activities') then
    if new.district_id<>point_district or
       (point_neighborhood<>'' and new.neighborhood_id<>point_neighborhood) or
       (point_square<>'' and new.square_id<>point_square) then
      raise exception 'Görev konumu seçilen çözüm noktasıyla eşleşmiyor' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger personnel_service_point_guard before insert or update of service_point_id,unit_id
  on public.personnel for each row execute function public.guard_service_point_assignment();
create trigger plans_service_point_guard before insert or update of service_point_id,unit_id,district_id,neighborhood_id,square_id
  on public.plans for each row execute function public.guard_service_point_assignment();
create trigger activities_service_point_guard before insert or update of service_point_id,unit_id,district_id,neighborhood_id,square_id
  on public.activities for each row execute function public.guard_service_point_assignment();

alter table public.record_history drop constraint record_history_table_name_check;
alter table public.record_history add constraint record_history_table_name_check
  check(table_name in ('personnel','personnel_private','plans','activities','tracked_work','service_points'));

create or replace function public.guard_service_point_update() returns trigger
language plpgsql security definer set search_path=public,auth as $$
begin
  if old.active is distinct from new.active and public.current_role()<>'admin'
     and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Çözüm noktasını yalnız Admin pasife alabilir' using errcode='42501';
  end if;
  if old.active and not new.active then
    new.deactivated_at:=now(); new.deactivated_by:=public.current_user_id();
  elsif not old.active and new.active then
    new.deactivated_at:=null; new.deactivated_by:=null;
  end if;
  new.updated_at:=now(); new.updated_by:=public.current_user_id();
  return new;
end $$;
create trigger service_points_guard before update on public.service_points
  for each row execute function public.guard_service_point_update();

create or replace function public.audit_service_point() returns trigger
language plpgsql security definer set search_path=public,auth as $$
declare old_json jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
        new_json jsonb:=to_jsonb(new); changes_json jsonb:='{}'::jsonb;
        key text; actor_name text; action_name text;
begin
  select display_name into actor_name from public.app_users where id=public.current_user_id();
  if tg_op='INSERT' then action_name:='Oluşturuldu';
  elsif old.active and not new.active then action_name:='Pasife alındı';
  elsif not old.active and new.active then action_name:='Yeniden etkinleştirildi';
  else action_name:='Güncellendi'; end if;
  if tg_op='UPDATE' then
    for key in select jsonb_object_keys(new_json) loop
      if old_json->key is distinct from new_json->key then
        changes_json:=changes_json || jsonb_build_object(key,jsonb_build_object('before',old_json->key,'after',new_json->key));
      end if;
    end loop;
  end if;
  insert into public.record_history(table_name,record_id,actor,actor_label,action,changes)
  values('service_points',new.id,public.current_user_id(),coalesce(actor_name,'SYP veri geçişi'),action_name,changes_json);
  return new;
end $$;
create trigger service_points_audit after insert or update on public.service_points
  for each row execute function public.audit_service_point();

alter table public.service_points enable row level security;
create policy service_points_firebase_guard on public.service_points as restrictive
  for all to anon,authenticated using (public.is_syp_firebase_identity())
  with check (public.is_syp_firebase_identity());
create policy service_points_read on public.service_points for select to anon,authenticated
  using (public.can_read_unit(unit_id));
create policy service_points_insert on public.service_points for insert to anon,authenticated
  with check (public.can_write_records());
create policy service_points_update on public.service_points for update to anon,authenticated
  using (public.can_write_records()) with check (public.can_write_records());
grant select,insert,update on public.service_points to anon,authenticated;
revoke delete,truncate on public.service_points from anon,authenticated;

drop policy history_read on public.record_history;
create policy history_read on public.record_history for select to anon,authenticated using (
  public.current_role()='admin' or
  exists(select 1 from public.personnel p where p.id=record_history.record_id and public.can_read_unit(p.unit_id)) or
  exists(select 1 from public.plans p where p.id=record_history.record_id and public.can_read_participants(p.participants)) or
  exists(select 1 from public.activities a where a.id=record_history.record_id and public.can_read_participants(a.participants)) or
  exists(select 1 from public.tracked_work t where t.id=record_history.record_id and public.can_read_participants(t.participants)) or
  exists(select 1 from public.service_points s where s.id=record_history.record_id and public.can_read_unit(s.unit_id))
);

create trigger service_points_mark_unit_data after insert on public.service_points
  for each row execute function public.mark_unit_data_present();
alter publication supabase_realtime add table public.service_points;
