create or replace function public.require_manager_plan_note() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if public.current_role() = 'manager' and length(trim(coalesce(new.override_explanation, ''))) = 0 then
    raise exception 'Yönetici plan istisnası için açıklama zorunludur' using errcode='42501';
  end if;
  return new;
end $$;

drop trigger if exists manager_plan_note on public.plans;
create trigger manager_plan_note before insert or update on public.plans
for each row execute function public.require_manager_plan_note();
