insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('syp-records','syp-records',false,524288,'{image/jpeg}')
on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types='{image/jpeg}';

create policy syp_records_read on storage.objects for select to anon,authenticated
  using (bucket_id='syp-records' and public.can_read_unit((storage.foldername(name))[1]));
create policy syp_records_insert on storage.objects for insert to anon,authenticated
  with check (bucket_id='syp-records' and public.current_role() in ('admin','manager','data_entry'));
create policy syp_records_update on storage.objects for update to anon,authenticated
  using (bucket_id='syp-records' and public.current_role() in ('admin','manager','data_entry'))
  with check (bucket_id='syp-records' and public.current_role() in ('admin','manager','data_entry'));
create policy syp_records_delete on storage.objects for delete to anon,authenticated
  using (bucket_id='syp-records' and public.current_role()='admin');
