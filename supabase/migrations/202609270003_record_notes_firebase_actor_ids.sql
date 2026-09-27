-- Firebase UID values are text in this project. auth.uid() expects a UUID and
-- can fail before the note policy compares the author. Use the shared Firebase
-- subject resolver instead, matching addRecordNote/addContextNote payloads.
drop policy if exists record_notes_insert on public.record_notes;
create policy record_notes_insert on public.record_notes
  for insert to authenticated
  with check (
    public.current_role() in ('admin','manager','chief')
    and author_id = public.current_user_id()
  );
