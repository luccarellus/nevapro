alter table public.admin_users
add column if not exists auth_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_key'
  ) then
    alter table public.admin_users
      add constraint admin_users_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_fkey'
  ) then
    alter table public.admin_users
      add constraint admin_users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_admin_users_auth_user_id on public.admin_users(auth_user_id);
