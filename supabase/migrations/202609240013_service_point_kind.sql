-- The same service directory holds staffed solution points and branches.
alter table public.service_points
  add column kind text not null default 'NOKTA'
  check(kind in ('NOKTA','SUBE'));
