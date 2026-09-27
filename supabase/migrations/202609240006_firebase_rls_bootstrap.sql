-- Firebase ID tokens without custom claims are assigned Postgres role `anon`
-- by Supabase. Allow that role only through the same profile-backed RLS rules.
-- The Firebase third-party provider validates the issuer/audience at the API edge;
-- every table is still restricted to an active app_users profile and its role.
create or replace function public.is_syp_firebase_identity() returns boolean
language sql stable security invoker set search_path=public,auth as $$
  select coalesce(
    auth.jwt()->>'iss' = 'https://securetoken.google.com/foodsense-e1bf6'
    and auth.jwt()->>'aud' = 'foodsense-e1bf6'
    and nullif(auth.jwt()->>'sub','') is not null, false
  )
$$;

do $$
declare p record;
begin
  for p in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('units','app_users','personnel','personnel_private','plans','activities','tracked_work','record_history','unit_field_schemas','legacy_review')
  loop
    execute format('alter policy %I on %I.%I to anon, authenticated',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

grant select,insert,update on public.units,public.app_users,public.personnel,public.personnel_private,
  public.plans,public.activities,public.tracked_work,public.unit_field_schemas,public.legacy_review to anon;
grant select on public.record_history to anon;
revoke delete,truncate on public.units,public.app_users,public.personnel,public.personnel_private,
  public.plans,public.activities,public.tracked_work,public.record_history,public.unit_field_schemas,public.legacy_review from anon,authenticated;
grant usage,select on sequence public.record_history_id_seq to anon,authenticated;

-- Phone number remains restricted to manager roles by RLS and column privilege.
grant select(personnel_id,updated_at,updated_by) on public.personnel_private to anon;
grant select(phone) on public.personnel_private to anon;

create table public.unit_data_status (
  unit_id text primary key references public.units(id),
  first_record_at timestamptz,
  has_data boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.unit_data_status enable row level security;
create policy unit_data_status_read on public.unit_data_status for select to anon,authenticated
  using (public.can_read_unit(unit_id));
create policy unit_data_status_admin_write on public.unit_data_status for all to anon,authenticated
  using (public.current_role()='admin') with check (public.current_role()='admin');
grant select,insert,update on public.unit_data_status to anon,authenticated;

do $$
begin
  alter publication supabase_realtime add table public.units;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.app_users,public.personnel,public.personnel_private,
    public.plans,public.activities,public.tracked_work,public.record_history,public.unit_field_schemas,
    public.legacy_review,public.unit_data_status;
exception when duplicate_object then null;
end $$;

grant execute on function public.is_syp_firebase_identity() to anon,authenticated;
