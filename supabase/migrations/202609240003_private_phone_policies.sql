-- Keep phone rows invisible to data-entry users while allowing managers to
-- create, read, and update the private contact record.
drop policy if exists personnel_private_admin_entry_write on public.personnel_private;
drop policy if exists personnel_private_manager_insert on public.personnel_private;
drop policy if exists personnel_private_manager_update on public.personnel_private;

create policy personnel_private_manager_insert on public.personnel_private for insert to authenticated
  with check (public.is_manager());
create policy personnel_private_manager_update on public.personnel_private for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
