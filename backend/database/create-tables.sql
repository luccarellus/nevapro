-- =============================================================================
-- Neva Pro — Criação completa das tabelas (PostgreSQL)
--
-- Fonte de verdade: backend/database/migrations/ (8 migrations, estado final
-- já com os ALTERs de tokenable_id -> varchar(36) e idx_users_tenant).
-- Equivalente a `php artisan migrate:fresh`, incluindo o seed do DatabaseSeeder
-- (tenant plataforma + 4 roles) exigido pelo /api/auth/register.
--
-- Uso:
--   psql "$DATABASE_URL" -f backend/database/create-tables.sql
--
-- ATENÇÃO: apaga e recria TODAS as tabelas deste script (DROP ... CASCADE).
-- Em banco com dados, faça backup antes. Alternativa nativa do Laravel:
--   php artisan migrate:fresh --force --seed
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Framework (Laravel) — sessions, cache, jobs
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS sessions CASCADE;
CREATE TABLE sessions (
    id            varchar NOT NULL PRIMARY KEY,
    user_id       uuid,
    ip_address    varchar(45),
    user_agent    text,
    payload       text NOT NULL,
    last_activity integer NOT NULL
);
CREATE INDEX sessions_user_id_index ON sessions (user_id);
CREATE INDEX sessions_last_activity_index ON sessions (last_activity);

DROP TABLE IF EXISTS cache CASCADE;
CREATE TABLE cache (
    key        varchar NOT NULL PRIMARY KEY,
    value      text NOT NULL,
    expiration bigint NOT NULL
);
CREATE INDEX cache_expiration_index ON cache (expiration);

DROP TABLE IF EXISTS cache_locks CASCADE;
CREATE TABLE cache_locks (
    key        varchar NOT NULL PRIMARY KEY,
    owner      varchar NOT NULL,
    expiration bigint NOT NULL
);
CREATE INDEX cache_locks_expiration_index ON cache_locks (expiration);

DROP TABLE IF EXISTS jobs CASCADE;
CREATE TABLE jobs (
    id           bigserial PRIMARY KEY,
    queue        varchar NOT NULL,
    payload      text NOT NULL,
    attempts     smallint NOT NULL,
    reserved_at  integer,
    available_at integer NOT NULL,
    created_at   integer NOT NULL
);
CREATE INDEX jobs_queue_index ON jobs (queue);

DROP TABLE IF EXISTS job_batches CASCADE;
CREATE TABLE job_batches (
    id             varchar NOT NULL PRIMARY KEY,
    name           varchar NOT NULL,
    total_jobs     integer NOT NULL,
    pending_jobs   integer NOT NULL,
    failed_jobs    integer NOT NULL,
    failed_job_ids text NOT NULL,
    options        text,
    cancelled_at   integer,
    created_at     integer NOT NULL,
    finished_at    integer
);

