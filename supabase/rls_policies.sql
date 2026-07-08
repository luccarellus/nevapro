-- Neva Pro - Supabase RLS baseline
-- Strategy:
-- - service_role keeps full backend access
-- - authenticated admins can access tables directly when needed
-- - no anonymous access is granted here

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false)
    or exists (
      select 1
      from public.admin_users au
      where au.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Enable RLS on all exposed tables
alter table public.admin_users enable row level security;
alter table public.users enable row level security;
alter table public.materials enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.simulados enable row level security;
alter table public.simulado_questions enable row level security;
alter table public.answers enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_daily_stats enable row level security;
alter table public.xp_logs enable row level security;
alter table public.password_reset_tokens enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.consent_logs enable row level security;
alter table public.revoked_tokens enable row level security;
alter table public.login_attempts enable row level security;
alter table public.mural enable row level security;

-- Optional grants for authenticated users.
-- These only matter when you access Supabase directly with the anon/authenticated keys.
grant select, insert, update, delete on public.admin_users to authenticated;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.materials to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.question_options to authenticated;
grant select, insert, update, delete on public.simulados to authenticated;
grant select, insert, update, delete on public.simulado_questions to authenticated;
grant select, insert, update, delete on public.answers to authenticated;
grant select, insert, update, delete on public.badges to authenticated;
grant select, insert, update, delete on public.user_badges to authenticated;
grant select, insert, update, delete on public.user_daily_stats to authenticated;
grant select, insert, update, delete on public.xp_logs to authenticated;
grant select, insert, update, delete on public.password_reset_tokens to authenticated;
grant select, insert, update, delete on public.refresh_tokens to authenticated;
grant select, insert, update, delete on public.consent_logs to authenticated;
grant select, insert, update, delete on public.revoked_tokens to authenticated;
grant select, insert, update, delete on public.login_attempts to authenticated;
grant select, insert, update, delete on public.mural to authenticated;

-- Admin users
drop policy if exists "admins can read admin users" on public.admin_users;
create policy "admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert admin users" on public.admin_users;
create policy "admins can insert admin users"
on public.admin_users
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update admin users" on public.admin_users;
create policy "admins can update admin users"
on public.admin_users
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete admin users" on public.admin_users;
create policy "admins can delete admin users"
on public.admin_users
for delete
to authenticated
using (public.is_admin());

-- Student profiles
drop policy if exists "admins can read users" on public.users;
create policy "admins can read users"
on public.users
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins can insert users" on public.users;
create policy "admins can insert users"
on public.users
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update users" on public.users;
create policy "admins can update users"
on public.users
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete users" on public.users;
create policy "admins can delete users"
on public.users
for delete
to authenticated
using (public.is_admin());

-- Read-only content tables managed by backend/admins
drop policy if exists "admins can manage materials" on public.materials;
create policy "admins can manage materials"
on public.materials
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage events" on public.events;
create policy "admins can manage events"
on public.events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage mural" on public.mural;
create policy "admins can manage mural"
on public.mural
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage notifications" on public.notifications;
create policy "admins can manage notifications"
on public.notifications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage questions" on public.questions;
create policy "admins can manage questions"
on public.questions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage question options" on public.question_options;
create policy "admins can manage question options"
on public.question_options
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage simulados" on public.simulados;
create policy "admins can manage simulados"
on public.simulados
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage simulado questions" on public.simulado_questions;
create policy "admins can manage simulado questions"
on public.simulado_questions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage answers" on public.answers;
create policy "admins can manage answers"
on public.answers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage badges" on public.badges;
create policy "admins can manage badges"
on public.badges
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage user badges" on public.user_badges;
create policy "admins can manage user badges"
on public.user_badges
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage daily stats" on public.user_daily_stats;
create policy "admins can manage daily stats"
on public.user_daily_stats
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage xp logs" on public.xp_logs;
create policy "admins can manage xp logs"
on public.xp_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage password reset tokens" on public.password_reset_tokens;
create policy "admins can manage password reset tokens"
on public.password_reset_tokens
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage refresh tokens" on public.refresh_tokens;
create policy "admins can manage refresh tokens"
on public.refresh_tokens
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage consent logs" on public.consent_logs;
create policy "admins can manage consent logs"
on public.consent_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage revoked tokens" on public.revoked_tokens;
create policy "admins can manage revoked tokens"
on public.revoked_tokens
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can manage login attempts" on public.login_attempts;
create policy "admins can manage login attempts"
on public.login_attempts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
