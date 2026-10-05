<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Notas de corte oficiais do SISU, ingeridos por edição
     * (scripts/ingestSisuCutoffs.ts). Mesmo schema da API Express.
     */
    public function up(): void
    {
        Schema::create('sisu_cutoffs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('course');
            $table->string('campus');
            $table->string('university');
            $table->char('uf', 2);
            $table->string('degree');
            $table->string('shift');
            $table->string('modality');
            $table->string('modality_category');
            $table->decimal('cutoff_score', 8, 2);
            $table->unsignedInteger('seats');
            $table->unsignedInteger('year');
            $table->string('edition');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            $table->index(['modality', 'year', 'edition']);
            $table->index(['year', 'edition']);
            $table->index(DB::raw('lower(course)'));
            $table->index(DB::raw('lower(university)'));
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sisu_cutoffs');
    }
};
