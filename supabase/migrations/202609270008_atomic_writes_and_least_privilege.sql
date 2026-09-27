-- Keep multi-row imports and personnel/private-phone writes in one transaction.
-- The function is SECURITY INVOKER, so table RLS and all update guards remain active.
create or replace function public.save_syp_records_atomic(p_kind text, p_records jsonb)
returns text[]
language plpgsql security invoker set search_path=public,pg_catalog as $$
declare
  target_table text;
  item jsonb;
  payload jsonb;
  insert_columns text;
  select_columns text;
  update_assignments text;
  record_id text;
  expected_version integer;
  saved_id text;
  saved_ids text[] := '{}';
begin
  if not public.role_capability('write_records') then
    raise exception 'Bu işlem için merkezi veri giriş yetkisi gerekiyor' using errcode='42501';
  end if;
  target_table := case p_kind
    when 'personnel' then 'personnel'
    when 'plans' then 'plans'
    when 'activities' then 'activities'
    when 'tasks' then 'tracked_work'
    when 'fieldUpdates' then 'field_updates'
    else null
  end;
  if target_table is null then raise exception 'Desteklenmeyen kayıt türü'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) not between 1 and 500 then
    raise exception 'İşlem 1 ile 500 kayıt içermelidir';
  end if;

  for item in select value from jsonb_array_elements(p_records)
  loop
    payload := item->'payload';
    record_id := nullif(payload->>'id','');
    expected_version := nullif(item->>'expectedVersion','')::integer;
    if record_id is null or jsonb_typeof(payload) <> 'object' then raise exception 'Geçersiz kayıt yükü'; end if;

    select
      string_agg(format('%I', key), ',' order by key),
      string_agg(format('source.%I', key), ',' order by key),
      string_agg(format('%I = source.%I', key, key), ',' order by key) filter (where key <> 'id')
    into insert_columns, select_columns, update_assignments
    from jsonb_object_keys(payload) as keys(key)
    where exists (
      select 1 from pg_attribute
      where attrelid = format('public.%I', target_table)::regclass
        and attname = key and attnum > 0 and not attisdropped
    );

    if expected_version is null then
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) source returning id::text',
        target_table, insert_columns, select_columns, target_table
      ) into saved_id using payload;
    else
      execute format(
        'update public.%I target set %s from jsonb_populate_record(null::public.%I,$1) source where target.id=$2 and target.version=$3 returning target.id::text',
        target_table, update_assignments, target_table
      ) into saved_id using payload, record_id, expected_version;
      if saved_id is null then
        raise exception 'Kayıt başka bir işlemde değişti. Yeniden yükleyip tekrar deneyin.' using errcode='40001';
      end if;
    end if;

    if p_kind = 'personnel' and coalesce((item->>'writePhone')::boolean,false) then
      if not public.role_capability('view_phone') then raise exception 'Telefon bilgisi için yetkiniz yok' using errcode='42501'; end if;
      insert into public.personnel_private(personnel_id,phone,updated_by)
      values(record_id,coalesce(item->>'phone',''),public.current_user_id())
      on conflict(personnel_id) do update
        set phone=excluded.phone,updated_at=now(),updated_by=excluded.updated_by;
    end if;
    saved_ids := array_append(saved_ids, saved_id);
  end loop;
  return saved_ids;
end $$;

revoke all on function public.save_syp_records_atomic(text,jsonb) from public;
grant execute on function public.save_syp_records_atomic(text,jsonb) to anon,authenticated;

-- Record notes follow the target record's unit/participant visibility. Geographic
-- district/neighbourhood notes are shared among active panel members.
create or replace function public.can_read_record_note(target_table text, target_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    case target_table
      when 'personnel' then exists(select 1 from public.personnel p where p.id=target_id and public.can_read_unit(p.unit_id))
      when 'personnel_private' then public.role_capability('view_phone') and exists(select 1 from public.personnel p where p.id=target_id and public.can_read_unit(p.unit_id))
      when 'plans' then exists(select 1 from public.plans p where p.id=target_id and public.can_read_participants(p.participants))
      when 'activities' then exists(select 1 from public.activities a where a.id=target_id and public.can_read_participants(a.participants))
      when 'tracked_work' then exists(select 1 from public.tracked_work t where t.id=target_id and public.can_read_participants(t.participants))
      when 'field_updates' then exists(select 1 from public.field_updates f where f.id=target_id and public.can_read_unit(f.unit_id))
      when 'service_points' then exists(select 1 from public.service_points s where s.id=target_id and public.can_read_unit(s.unit_id))
      when 'district' then public.role_capability('read')
      when 'neighborhood' then public.role_capability('read')
      else false
    end, false
  )
$$;
grant execute on function public.can_read_record_note(text,text) to anon,authenticated;

drop policy if exists record_notes_read on public.record_notes;
create policy record_notes_read on public.record_notes for select to anon,authenticated
  using (public.can_read_record_note(table_name,record_id));
drop policy if exists record_notes_insert on public.record_notes;
create policy record_notes_insert on public.record_notes for insert to anon,authenticated
  with check (
    public.role_capability('add_notes')
    and author_id=public.current_user_id()
    and public.can_read_record_note(table_name,record_id)
  );

-- Explicit least-privilege grants. RLS remains the row-level boundary.
revoke all on public.field_updates,public.record_notes from anon,authenticated;
grant select,insert,update on public.field_updates to anon,authenticated;
grant select,insert on public.record_notes to anon,authenticated;
revoke delete,truncate on public.units,public.app_users,public.personnel,public.personnel_private,
  public.plans,public.activities,public.tracked_work,public.record_history,public.unit_field_schemas,
  public.legacy_review,public.unit_data_status,public.service_points,public.field_updates,public.record_notes
  from anon,authenticated;

drop policy if exists syp_records_insert on storage.objects;
create policy syp_records_insert on storage.objects for insert to anon,authenticated
  with check (bucket_id='syp-records' and public.can_write_records());
drop policy if exists syp_records_update on storage.objects;
create policy syp_records_update on storage.objects for update to anon,authenticated
  using (bucket_id='syp-records' and public.can_write_records())
  with check (bucket_id='syp-records' and public.can_write_records());
drop policy if exists syp_records_delete on storage.objects;
create policy syp_records_delete on storage.objects for delete to anon,authenticated
  using (
    bucket_id='syp-records' and public.can_write_records()
    and public.can_read_unit((storage.foldername(name))[1])
  );
