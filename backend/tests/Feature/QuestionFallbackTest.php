<?php

namespace Tests\Feature;

use App\Models\StudentUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Quando a API externa (api.enem.dev / api.enemhub.com.br) está fora do ar,
 * os endpoints de questões devem servir as questões já persistidas no banco
 * no formato do provider, em vez de devolver 502.
 */
class QuestionFallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_enem_endpoint_serves_persisted_questions_when_provider_is_down(): void
    {
        $this->seed();
        [, $token] = $this->createStudent();
        $this->insertEnemQuestion('2024-0-matematica', 0);

        Http::fake([
            'api.enem.dev/*' => fn () => throw new ConnectionException('api.enem.dev indisponível'),
        ]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/questoes?year=2024&limit=50&offset=0')
            ->assertOk()
            ->assertJsonPath('source', 'database')
            ->assertJsonPath('questions.0.index', 0)
            ->assertJsonPath('questions.0.discipline', 'Matemática')
            ->assertJsonCount(2, 'questions.0.alternatives')
            ->assertJsonPath('questions.0.alternatives.0.letter', 'A')
            // O gabarito continua escondido no fallback.
            ->assertJsonMissingPath('questions.0.correctOptionIndex')
            ->assertJsonMissingPath('questions.0.explanation')
            ->assertJsonMissingPath('questions.0.alternatives.0.isCorrect');
    }

    public function test_enem_endpoint_respects_offset_in_the_database_fallback(): void
    {
        $this->seed();
        [, $token] = $this->createStudent();
        $this->insertEnemQuestion('2024-0-matematica', 0);
        $this->insertEnemQuestion('2024-1-ciencias-da-natureza', 1);

        Http::fake([
            'api.enem.dev/*' => fn () => throw new ConnectionException('api.enem.dev indisponível'),
        ]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/questoes?year=2024&limit=50&offset=1')
            ->assertOk()
            ->assertJsonCount(1, 'questions')
            ->assertJsonPath('questions.0.index', 1);
    }

    public function test_enem_endpoint_still_returns_502_when_no_local_questions_exist(): void
    {
        $this->seed();
        [, $token] = $this->createStudent();

        Http::fake([
            'api.enem.dev/*' => fn () => throw new ConnectionException('api.enem.dev indisponível'),
        ]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/questoes?year=2009&limit=50&offset=0')
            ->assertStatus(502);
    }

    public function test_enemhub_endpoint_serves_persisted_questions_when_provider_is_down(): void
    {
        $this->seed();
        config(['services.enemhub.key' => 'enemhub-test-key']);
        [, $token] = $this->createStudent();
        $this->insertHubQuestion('ehub-2024-abcd1234');

        Http::fake([
            'api.enemhub.com.br/*' => fn () => throw new ConnectionException('EnemHub indisponível'),
        ]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/questoes/enemhub?year=2024&limit=50&page=1')
            ->assertOk()
            ->assertJsonPath('source', 'database')
            ->assertJsonPath('questions.0.id', 'ehub-2024-abcd1234')
            ->assertJsonPath('questions.0.externalId', 'abcd1234')
            ->assertJsonPath('questions.0.subject.name', 'Ciências da Natureza')
            ->assertJsonCount(2, 'questions.0.alternatives')
            ->assertJsonMissingPath('questions.0.alternatives.0.isCorrect');
    }

    /**
     * @return array{0: StudentUser, 1: string}
     */
    private function createStudent(): array
    {
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student-'.Str::uuid().'@example.test',
            'password_hash' => 'unused',
            'name' => 'Student',
            'role' => 'student',
            'tenant_id' => '00000000-0000-0000-0000-000000000001',
            'token_version' => 0,
        ]);
        $token = $user->createToken('auth:student:tv0', ['*'], now()->addDay())->plainTextToken;

        return [$user, $token];
    }

    /** Questão persistida a partir do provider ENEM (tenant_id nulo, com index). */
    private function insertEnemQuestion(string $id, int $index): void
    {
        DB::table('questions')->insert([
            'id' => $id,
            'subject' => 'Matemática',
            'text' => "Contexto da questão.\n\nIntrodução.",
            'image_url' => null,
            'correct_option_index' => 1,
            'explanation' => '',
            'difficulty' => 'médio',
            'xp_reward' => 15,
            'year' => 2024,
            'index' => $index,
            'tenant_id' => null,
            'created_at' => now(),
        ]);

        $this->insertOptions($id);
    }

    /** Questão persistida a partir do provider EnemHub (id prefixado com ehub-). */
    private function insertHubQuestion(string $id): void
    {
        DB::table('questions')->insert([
            'id' => $id,
            'subject' => 'Ciências da Natureza',
            'text' => 'Enunciado da questão EnemHub.',
            'image_url' => null,
            'correct_option_index' => 0,
            'explanation' => '',
            'difficulty' => 'médio',
            'xp_reward' => 15,
            'year' => 2024,
            'index' => null,
            'tenant_id' => null,
            'created_at' => now(),
        ]);

        $this->insertOptions($id);
    }

    private function insertOptions(string $questionId): void
    {
        foreach ([['A', 'Alternativa um', false], ['B', 'Alternativa dois', true]] as [$letter, $text, $correct]) {
            DB::table('question_options')->insert([
                'id' => (string) Str::uuid(),
                'question_id' => $questionId,
                'text' => $text,
                'image_url' => null,
                'letter' => $letter,
                'is_correct' => $correct,
            ]);
        }
    }
}
