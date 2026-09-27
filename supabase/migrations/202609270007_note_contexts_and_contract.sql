-- District and neighbourhood notes are explicit product contexts, not table
-- names. Activity confirmation remains mandatory across UI, import and schema.
alter table public.record_notes
  drop constraint if exists record_notes_table_name_check;
alter table public.record_notes
  add constraint record_notes_table_name_check check (table_name in (
    'personnel', 'personnel_private', 'plans', 'activities', 'tracked_work',
    'field_updates', 'service_points', 'district', 'neighborhood'
  ));

alter table public.activities
  validate constraint activities_confirmed_by_nonempty;
