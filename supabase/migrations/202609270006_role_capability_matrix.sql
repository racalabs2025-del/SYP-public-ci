-- Canonical database capability resolver. UI uses the matching ROLE_MATRIX and
-- integration tests assert every role/capability pair against this function.
create or replace function public.role_capability(capability text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(case capability
    when 'read' then public.current_role() in ('admin','manager','data_entry','chief','viewer')
    when 'write_records' then public.current_role() in ('admin','data_entry')
    when 'view_phone' then public.current_role() in ('admin','manager')
    when 'add_notes' then public.current_role() in ('admin','manager','chief')
    when 'manage_users' then public.current_role() = 'admin'
    when 'manage_settings' then public.current_role() = 'admin'
    when 'archive_records' then public.current_role() = 'admin'
    else false
  end, false)
$$;

create or replace function public.can_write_records() returns boolean
language sql stable security definer set search_path=public as $$
  select public.role_capability('write_records')
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path=public as $$
  select public.role_capability('view_phone')
$$;

grant execute on function public.role_capability(text) to anon, authenticated;
grant execute on function public.can_write_records() to anon, authenticated;
grant execute on function public.is_manager() to anon, authenticated;

drop policy if exists record_notes_insert on public.record_notes;
create policy record_notes_insert on public.record_notes
  for insert to anon, authenticated
  with check (
    public.role_capability('add_notes')
    and author_id = public.current_user_id()
  );
