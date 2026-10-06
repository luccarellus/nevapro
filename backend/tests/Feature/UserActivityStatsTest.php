<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\StudentUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class UserActivityStatsTest extends TestCase
{
    use RefreshDatabase;

    public function test_weekly_stats_isolate_the_authenticated_users_current_week(): void
    {
        $this->seed();

        $tenantId = '00000000-0000-0000-0000-000000000001';

        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'weekly-stats@example.test',
            'password_hash' => 'unused',
            'name' => 'Weekly Stats',
            'role' => 'student',
            'tenant_id' => $tenantId,
            'token_version' => 0,
        ]);

        $otherUser = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'weekly-stats-other@example.test',
            'password_hash' => 'unused',
            'name' => 'Other Stats',
            'role' => 'student',
            'tenant_id' => $tenantId,
            'token_version' => 0,
        ]);

        $token = $user->createToken('auth:student:tv0', ['*'], now()->addDay())->plainTextToken;

        $currentQuestion = $this->createQuestion('weekly-question', $tenantId);
        $previousWeekQuestion = $this->createQuestion('previous-week-question', $tenantId);
        $otherUserQuestion = $this->createQuestion('other-user-question', $tenantId);

        // Semana atual: duas tentativas na MESMA questão -> conta 1 questão única.
        foreach ([now()->subHour(), now()->subMinutes(20)] as $answeredAt) {
            $this->insertAnswer($user->id, $currentQuestion->id, $tenantId, $answeredAt);
        }

        // Semana anterior e outro usuário: nenhum dos dois pode entrar na contagem.
        $this->insertAnswer($user->id, $previousWeekQuestion->id, $tenantId, now()->subWeek());
        $this->insertAnswer($otherUser->id, $otherUserQuestion->id, $tenantId, now()->subMinutes(10));

        // XP: 25 hoje (conta); 999 semana passada e 500 de outro usuário (não contam).
        $this->insertXpLog($user->id, $tenantId, 25, now());
        $this->insertXpLog($user->id, $tenantId, 999, now()->subWeek());
        $this->insertXpLog($otherUser->id, $tenantId, 500, now());

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/user/stats')
            ->assertOk()
            ->assertJsonCount(7, 'weekly')
            ->assertJsonPath('questionsAnswered', 1)
            ->assertJsonFragment(['fullDate' => now()->toDateString(), 'xp' => 25])
            ->assertJsonMissing(['xp' => 999])
            ->assertJsonMissing(['xp' => 500]);
    }

    public function test_weekly_stats_returns_empty_week_for_inactive_user(): void
    {
        $this->seed();

        $tenantId = '00000000-0000-0000-0000-000000000001';

        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'weekly-stats-idle@example.test',
            'password_hash' => 'unused',
            'name' => 'Idle Stats',
            'role' => 'student',
            'tenant_id' => $tenantId,
            'token_version' => 0,
        ]);

        $token = $user->createToken('auth:student:tv0', ['*'], now()->addDay())->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/user/stats')
            ->assertOk()
            ->assertJsonCount(7, 'weekly')
            ->assertJsonPath('questionsAnswered', 0);

        foreach ($response->json('weekly') as $day) {
            $this->assertSame(0, $day['xp']);
        }

        // A semana começa na segunda-feira e termina no domingo.
        $this->assertSame('Seg', $response->json('weekly.0.day'));
        $this->assertSame('Dom', $response->json('weekly.6.day'));
        $this->assertSame(
            Carbon::now()->startOfWeek()->toDateString(),
            $response->json('weekly.0.fullDate'),
        );
    }

    private function createQuestion(string $id, string $tenantId): Question
    {
        return Question::create([
            'id' => $id,
            'subject' => 'Matemática',
            'text' => 'Quanto é 1 + 1?',
            'difficulty' => 'fácil',
            'xp_reward' => 10,
            'tenant_id' => $tenantId,
            'created_at' => now(),
        ]);
    }

    private function insertAnswer(string $userId, string $questionId, string $tenantId, Carbon $createdAt): void
    {
        DB::table('answers')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'question_id' => $questionId,
            'selected_option_index' => 0,
            'is_correct' => true,
            'tenant_id' => $tenantId,
            'created_at' => $createdAt,
        ]);
    }

    private function insertXpLog(string $userId, string $tenantId, int $amount, Carbon $createdAt): void
    {
        DB::table('xp_logs')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'amount' => $amount,
            'reason' => 'Weekly test',
            'tenant_id' => $tenantId,
            'created_at' => $createdAt,
        ]);
    }
}
