create or replace function public.require_manager_plan_note() returns trigger
language plpgsql security definer set search_path=public as $$
declare has_conflict boolean; actor_role text:=public.current_role();
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
  if has_conflict and actor_role<>'admin' then
    if actor_role<>'manager' then
      raise exception 'Bu plan başka bir görevle çakışıyor; istisna yalnız Yönetici tarafından verilebilir' using errcode='23514';
    end if;
    if length(trim(coalesce(new.override_explanation,'')))=0 then
      raise exception 'Çakışan görev için yönetici açıklaması zorunludur' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