DROP TABLE IF EXISTS failed_jobs CASCADE;
CREATE TABLE failed_jobs (
    id         bigserial PRIMARY KEY,
    uuid       varchar NOT NULL,
    connection varchar NOT NULL,
    queue      varchar NOT NULL,
    payload    text NOT NULL,
    exception  text NOT NULL,
    failed_at  timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX failed_jobs_uuid_unique ON failed_jobs (uuid);
CREATE INDEX failed_jobs_connection_queue_failed_at_index
    ON failed_jobs (connection, queue, failed_at);

-- -----------------------------------------------------------------------------
-- Sanctum — tokenable_id em varchar(36) (estado final da migration de ALTER)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS personal_access_tokens CASCADE;
CREATE TABLE personal_access_tokens (
    id             bigserial PRIMARY KEY,
    tokenable_type varchar NOT NULL,
    tokenable_id   varchar(36) NOT NULL,
    name           text NOT NULL,
    token          varchar(64) NOT NULL,
    abilities      text,
    last_used_at   timestamp(0),
    expires_at     timestamp(0),
    created_at     timestamp(0),
    updated_at     timestamp(0)
);
CREATE UNIQUE INDEX personal_access_tokens_token_unique ON personal_access_tokens (token);
CREATE INDEX personal_access_tokens_tokenable_type_tokenable_id_index
    ON personal_access_tokens (tokenable_type, tokenable_id);
CREATE INDEX personal_access_tokens_expires_at_index ON personal_access_tokens (expires_at);

-- -----------------------------------------------------------------------------
-- Domínio Neva Pro — tenants / roles / usuários / RBAC
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS user_tenant_roles CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS user_tri_scores CASCADE;
DROP TABLE IF EXISTS user_study_tasks CASCADE;
DROP TABLE IF EXISTS notification_reads CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS xp_logs CASCADE;
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS question_options CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS mural CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS materials CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

CREATE TABLE tenants (
    id         uuid NOT NULL PRIMARY KEY,
    name       varchar NOT NULL,
    slug       varchar(120) NOT NULL,
    domain     varchar,
    plan       varchar(50) NOT NULL DEFAULT 'free',
    active     boolean NOT NULL DEFAULT true,
    created_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX tenants_slug_unique ON tenants (slug);

CREATE TABLE roles (
    id          uuid NOT NULL PRIMARY KEY,
    code        varchar(50) NOT NULL,
    name        varchar(100) NOT NULL,
    description text,
    tenant_id   uuid,
    created_at  timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roles_code_tenant_id_unique UNIQUE (code, tenant_id),
    CONSTRAINT roles_tenant_id_foreign FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE CASCADE
);

CREATE TABLE admin_users (
    id                    uuid NOT NULL PRIMARY KEY,
    email                 varchar NOT NULL,
    password_hash         varchar NOT NULL,
    name                  varchar,
    avatar_url            text,
    active                boolean NOT NULL DEFAULT true,
    role                  varchar(50) NOT NULL DEFAULT 'admin',
    tenant_id             uuid,
    answered_questions    integer NOT NULL DEFAULT 0,
    correct_answers       integer NOT NULL DEFAULT 0,
    xp                    integer NOT NULL DEFAULT 0,
    level                 integer NOT NULL DEFAULT 1,
    streak                integer NOT NULL DEFAULT 0,
    points                integer NOT NULL DEFAULT 0,
    flash_quiz_completed  boolean NOT NULL DEFAULT false,
    show_in_leaderboard   boolean NOT NULL DEFAULT true,
    language_preference   varchar(20) NOT NULL DEFAULT 'ingles',
    token_version         integer NOT NULL DEFAULT 0,
    created_at            timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX admin_users_email_unique ON admin_users (email);
CREATE INDEX admin_users_tenant_id_index ON admin_users (tenant_id);
ALTER TABLE admin_users
    ADD CONSTRAINT admin_users_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE users (
    id                    uuid NOT NULL PRIMARY KEY,
    email                 varchar NOT NULL,
    password_hash         varchar NOT NULL,
    name                  varchar,
    avatar_url            text,
    role                  varchar(50) NOT NULL DEFAULT 'student',
    tenant_id             uuid,
    city                  varchar(120),
    school                varchar,
    gremio                varchar,
    answered_questions    integer NOT NULL DEFAULT 0,
    correct_answers       integer NOT NULL DEFAULT 0,
    xp                    integer NOT NULL DEFAULT 0,
    level                 integer NOT NULL DEFAULT 1,
    streak                integer NOT NULL DEFAULT 0,
    points                integer NOT NULL DEFAULT 0,
    rank                  integer NOT NULL DEFAULT 0,
    flash_quiz_completed  boolean NOT NULL DEFAULT false,
    show_in_leaderboard   boolean NOT NULL DEFAULT true,
    language_preference   varchar(20) NOT NULL DEFAULT 'ingles',
    tri_target_score      integer NOT NULL DEFAULT 750,
    token_version         integer NOT NULL DEFAULT 0,
    created_at            timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX users_email_unique ON users (email);
CREATE INDEX idx_users_tenant ON users (tenant_id);
ALTER TABLE users
    ADD CONSTRAINT users_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE user_tenant_roles (
    user_id    uuid NOT NULL,
    tenant_id  uuid NOT NULL,
    role_id    uuid NOT NULL,
    created_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tenant_id, role_id),
    CONSTRAINT user_tenant_roles_tenant_id_foreign FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT user_tenant_roles_role_id_foreign FOREIGN KEY (role_id)
        REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE login_attempts (
    email       varchar NOT NULL PRIMARY KEY,
    attempts    integer NOT NULL DEFAULT 0,
    lock_until  timestamp(0) with time zone,
    updated_at  timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_tokens (
    id         uuid NOT NULL PRIMARY KEY,
    user_id    uuid NOT NULL,
    token      varchar(128) NOT NULL,
    expires_at timestamp(0) with time zone NOT NULL,
    created_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX password_reset_tokens_token_unique ON password_reset_tokens (token);
CREATE INDEX password_reset_tokens_user_id_index ON password_reset_tokens (user_id);

-- -----------------------------------------------------------------------------
-- Conteúdo — materiais, eventos, mural, questões, respostas
-- -----------------------------------------------------------------------------

CREATE TABLE materials (
    id           uuid NOT NULL PRIMARY KEY,
    title        varchar NOT NULL,
    subject      varchar,
    foco         varchar,
    description  text,
    url          text NOT NULL,
    type         varchar(50) NOT NULL DEFAULT 'pdf',
    tenant_id    uuid,
    uploaded_at  timestamp(0) with time zone,
    created_at   timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_materials_tenant ON materials (tenant_id);
ALTER TABLE materials
    ADD CONSTRAINT materials_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE events (
    id              uuid NOT NULL PRIMARY KEY,
    title           varchar NOT NULL,
    description     text,
    date            varchar(50),
    time            varchar(50),
    type            varchar(50),
    category        varchar(100),
    observation     text,
    questions_count integer NOT NULL DEFAULT 0,
    xp_reward       integer NOT NULL DEFAULT 0,
    tenant_id       uuid,
    created_at      timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_tenant ON events (tenant_id);
ALTER TABLE events
    ADD CONSTRAINT events_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE mural (
    id         uuid NOT NULL PRIMARY KEY,
    title      varchar NOT NULL,
    content    text NOT NULL,
    type       varchar(50) NOT NULL DEFAULT 'GERAL',
    tag        varchar(100),
    sender     varchar,
    tenant_id  uuid,
    created_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mural_tenant ON mural (tenant_id);
ALTER TABLE mural
    ADD CONSTRAINT mural_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE questions (
    id                    varchar(64) NOT NULL PRIMARY KEY,
    subject               varchar,
    text                  text NOT NULL,
    image_url             text,
    correct_option_index  integer,
    explanation           text,
    difficulty            varchar(20) NOT NULL DEFAULT 'médio',
    xp_reward             integer NOT NULL DEFAULT 10,
    year                  integer,
    "index"               integer,
    tenant_id             uuid,
    created_at            timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_questions_tenant ON questions (tenant_id);
ALTER TABLE questions
    ADD CONSTRAINT questions_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE question_options (
    id          uuid NOT NULL PRIMARY KEY,
    question_id varchar(64) NOT NULL,
    text        text NOT NULL,
    image_url   text,
    letter      varchar(2),
    is_correct  boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_qoptions_question ON question_options (question_id);
ALTER TABLE question_options
    ADD CONSTRAINT question_options_question_id_foreign
    FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE;

CREATE TABLE answers (
    id                    uuid NOT NULL PRIMARY KEY,
    user_id               uuid NOT NULL,
    question_id           varchar(64) NOT NULL,
    selected_option_index integer NOT NULL,
    is_correct            boolean NOT NULL,
    tenant_id             uuid,
    created_at            timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_answers_user ON answers (user_id);
CREATE INDEX idx_answers_q ON answers (question_id);
ALTER TABLE answers
    ADD CONSTRAINT answers_user_id_foreign FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE answers
    ADD CONSTRAINT answers_question_id_foreign FOREIGN KEY (question_id)
        REFERENCES questions (id) ON DELETE CASCADE;
ALTER TABLE answers
    ADD CONSTRAINT answers_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE xp_logs (
    id         uuid NOT NULL PRIMARY KEY,
    user_id    uuid NOT NULL,
    amount     integer NOT NULL DEFAULT 0,
    reason     varchar,
    tenant_id  uuid,
    created_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_xplogs_user ON xp_logs (user_id, created_at);
ALTER TABLE xp_logs
    ADD CONSTRAINT xp_logs_user_id_foreign FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE xp_logs
    ADD CONSTRAINT xp_logs_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

-- -----------------------------------------------------------------------------
-- Notificações e plano de estudos
-- -----------------------------------------------------------------------------

CREATE TABLE notifications (
    id         uuid NOT NULL PRIMARY KEY,
    user_id    uuid,
    title      varchar NOT NULL,
    content    text,
    type       varchar(50),
    is_read    boolean NOT NULL DEFAULT false,
    tenant_id  uuid,
    created_at timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notif_user ON notifications (user_id);
ALTER TABLE notifications
    ADD CONSTRAINT notifications_user_id_foreign FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE notifications
    ADD CONSTRAINT notifications_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE notification_reads (
    id              uuid NOT NULL PRIMARY KEY,
    user_id         uuid NOT NULL,
    notification_id uuid NOT NULL,
    read_at         timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_reads_user_id_notification_id_unique UNIQUE (user_id, notification_id),
    CONSTRAINT notification_reads_user_id_foreign FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT notification_reads_notification_id_foreign FOREIGN KEY (notification_id)
        REFERENCES notifications (id) ON DELETE CASCADE
);

CREATE TABLE user_study_tasks (
    id              uuid NOT NULL PRIMARY KEY,
    user_id         uuid NOT NULL,
    title           varchar NOT NULL,
    estimated_time  varchar(50),
    target_tab      varchar(50),
    done            boolean NOT NULL DEFAULT false,
    task_date       date NOT NULL,
    tenant_id       uuid,
    created_at      timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tasks_user_date ON user_study_tasks (user_id, task_date);
ALTER TABLE user_study_tasks
    ADD CONSTRAINT user_study_tasks_user_id_foreign FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE user_study_tasks
    ADD CONSTRAINT user_study_tasks_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

CREATE TABLE user_tri_scores (
    id                 uuid NOT NULL PRIMARY KEY,
    user_id            uuid NOT NULL,
    tenant_id          uuid,
    estimated_score    numeric(10,2) NOT NULL,
    math_score         numeric(10,2),
    nature_score       numeric(10,2),
    humanities_score   numeric(10,2),
    languages_score    numeric(10,2),
    calculated_at      timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_tri_user ON user_tri_scores (user_id, calculated_at);
ALTER TABLE user_tri_scores
    ADD CONSTRAINT user_tri_scores_user_id_foreign FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE user_tri_scores
    ADD CONSTRAINT user_tri_scores_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants (id);

-- -----------------------------------------------------------------------------
-- SISU — notas de corte (sem PK surrogate; chave natural na unique)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS sisu_cutoffs CASCADE;
CREATE TABLE sisu_cutoffs (
    course              varchar NOT NULL,
    campus              varchar NOT NULL,
    university          varchar NOT NULL,
    uf                  char(2) NOT NULL,
    degree              varchar NOT NULL,
    shift               varchar NOT NULL,
    modality            varchar NOT NULL,
    modality_category   varchar NOT NULL,
    cutoff_score        numeric(8,2) NOT NULL,
    seats               integer NOT NULL,
    year                integer NOT NULL,
    edition             varchar NOT NULL,
    source              varchar,
    ingested_at         timestamp(0) with time zone,
    created_at          timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          timestamp(0) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX sisu_cutoffs_unique
    ON sisu_cutoffs (year, edition, university, course, shift, modality);
CREATE INDEX sisu_cutoffs_modality_year_edition_index ON sisu_cutoffs (modality, year, edition);
CREATE INDEX sisu_cutoffs_year_edition_index ON sisu_cutoffs (year, edition);
CREATE INDEX sisu_cutoffs_lower_course_index ON sisu_cutoffs (lower(course));
CREATE INDEX sisu_cutoffs_lower_university_index ON sisu_cutoffs (lower(university));

-- -----------------------------------------------------------------------------
-- Seed mínimo (equivalente ao DatabaseSeeder) — exigido pelo /api/auth/register:
-- register grava users.tenant_id = PLATFORM_ID e vincula o papel 'student'
-- consultando roles WHERE code = 'student' AND tenant_id IS NULL.
-- Idempotente: guards com WHERE NOT EXISTS.
-- -----------------------------------------------------------------------------

INSERT INTO tenants (id, name, slug, plan, active, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000001', 'NevaPro', 'nevapro', 'platform', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'nevapro');

INSERT INTO roles (id, code, name, description, tenant_id, created_at)
SELECT gen_random_uuid(), 'super_admin', 'Super Admin', 'Controle total da plataforma (todos os tenants)', NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'super_admin' AND tenant_id IS NULL);

INSERT INTO roles (id, code, name, description, tenant_id, created_at)
SELECT gen_random_uuid(), 'tenant_admin', 'Admin do Tenant', 'Administração de um tenant específico', NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'tenant_admin' AND tenant_id IS NULL);

INSERT INTO roles (id, code, name, description, tenant_id, created_at)
SELECT gen_random_uuid(), 'teacher', 'Professor', 'Gestão de conteúdo pedagógico', NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'teacher' AND tenant_id IS NULL);

INSERT INTO roles (id, code, name, description, tenant_id, created_at)
SELECT gen_random_uuid(), 'student', 'Aluno', 'Estudante da plataforma', NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'student' AND tenant_id IS NULL);

COMMIT;
