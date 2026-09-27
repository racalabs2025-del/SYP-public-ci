-- Keep plan writes consistent with the form and import preview. An ordinary
-- manager plan needs no note; a manager overlap needs an explanation.
drop trigger if exists manager_plan_note on public.plans;

create or replace function public.guard_plan() returns trigger
language plpgsql security definer set search_path=public as $$
declare p_unit text; conflict_exists boolean; actor_role text:=public.current_role();
begin
  -- Lock the employee across adjacent dates as overnight shifts may overlap.
  perform pg_advisory_xact_lock(hashtextextended(new.personnel_id,0));
  select unit_id into p_unit from public.personnel
    where id=new.personnel_id and not archived;
  if p_unit is null or p_unit<>new.unit_id then
    raise exception 'Personel etkin olmalı ve kendi biriminde görev almalı' using errcode='23514';
  end if;
  if not new.unit_id=any(new.participants) then
    raise exception 'Görevlendirilen birim katılımcılar arasında bulunmalı' using errcode='23514';
  end if;
  if new.canceled or new.archived then return new; end if;

  select exists (
    select 1 from public.plans p
    where p.personnel_id=new.personnel_id
      and p.work_date between new.work_date - 1 and new.work_date + 1
      and p.id<>new.id and not p.archived and not p.canceled
      and tstzrange(
        (p.work_date + p.starts_at) at time zone 'Europe/Istanbul',
        ((p.work_date + p.ends_at) + case when p.ends_at<=p.starts_at then interval '1 day' else interval '0' end) at time zone 'Europe/Istanbul', '[)'
      ) && tstzrange(
        (new.work_date + new.starts_at) at time zone 'Europe/Istanbul',
        ((new.work_date + new.ends_at) + case when new.ends_at<=new.starts_at then interval '1 day' else interval '0' end) at time zone 'Europe/Istanbul', '[)'
      )
  ) into conflict_exists;

  if conflict_exists and actor_role<>'admin' then
    if actor_role<>'manager' then
      raise exception 'Bu personelin aynı zaman aralığında başka görevi var; istisna yalnız Yönetici tarafından verilebilir' using errcode='23P01';
    end if;
    if length(trim(coalesce(new.override_explanation,'')))=0 then
      raise exception 'Çakışan görev için yönetici açıklaması zorunludur' using errcode='23P01';
    end if;
  end if;
  return new;
end $$;
