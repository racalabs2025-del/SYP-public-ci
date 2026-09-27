-- Operational records are entered by the central data team only.
-- Managers and chiefs will receive a separate record-note capability.
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for insert to authenticated
  with check (public.can_write_records());

drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans for update to authenticated
  using (public.can_write_records())
  with check (public.can_write_records());

drop policy if exists tasks_write on public.tracked_work;
create policy tasks_write on public.tracked_work for insert to authenticated
  with check (public.can_write_records());

drop policy if exists tasks_update on public.tracked_work;
create policy tasks_update on public.tracked_work for update to authenticated
  using (public.can_write_records())
  with check (public.can_write_records());
