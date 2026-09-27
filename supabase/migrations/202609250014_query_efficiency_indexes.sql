-- Targeted indexes for filters used by the current product queries.
-- Apply through the normal reviewed migration process; this file does not
-- execute against Supabase by itself.

-- Array membership powers cross-unit visibility for shared plans/activities/tasks.
create index if not exists plans_participants_gin_idx
  on public.plans using gin (participants);
create index if not exists activities_participants_gin_idx
  on public.activities using gin (participants);
create index if not exists tracked_work_participants_gin_idx
  on public.tracked_work using gin (participants);

-- Profile pagination filters by person and orders deterministically by id.
create index if not exists plans_person_id_idx
  on public.plans (personnel_id, id);

-- Supports the profile history timeline and RLS record lookups efficiently.
create index if not exists record_history_record_timeline_idx
  on public.record_history (table_name, record_id, recorded_at desc, id desc);

-- The existing closed-work partial index requires status='Tamamlandı', while
-- the current date-window query filters closed_at only.
create index if not exists tracked_work_closed_at_idx
  on public.tracked_work (closed_at desc)
  where closed_at is not null;

-- Personnel list is unit-scoped and excludes archived records in most views.
create index if not exists personnel_active_unit_name_idx
  on public.personnel (unit_id, full_name)
  where archived = false;
