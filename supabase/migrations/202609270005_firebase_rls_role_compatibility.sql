-- Firebase third-party ID tokens are evaluated by PostgREST with the `anon`
-- database role. Keep both Supabase roles on every policy while authorization
-- continues to come from the active app_users profile and Firebase issuer guard.

do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'plans', 'tracked_work', 'record_history', 'record_notes', 'field_updates'
      )
  loop
    execute format(
      'alter policy %I on %I.%I to anon, authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end $$;

drop policy if exists firebase_identity_guard on public.field_updates;
create policy firebase_identity_guard on public.field_updates as restrictive
  for all to anon, authenticated
  using (public.is_syp_firebase_identity())
  with check (public.is_syp_firebase_identity());

drop policy if exists firebase_identity_guard on public.record_notes;
create policy firebase_identity_guard on public.record_notes as restrictive
  for all to anon, authenticated
  using (public.is_syp_firebase_identity())
  with check (public.is_syp_firebase_identity());

grant select, insert, update on public.field_updates to anon, authenticated;
grant select, insert on public.record_notes to anon, authenticated;
grant usage, select on sequence public.record_notes_id_seq to anon, authenticated;
grant select on public.record_history to anon, authenticated;

revoke delete, truncate on public.field_updates, public.record_notes
  from anon, authenticated;
revoke insert, update, delete, truncate on public.record_history
  from anon, authenticated;
