-- Daily, centrally curated field updates. The feed is separate from weekly
-- highlighted work and tracked work. `photo_path` is technical Storage
-- metadata; it is never shown as an operator-facing field.
create table if not exists public.field_updates (
  id text primary key,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null check (char_length(trim(description)) between 1 and 4000),
  unit_id text not null references public.units(id),
  team text not null default '',
  occurred_at timestamptz not null,
  district_id text not null default '',
  neighborhood_id text not null default '',
  square_id text not null default '',
  service_point_id text references public.service_points(id),
  photo_path text,
  photo_removed boolean not null default false,
  archived boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create index if not exists field_updates_occurred_idx on public.field_updates(occurred_at desc);
create index if not exists field_updates_unit_occurred_idx on public.field_updates(unit_id, occurred_at desc);
create index if not exists field_updates_district_occurred_idx on public.field_updates(district_id, occurred_at desc);
alter table public.field_updates enable row level security;

drop policy if exists field_updates_read on public.field_updates;
create policy field_updates_read on public.field_updates for select to authenticated
  using (public.can_read_unit(unit_id));
drop policy if exists field_updates_write on public.field_updates;
create policy field_updates_write on public.field_updates for insert to authenticated
  with check (public.can_write_records());
drop policy if exists field_updates_update on public.field_updates;
create policy field_updates_update on public.field_updates for update to authenticated
  using (public.can_write_records()) with check (public.can_write_records());

-- Keep the table in the existing audit allow-list where the audit trigger is
-- present in an already deployed database.
alter table public.record_notes drop constraint if exists record_notes_table_name_check;
alter table public.record_notes add constraint record_notes_table_name_check
  check (table_name in ('personnel','personnel_private','plans','activities','tracked_work','field_updates','service_points'));

alter table public.record_history drop constraint if exists record_history_table_name_check;
alter table public.record_history add constraint record_history_table_name_check
  check (table_name in ('personnel','personnel_private','plans','activities','tracked_work','field_updates','service_points'));

drop policy if exists history_read on public.record_history;
create policy history_read on public.record_history for select to authenticated using (
  public.current_role()='admin' or
  exists(select 1 from public.personnel p where p.id=record_history.record_id and public.can_read_unit(p.unit_id)) or
  exists(select 1 from public.plans p where p.id=record_history.record_id and public.can_read_participants(p.participants)) or
  exists(select 1 from public.activities a where a.id=record_history.record_id and public.can_read_participants(a.participants)) or
  exists(select 1 from public.tracked_work t where t.id=record_history.record_id and public.can_read_participants(t.participants)) or
  exists(select 1 from public.field_updates f where f.id=record_history.record_id and public.can_read_unit(f.unit_id)) or
  exists(select 1 from public.service_points s where s.id=record_history.record_id and public.can_read_unit(s.unit_id))
);

drop trigger if exists field_updates_audit on public.field_updates;
create trigger field_updates_audit after insert or update on public.field_updates for each row execute function public.audit_syp_record();
drop trigger if exists field_updates_guard on public.field_updates;
create trigger field_updates_guard before update on public.field_updates for each row execute function public.guard_syp_update();

-- The feed is a read/update stream, but it does not need a Realtime channel;
-- it is refreshed when the screen opens or the user explicitly refreshes.
