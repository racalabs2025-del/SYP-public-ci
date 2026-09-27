-- Keep activity confirmation consistent with the data-entry contract.
-- NOT VALID avoids blocking deployment on any older rows; PostgreSQL enforces
-- the check for new or updated rows immediately.
alter table public.activities
  add constraint activities_confirmed_by_nonempty
  check (length(btrim(confirmed_by)) > 0) not valid;
