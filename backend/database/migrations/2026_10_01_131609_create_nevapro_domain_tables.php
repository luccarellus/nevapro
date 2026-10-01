<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('slug', 120)->unique();
            $table->string('domain')->nullable();
            $table->string('plan', 50)->default('free');
            $table->boolean('active')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
        });

        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code', 50);
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->unique(['code', 'tenant_id']);
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
        });

        Schema::create('admin_users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->string('name')->nullable();
            $table->text('avatar_url')->nullable();
            $table->boolean('active')->default(true);
            $table->string('role', 50)->default('admin');
            $table->uuid('tenant_id')->nullable();
            $table->integer('answered_questions')->default(0);
            $table->integer('correct_answers')->default(0);
            $table->integer('xp')->default(0);
            $table->integer('level')->default(1);
            $table->integer('streak')->default(0);
            $table->integer('points')->default(0);
            $table->boolean('flash_quiz_completed')->default(false);
            $table->boolean('show_in_leaderboard')->default(true);
            $table->string('language_preference', 20)->default('ingles');
            $table->integer('token_version')->default(0);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->string('name')->nullable();
            $table->text('avatar_url')->nullable();
            $table->string('role', 50)->default('student');
            $table->uuid('tenant_id')->nullable();
            $table->string('city', 120)->nullable();
            $table->string('school')->nullable();
            $table->string('gremio')->nullable();
            $table->integer('answered_questions')->default(0);
            $table->integer('correct_answers')->default(0);
            $table->integer('xp')->default(0);
            $table->integer('level')->default(1);
            $table->integer('streak')->default(0);
            $table->integer('points')->default(0);
            $table->integer('rank')->default(0);
            $table->boolean('flash_quiz_completed')->default(false);
            $table->boolean('show_in_leaderboard')->default(true);
            $table->string('language_preference', 20)->default('ingles');
            $table->integer('tri_target_score')->default(750);
            $table->integer('token_version')->default(0);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('user_tenant_roles', function (Blueprint $table) {
            $table->uuid('user_id');
            $table->uuid('tenant_id');
            $table->uuid('role_id');
            $table->timestampTz('created_at')->useCurrent();
            $table->primary(['user_id', 'tenant_id', 'role_id']);
            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });

        Schema::create('login_attempts', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->integer('attempts')->default(0);
            $table->timestampTz('lock_until')->nullable();
            $table->timestampTz('updated_at')->useCurrent();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('token', 128)->unique();
            $table->timestampTz('expires_at');
            $table->timestampTz('created_at')->useCurrent();
            $table->index('user_id');
        });

        Schema::create('materials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->string('subject')->nullable();
            $table->string('foco')->nullable();
            $table->text('description')->nullable();
            $table->text('url');
            $table->string('type', 50)->default('pdf');
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('uploaded_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->index('tenant_id', 'idx_materials_tenant');
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('date', 50)->nullable();
            $table->string('time', 50)->nullable();
            $table->string('type', 50)->nullable();
            $table->string('category', 100)->nullable();
            $table->text('observation')->nullable();
            $table->integer('questions_count')->default(0);
            $table->integer('xp_reward')->default(0);
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->index('tenant_id', 'idx_events_tenant');
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('mural', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->text('content');
            $table->string('type', 50)->default('GERAL');
            $table->string('tag', 100)->nullable();
            $table->string('sender')->nullable();
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();
            $table->index('tenant_id', 'idx_mural_tenant');
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('questions', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('subject')->nullable();
            $table->text('text');
            $table->text('image_url')->nullable();
            $table->integer('correct_option_index')->nullable();
            $table->text('explanation')->nullable();
            $table->string('difficulty', 20)->default('médio');
            $table->integer('xp_reward')->default(10);
            $table->integer('year')->nullable();
            $table->integer('index')->nullable();
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index('tenant_id', 'idx_questions_tenant');
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('question_options', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('question_id', 64);
            $table->text('text');
            $table->text('image_url')->nullable();
            $table->string('letter', 2)->nullable();
            $table->boolean('is_correct')->default(false);
            $table->index('question_id', 'idx_qoptions_question');
            $table->foreign('question_id')->references('id')->on('questions')->cascadeOnDelete();
        });

        Schema::create('answers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('question_id', 64);
            $table->integer('selected_option_index');
            $table->boolean('is_correct');
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index('user_id', 'idx_answers_user');
            $table->index('question_id', 'idx_answers_q');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('question_id')->references('id')->on('questions')->cascadeOnDelete();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('xp_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->integer('amount')->default(0);
            $table->string('reason')->nullable();
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['user_id', 'created_at'], 'idx_xplogs_user');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->nullable();
            $table->string('title');
            $table->text('content')->nullable();
            $table->string('type', 50)->nullable();
            $table->boolean('is_read')->default(false);
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index('user_id', 'idx_notif_user');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('notification_reads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->uuid('notification_id');
            $table->timestampTz('read_at')->useCurrent();
            $table->unique(['user_id', 'notification_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('notification_id')->references('id')->on('notifications')->cascadeOnDelete();
        });

        Schema::create('user_study_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('title');
            $table->string('estimated_time', 50)->nullable();
            $table->string('target_tab', 50)->nullable();
            $table->boolean('done')->default(false);
            $table->date('task_date');
            $table->uuid('tenant_id')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['user_id', 'task_date'], 'idx_tasks_user_date');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });

        Schema::create('user_tri_scores', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->uuid('tenant_id')->nullable();
            $table->decimal('estimated_score', 10, 2);
            $table->decimal('math_score', 10, 2)->nullable();
            $table->decimal('nature_score', 10, 2)->nullable();
            $table->decimal('humanities_score', 10, 2)->nullable();
            $table->decimal('languages_score', 10, 2)->nullable();
            $table->timestampTz('calculated_at')->useCurrent();
            $table->index(['user_id', 'calculated_at'], 'idx_tri_user');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('tenant_id')->references('id')->on('tenants');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_tri_scores');
        Schema::dropIfExists('user_study_tasks');
        Schema::dropIfExists('notification_reads');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('xp_logs');
        Schema::dropIfExists('answers');
        Schema::dropIfExists('question_options');
        Schema::dropIfExists('questions');
        Schema::dropIfExists('mural');
        Schema::dropIfExists('events');
        Schema::dropIfExists('materials');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('login_attempts');
        Schema::dropIfExists('user_tenant_roles');
        Schema::dropIfExists('users');
        Schema::dropIfExists('admin_users');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('tenants');
    }
};
