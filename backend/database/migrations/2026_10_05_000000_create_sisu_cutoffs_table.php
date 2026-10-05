<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Notas de corte oficiais do SISU, ingeridos por edição
     * (scripts/ingestSisuCutoffs.ts).
     *
     * Em bancos já inicializados pela stack Express legada a tabela
     * public.sisu_cutoffs já existe (criada pela ingestão Express,
     * fora do migrator do Laravel). Nesses casos apenas registramos
     * a migration, sem recriar — por isso o guard Schema::hasTable().
     */
    public function up(): void
    {
        if (Schema::hasTable('sisu_cutoffs')) {
            return;
        }

        Schema::create('sisu_cutoffs', function (Blueprint $table): void {
            // Sem surrogate PK: a ingestão Express não escreve "id" e
            // a API Laravel só lê — a chave natural é a unique abaixo.
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
            // Escritos apenas pela ingestão Express (ingestSisuCutoffs.ts)
            $table->string('source')->nullable();
            $table->timestampTz('ingested_at')->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->useCurrent();

            // Upsert da ingestão: ON CONFLICT (year, edition, university,
            // course, shift, modality) — sem esta constraint o INSERT do
            // Express falha com "no unique or exclusion constraint matching".
            $table->unique(
                ['year', 'edition', 'university', 'course', 'shift', 'modality'],
                'sisu_cutoffs_unique'
            );

            $table->index(['modality', 'year', 'edition']);
            $table->index(['year', 'edition']);
            // Índice funcional: precisa de rawIndex com nome explícito —
            // $table->index(DB::raw(...)) gera o índice "lower(course)"
            // (identificador citado) e o Postgres rejeita com 42703.
            $table->rawIndex('lower(course)', 'sisu_cutoffs_lower_course_index');
            $table->rawIndex('lower(university)', 'sisu_cutoffs_lower_university_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sisu_cutoffs');
    }
};
