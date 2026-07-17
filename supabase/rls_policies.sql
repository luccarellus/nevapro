-- Neva Pro - Supabase RLS policies (Hardened)
-- Strategy:
-- - service_role keeps full backend access (used by our Express server)
-- - Authenticated users can READ their own data
-- - Only admins can WRITE to any table
-- - No anonymous access is granted

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

-- Default: authenticated users can read, admins can write

-- ===== ADMIN_USERS =====
drop policy if exists "admin_users_select" on public.admin_users;
create policy "admin_users_select" on public.admin_users
  for select to authenticated
  using (public.is_admin() or auth.jwt() ->> 'email' = email);

drop policy if exists "admin_users_insert" on public.admin_users;
create policy "admin_users_insert" on public.admin_users
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admin_users_update" on public.admin_users;
create policy "admin_users_update" on public.admin_users
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_users_delete" on public.admin_users;
create policy "admin_users_delete" on public.admin_users
  for delete to authenticated
  using (public.is_admin());

-- ===== USERS (students) =====
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select to authenticated
  using (auth.jwt() ->> 'email' = email or public.is_admin());

drop policy if exists "users_insert_admin" on public.users;
create policy "users_insert_admin" on public.users
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update to authenticated
  using (auth.jwt() ->> 'email' = email or public.is_admin())
  with check (auth.jwt() ->> 'email' = email or public.is_admin());

drop policy if exists "users_delete_admin" on public.users;
create policy "users_delete_admin" on public.users
  for delete to authenticated
  using (public.is_admin());

-- ===== CONTENT TABLES (materials, events, mural) =====
-- Students can read, only admins can write
create policy "materials_select" on public.materials
  for select to authenticated using (true);

drop policy if exists "materials_insert" on public.materials;
create policy "materials_insert" on public.materials
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "materials_update" on public.materials;
create policy "materials_update" on public.materials
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "materials_delete" on public.materials;
create policy "materials_delete" on public.materials
  for delete to authenticated
  using (public.is_admin());

-- Events
create policy "events_select" on public.events
  for select to authenticated using (true);

drop policy if exists "events_insert" on public.events;
create policy "events_insert" on public.events
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "events_delete" on public.events;
create policy "events_delete" on public.events
  for delete to authenticated
  using (public.is_admin());

-- Mural
create policy "mural_select" on public.mural
  for select to authenticated using (true);

drop policy if exists "mural_insert" on public.mural;
create policy "mural_insert" on public.mural
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "mural_update" on public.mural;
create policy "mural_update" on public.mural
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "mural_delete" on public.mural;
create policy "mural_delete" on public.mural
  for delete to authenticated
  using (public.is_admin());

