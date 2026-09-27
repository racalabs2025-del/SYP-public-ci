-- A manager only needs an explanation when this plan actually overlaps another
-- active plan for the same employee. Ordinary plans remain frictionless.
create or replace function public.require_manager_plan_note() returns trigger
language plpgsql security definer set search_path=public as $$
declare has_conflict boolean;
begin
  if new.canceled or new.archived then return new; end if;
  select exists (
    select 1 from public.plans p
    where p.personnel_id=new.personnel_id and p.work_date between new.work_date - 1 and new.work_date + 1
      and p.id<>new.id and not p.canceled and not p.archived
      and tstzrange(
        (p.work_date + p.starts_at) at time zone 'Europe/Istanbul',
        ((p.work_date + p.ends_at) + case when p.ends_at<=p.starts_at then interval '1 day' else interval '0' end) at time zone 'Europe/Istanbul', '[)'
      ) && tstzrange(
        (new.work_date + new.starts_at) at time zone 'Europe/Istanbul',
        ((new.work_date + new.ends_at) + case when new.ends_at<=new.starts_at then interval '1 day' else interval '0' end) at time zone 'Europe/Istanbul', '[)'
      )
  ) into has_conflict;
  if has_conflict and public.current_role()='manager' and length(trim(coalesce(new.override_explanation,'')))=0 then
    raise exception 'Çakışan görev için yönetici açıklaması zorunludur' using errcode='23514';
  end if;
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
  if (to_jsonb(new) ? 'archived') then
    if coalesce((new_json->>'archived')::boolean,false) then
      new_json:=new_json || jsonb_build_object('archived_at',case when new_json->'archived_at' is null or new_json->'archived_at'='null'::jsonb then to_jsonb(now()) else new_json->'archived_at' end, 'archived_by',to_jsonb(public.current_user_id()));
    else
      new_json:=new_json || jsonb_build_object('archived_at','null'::jsonb,'archived_by','null'::jsonb);
    end if;
    new:=jsonb_populate_record(new,new_json);
  end if;
  new.updated_at:=now();
  new.updated_by:=public.current_user_id();
  return new;
end $$;

create or replace function public.mark_unit_data_present() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.unit_data_status(unit_id,first_record_at,has_data,updated_at)
    values(new.unit_id,now(),true,now())
  on conflict(unit_id) do update set has_data=true,first_record_at=coalesce(public.unit_data_status.first_record_at,excluded.first_record_at),updated_at=now();
  return new;
end $$;
drop trigger if exists personnel_mark_unit_data on public.personnel;
drop trigger if exists plans_mark_unit_data on public.plans;
drop trigger if exists activities_mark_unit_data on public.activities;
create trigger personnel_mark_unit_data after insert on public.personnel for each row execute function public.mark_unit_data_present();
create trigger plans_mark_unit_data after insert on public.plans for each row execute function public.mark_unit_data_present();
create trigger activities_mark_unit_data after insert on public.activities for each row execute function public.mark_unit_data_present();

update public.unit_data_status s set has_data=exists(
  select 1 from public.personnel p where p.unit_id=s.unit_id and not p.archived
  union all select 1 from public.plans p where p.unit_id=s.unit_id and not p.archived
  union all select 1 from public.activities a where a.unit_id=s.unit_id and not a.archived
), first_record_at=case when exists(select 1 from public.plans p where p.unit_id=s.unit_id) then coalesce(s.first_record_at,(select min(p.created_at) from public.plans p where p.unit_id=s.unit_id)) else s.first_record_at end;
