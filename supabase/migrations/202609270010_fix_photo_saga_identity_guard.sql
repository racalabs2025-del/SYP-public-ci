-- Forward fix: the canonical Firebase JWT guard is is_syp_firebase_identity().
create or replace function public.stage_record_photo_upload(p_path text)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.is_syp_firebase_identity() or not public.role_capability('write_records') then
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
