<?php

namespace Tests\Feature;

use App\Models\StudentUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CronCleanupTest extends TestCase
{
    use RefreshDatabase;

    public function test_cron_cleanup_removes_only_expired_records(): void
    {
        config(['services.cron.secret' => 'test-cron-secret']);
        $user = StudentUser::query()->create([
            'id' => (string) Str::uuid(),
            'email' => 'student@example.test',
            'password_hash' => 'hashed-password',
        ]);

        $expiredLogId = (string) Str::uuid();
        $recentLogId = (string) Str::uuid();
        DB::table('xp_logs')->insert([
            [
                'id' => $expiredLogId,
                'user_id' => $user->id,
                'amount' => 1,
                'created_at' => now()->subDays(91),
            ],
            [
                'id' => $recentLogId,
                'user_id' => $user->id,
                'amount' => 1,
                'created_at' => now()->subDays(30),
            ],
        ]);

        $expiredToken = (string) Str::uuid();
        $validToken = (string) Str::uuid();
        DB::table('password_reset_tokens')->insert([
            [
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'token' => $expiredToken,
                'expires_at' => now()->subMinute(),
            ],
            [
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'token' => $validToken,
                'expires_at' => now()->addHour(),
            ],
        ]);

        $response = $this->postJson('/api/cron/cleanup', [], [
            'X-Cron-Secret' => 'test-cron-secret',
        ]);

        $response->assertOk()->assertExactJson([
            'success' => true,
            'result' => [
                'xp_logs_deleted' => 1,
                'reset_tokens_deleted' => 1,
            ],
        ]);
        $this->assertDatabaseMissing('xp_logs', ['id' => $expiredLogId]);
        $this->assertDatabaseHas('xp_logs', ['id' => $recentLogId]);
        $this->assertDatabaseMissing('password_reset_tokens', ['token' => $expiredToken]);
        $this->assertDatabaseHas('password_reset_tokens', ['token' => $validToken]);
    }
}
