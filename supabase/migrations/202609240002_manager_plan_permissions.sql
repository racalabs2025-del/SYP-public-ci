-- Managers may create and edit ordinary plans. The plan trigger still requires
-- a non-empty explanation before accepting an actual schedule overlap.
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for insert to authenticated
  with check (public.current_role() in ('admin','manager','data_entry'));

drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans for update to authenticated
  using (public.current_role() in ('admin','manager','data_entry'))
  with check (public.current_role() in ('admin','manager','data_entry'));
