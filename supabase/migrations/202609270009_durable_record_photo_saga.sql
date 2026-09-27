-- Storage and PostgreSQL cannot share a transaction. Keep a durable database
-- cleanup queue so an interrupted browser request cannot strand uploaded files.
create table if not exists public.record_photo_gc (
  path text primary key,
  delete_after timestamptz not null default (now() + interval '2 hours'),
  reason text not null check (reason in ('staged_upload','replaced','removed')),
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.record_photo_gc enable row level security;
revoke all on public.record_photo_gc from anon,authenticated;

create or replace function public.is_managed_record_photo(p_path text)
returns boolean language sql immutable set search_path=public,pg_catalog as $$
  select coalesce(p_path ~ '^[A-Z0-9_]+/(personnel|plans|activities|tasks|fieldUpdates)/[0-9a-f-]{36}\.jpg$',false)
$$;

create or replace function public.stage_record_photo_upload(p_path text)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.firebase_identity_valid() or not public.role_capability('write_records') then
    raise exception 'Fotoğraf yüklemek için veri giriş yetkisi gerekiyor' using errcode='42501';
  end if;
  if not public.is_managed_record_photo(p_path)
     or not public.can_read_unit(split_part(p_path,'/',1)) then
    raise exception 'Geçersiz fotoğraf yolu' using errcode='22023';
  end if;
  insert into public.record_photo_gc(path,delete_after,reason,created_by)
  values(p_path,now() + interval '2 hours','staged_upload',public.current_user_id())
  on conflict(path) do update set
    delete_after=excluded.delete_after,
    reason=excluded.reason,
    created_by=excluded.created_by,
    created_at=now();
end $$;
revoke all on function public.stage_record_photo_upload(text) from public;
grant execute on function public.stage_record_photo_upload(text) to anon,authenticated;

create or replace function public.track_record_photo_lifecycle()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  old_path text;
  new_path text;
begin
  if tg_table_name = 'tracked_work' then
    old_path := case when tg_op = 'INSERT' then null else old.extra->>'fotoUrl' end;
    new_path := new.extra->>'fotoUrl';
  else
    old_path := case when tg_op = 'INSERT' then null else old.photo_path end;
    new_path := new.photo_path;
  end if;

  if public.is_managed_record_photo(new_path) then
    delete from public.record_photo_gc where path=new_path;
  end if;
  if public.is_managed_record_photo(old_path) and old_path is distinct from new_path then
    insert into public.record_photo_gc(path,delete_after,reason,created_by)
    values(old_path,now(),case when coalesce(new_path,'')='' then 'removed' else 'replaced' end,public.current_user_id())
    on conflict(path) do update set
      delete_after=least(public.record_photo_gc.delete_after,excluded.delete_after),
      reason=excluded.reason,
      created_by=excluded.created_by;
  end if;
  return new;
end $$;
revoke all on function public.track_record_photo_lifecycle() from public;

drop trigger if exists personnel_photo_lifecycle on public.personnel;
create trigger personnel_photo_lifecycle after insert or update of photo_path on public.personnel
for each row execute function public.track_record_photo_lifecycle();
drop trigger if exists activities_photo_lifecycle on public.activities;
create trigger activities_photo_lifecycle after insert or update of photo_path on public.activities
for each row execute function public.track_record_photo_lifecycle();
drop trigger if exists field_updates_photo_lifecycle on public.field_updates;
create trigger field_updates_photo_lifecycle after insert or update of photo_path on public.field_updates
for each row execute function public.track_record_photo_lifecycle();
drop trigger if exists tracked_work_photo_lifecycle on public.tracked_work;
create trigger tracked_work_photo_lifecycle after insert or update of extra on public.tracked_work
for each row execute function public.track_record_photo_lifecycle();
