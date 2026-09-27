-- Match database permissions to the product role matrix:
-- Admin and Data Entry maintain operational master data; Managers may still
-- manage tracked work and plans through their dedicated policies.
create or replace function public.can_write_records() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role() in ('admin','data_entry'),false)
$$;

grant execute on function public.can_write_records() to anon,authenticated;
