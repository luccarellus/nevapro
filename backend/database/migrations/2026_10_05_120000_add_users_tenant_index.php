<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasIndex('users', 'idx_users_tenant')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->index('tenant_id', 'idx_users_tenant');
        });
    }

    public function down(): void
    {
        if (! Schema::hasIndex('users', 'idx_users_tenant')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('idx_users_tenant');
        });
    }
};