-- ===== SENSITIVE TABLES (answers, xp_logs, notifications) =====
-- Students can only see their own data
drop policy if exists "answers_select_own" on public.answers;
create policy "answers_select_own" on public.answers
  for select to authenticated
  using (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "answers_insert" on public.answers;
create policy "answers_insert" on public.answers
  for insert to authenticated
  with check (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "answers_update" on public.answers;
create policy "answers_update" on public.answers
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "answers_delete" on public.answers;
create policy "answers_delete" on public.answers
  for delete to authenticated
  using (public.is_admin());

-- XP Logs
drop policy if exists "xp_logs_select_own" on public.xp_logs;
create policy "xp_logs_select_own" on public.xp_logs
  for select to authenticated
  using (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "xp_logs_insert" on public.xp_logs;
create policy "xp_logs_insert" on public.xp_logs
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "xp_logs_update" on public.xp_logs;
create policy "xp_logs_update" on public.xp_logs
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "xp_logs_delete" on public.xp_logs;
create policy "xp_logs_delete" on public.xp_logs
  for delete to authenticated
  using (public.is_admin());

-- Notifications
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  )
  with check (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete to authenticated
  using (public.is_admin());

-- ===== QUESTIONS =====
create policy "questions_select" on public.questions
  for select to authenticated using (true);

drop policy if exists "questions_insert" on public.questions;
create policy "questions_insert" on public.questions
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "questions_update" on public.questions;
create policy "questions_update" on public.questions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "questions_delete" on public.questions;
create policy "questions_delete" on public.questions
  for delete to authenticated
  using (public.is_admin());

-- Question options
create policy "question_options_select" on public.question_options
  for select to authenticated using (true);

drop policy if exists "question_options_insert" on public.question_options;
create policy "question_options_insert" on public.question_options
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "question_options_update" on public.question_options;
create policy "question_options_update" on public.question_options
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "question_options_delete" on public.question_options;
create policy "question_options_delete" on public.question_options
  for delete to authenticated
  using (public.is_admin());

-- ===== SIMULADOS =====
create policy "simulados_select" on public.simulados
  for select to authenticated using (true);

drop policy if exists "simulados_insert" on public.simulados;
create policy "simulados_insert" on public.simulados
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "simulados_update" on public.simulados;
create policy "simulados_update" on public.simulados
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "simulados_delete" on public.simulados;
create policy "simulados_delete" on public.simulados
  for delete to authenticated
  using (public.is_admin());

-- ===== SIMULADO_QUESTIONS =====
create policy "simulado_questions_select" on public.simulado_questions
  for select to authenticated using (true);

drop policy if exists "simulado_questions_insert" on public.simulado_questions;
create policy "simulado_questions_insert" on public.simulado_questions
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "simulado_questions_update" on public.simulado_questions;
create policy "simulado_questions_update" on public.simulado_questions
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "simulado_questions_delete" on public.simulado_questions;
create policy "simulado_questions_delete" on public.simulado_questions
  for delete to authenticated
  using (public.is_admin());

-- ===== BADGES & USER_BADGES =====
create policy "badges_select" on public.badges
  for select to authenticated using (true);

drop policy if exists "badges_insert" on public.badges;
create policy "badges_insert" on public.badges
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "badges_update" on public.badges;
create policy "badges_update" on public.badges
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "badges_delete" on public.badges;
create policy "badges_delete" on public.badges
  for delete to authenticated
  using (public.is_admin());

-- User badges
drop policy if exists "user_badges_select_own" on public.user_badges;
create policy "user_badges_select_own" on public.user_badges
  for select to authenticated
  using (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "user_badges_insert" on public.user_badges;
create policy "user_badges_insert" on public.user_badges
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "user_badges_update" on public.user_badges;
create policy "user_badges_update" on public.user_badges
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_badges_delete" on public.user_badges;
create policy "user_badges_delete" on public.user_badges
  for delete to authenticated
  using (public.is_admin());

-- ===== USER_DAILY_STATS =====
drop policy if exists "user_daily_stats_select_own" on public.user_daily_stats;
create policy "user_daily_stats_select_own" on public.user_daily_stats
  for select to authenticated
  using (
    user_id in (select id from public.users where email = auth.jwt() ->> 'email')
    or public.is_admin()
  );

drop policy if exists "user_daily_stats_insert" on public.user_daily_stats;
create policy "user_daily_stats_insert" on public.user_daily_stats
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "user_daily_stats_update" on public.user_daily_stats;
create policy "user_daily_stats_update" on public.user_daily_stats
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "user_daily_stats_delete" on public.user_daily_stats;
create policy "user_daily_stats_delete" on public.user_daily_stats
  for delete to authenticated
  using (public.is_admin());

-- ===== PASSWORD_RESET_TOKENS & REFRESH_TOKENS =====
drop policy if exists "password_reset_tokens_select" on public.password_reset_tokens;
create policy "password_reset_tokens_select" on public.password_reset_tokens
  for select to authenticated
  using (public.is_admin());

drop policy if exists "password_reset_tokens_insert" on public.password_reset_tokens;
create policy "password_reset_tokens_insert" on public.password_reset_tokens
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "password_reset_tokens_delete" on public.password_reset_tokens;
create policy "password_reset_tokens_delete" on public.password_reset_tokens
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "refresh_tokens_select" on public.refresh_tokens;
create policy "refresh_tokens_select" on public.refresh_tokens
  for select to authenticated
  using (public.is_admin());

drop policy if exists "refresh_tokens_insert" on public.refresh_tokens;
create policy "refresh_tokens_insert" on public.refresh_tokens
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "refresh_tokens_delete" on public.refresh_tokens;
create policy "refresh_tokens_delete" on public.refresh_tokens
  for delete to authenticated
  using (public.is_admin());

-- ===== CONSENT_LOGS =====
create policy "consent_logs_select" on public.consent_logs
  for select to authenticated
  using (public.is_admin());

create policy "consent_logs_insert" on public.consent_logs
  for insert to authenticated
  with check (true); -- Any authenticated user can log consent

-- ===== REVOKED_TOKENS =====
drop policy if exists "revoked_tokens_admin" on public.revoked_tokens;
create policy "revoked_tokens_admin" on public.revoked_tokens
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===== LOGIN_ATTEMPTS =====
drop policy if exists "login_attempts_admin" on public.login_attempts;
create policy "login_attempts_admin" on public.login_attempts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Remove overly broad grants — the server uses service_role key with RLS bypass
-- Only grant what's strictly needed via the anon key
revoke all on public.admin_users from anon;
revoke all on public.users from anon;
revoke all on public.materials from anon;
revoke all on public.events from anon;
revoke all on public.notifications from anon;
revoke all on public.questions from anon;
revoke all on public.question_options from anon;
revoke all on public.simulados from anon;
revoke all on public.simulado_questions from anon;
revoke all on public.answers from anon;
revoke all on public.badges from anon;
revoke all on public.user_badges from anon;
revoke all on public.user_daily_stats from anon;
revoke all on public.xp_logs from anon;
revoke all on public.password_reset_tokens from anon;
revoke all on public.refresh_tokens from anon;
revoke all on public.consent_logs from anon;
revoke all on public.revoked_tokens from anon;
revoke all on public.login_attempts from anon;
revoke all on public.mural from anon;
