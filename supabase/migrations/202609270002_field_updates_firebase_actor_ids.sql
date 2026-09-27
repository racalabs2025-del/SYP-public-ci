-- Firebase remains the SYP identity provider. Field update audit columns must
-- use the same text UID contract as the other product tables, not auth.users UUIDs.
do $migration$
declare
  fk record;
begin
  for fk in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.field_updates'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and exists (
        select 1
        from unnest(c.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = key.attnum
        where a.attname in ('updated_by', 'archived_by')
      )
  loop
    execute format('alter table public.field_updates drop constraint %I', fk.conname);
  end loop;
end
$migration$;

alter table public.field_updates
  alter column updated_by type text using updated_by::text,
  alter column archived_by type text using archived_by::text;
