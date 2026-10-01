<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sanctum: tokenable_id precisa aceitar UUIDs — os modelos AdminUser e
 * StudentUser usam chaves string (uuid), não bigint. A migration original
 * usava morphs(), que cria bigint, causando erro 22P02 no createToken.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('personal_access_tokens') || DB::connection()->getDriverName() === 'sqlite') {
            return;
        }

        // Índice composto criado pelo morphs() referencia a coluna antiga
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            try {
                $table->dropIndex(['tokenable_type', 'tokenable_id']);
            } catch (Throwable) {
                // índice pode não existir com esse nome em bases antigas
            }
        });

        DB::statement(
            'ALTER TABLE personal_access_tokens ALTER COLUMN tokenable_id TYPE varchar(36) USING tokenable_id::varchar'
        );

        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->index(['tokenable_type', 'tokenable_id']);
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('personal_access_tokens') || DB::connection()->getDriverName() === 'sqlite') {
            return;
        }

        Schema::table('personal_access_tokens', function (Blueprint $table) {
            try {
                $table->dropIndex(['tokenable_type', 'tokenable_id']);
            } catch (Throwable) {
            }
        });

        DB::statement('ALTER TABLE personal_access_tokens ALTER COLUMN tokenable_id TYPE bigint USING 0');

        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->index(['tokenable_type', 'tokenable_id']);
        });
    }
};
