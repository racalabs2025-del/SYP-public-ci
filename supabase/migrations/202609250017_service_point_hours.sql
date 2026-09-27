alter table public.service_points
  add column if not exists working_hours jsonb not null default '{}'::jsonb;
