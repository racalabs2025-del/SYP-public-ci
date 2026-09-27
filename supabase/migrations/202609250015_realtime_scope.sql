-- Keep Realtime limited to the three operational datasets that drive the live
-- command screen. Reference, identity, private and audit data use ordinary
-- reads plus explicit refreshes after a successful mutation.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'units',
    'app_users',
    'personnel',
    'personnel_private',
    'record_history',
    'unit_field_schemas',
    'legacy_review',
    'unit_data_status',
    'service_points'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', table_name);
    end if;
  end loop;
end $$;
do $$
declare
  table_name text;
begin
  foreach table_name in array array['plans', 'activities', 'tracked_work']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
