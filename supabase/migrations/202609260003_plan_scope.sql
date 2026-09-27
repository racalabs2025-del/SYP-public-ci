alter table public.plans
  add column if not exists scope_type text not null default 'ILCE'
    check (scope_type in ('ILCE', 'YAKA', 'BOLGE', 'EKIP', 'MERKEZ')),
  add column if not exists scope_name text not null default '';

alter table public.plans alter column district_id drop not null;

create index if not exists plans_scope_window_idx
  on public.plans (unit_id, scope_type, work_date desc)
  where archived = false and canceled = false;
