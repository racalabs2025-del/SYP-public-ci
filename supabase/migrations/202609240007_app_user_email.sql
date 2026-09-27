alter table public.app_users add column if not exists email text;

-- Keep the seeded units in a clear initial state for the operator-facing dashboard.
insert into public.unit_data_status(unit_id,has_data)
select id,false from public.units
on conflict(unit_id) do nothing;
