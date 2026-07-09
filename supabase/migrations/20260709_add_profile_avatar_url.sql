alter table public.users
  add column if not exists avatar_url text;

alter table public.admin_users
  add column if not exists avatar_url text;
