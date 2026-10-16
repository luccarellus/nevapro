<?php

namespace Tests\Feature;

use App\Models\StudentUser;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolves_a_sanctum_cookie_token_and_preserves_token_version(): void
    {
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student@example.test',
            'password_hash' => 'not-used-by-this-test',
            'name' => 'Student',
            'token_version' => 0,
        ]);
        $token = $user->createToken('auth:student:tv0', ['*'], now()->addDay())->plainTextToken;

        Cache::flush();

        $resolved = app(AuthService::class)->resolveFromToken($token);

        self::assertNotNull($resolved, 'Expected AuthService::resolveFromToken to return a payload, got null. token='.substr($token, 0, 32));
        self::assertSame($user->id, $resolved['user']->id);
        self::assertSame('student', $resolved['type']);
    }

    public function test_rejects_a_token_from_an_older_token_version(): void
    {
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student@example.test',
            'password_hash' => 'not-used-by-this-test',
            'name' => 'Student',
            'token_version' => 2,
        ]);
        $token = $user->createToken('auth:student:tv1', ['*'], now()->addDay())->plainTextToken;

        Cache::flush();
        self::assertNull(app(AuthService::class)->resolveFromToken($token));
    }

    public function test_login_issues_a_resolvable_cookie_token_for_users_with_a_token_version(): void
    {
        StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student@example.test',
            'password_hash' => Hash::make('correct-password'),
            'name' => 'Student',
            'token_version' => 2,
        ]);

        $login = $this->postJson('/api/auth/login', [
            'email' => 'student@example.test',
            'password' => 'correct-password',
        ]);

        $this->assertTrue($login->isOk(), 'Expected login response to be ok: '.$login->getContent());
        $this->assertEquals(200, $login->baseResponse->getStatusCode());

        self::assertSame(
            'auth:student:tv2',
            PersonalAccessToken::query()->sole()->name,
        );

        $cookie = $login->getCookie('session_token', false);
        self::assertNotNull($cookie, 'Missing session_token cookie from login');
        $cookieValue = $cookie->getValue();
        self::assertNotEmpty($cookieValue, 'session_token cookie is empty');

        $plainTokenId = (int) $cookieValue;
        self::assertGreaterThan(0, $plainTokenId, 'Expected cookie to contain a numeric token id, cookieValue='.$cookieValue);
        $accessTokenRecord = PersonalAccessToken::find($plainTokenId);
        self::assertNotNull($accessTokenRecord, 'Expected Sanctum access token record to exist for token id '.$plainTokenId);

        // Regressão: o snapshot cacheado omitia token_version (está em $hidden no
        // model), então a checagem de revogação lia 0 e derrubava a sessão em 401
        // para todo usuário com token_version > 0 — inclusive logo após o cadastro.
        Cache::flush();
        $resolved = app(AuthService::class)->resolveFromToken($cookieValue);
        self::assertNotNull($resolved, 'Expected login token to be resolvable after cache flush. tokenId='.$plainTokenId);
        self::assertSame($plainTokenId, (int) $resolved['accessToken']->id);
        self::assertSame(2, (int) $resolved['user']->token_version);
    }

    public function test_resolves_a_snapshot_written_before_token_name_tv_existed(): void
    {
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student@example.test',
            'password_hash' => 'not-used-by-this-test',
            'name' => 'Student',
            'token_version' => 2,
        ]);
        $token = $user->createToken('auth:student:tv2', ['*'], now()->addDay())->plainTextToken;
        $tokenId = (int) strstr($token, '|', true);

        // Payload no formato antigo (sem token_name_tv e sem token_version no raw):
        // pode estar quente no Redis no momento do deploy e não pode derrubar
        // sessões válidas até expirar.
        Cache::put('auth:token:'.hash('sha256', $token), [
            'token_id' => $tokenId,
            'token_name' => 'auth:student:tv2',
            'expires_at' => now()->addDay()->toIso8601String(),
            'type' => 'student',
            'tokenable_id' => $user->id,
            'tokenable_type' => StudentUser::class,
            'token_version' => 2,
            'raw' => ['id' => $user->id, 'email' => $user->email],
        ], now()->addSeconds(60));

        $resolved = app(AuthService::class)->resolveFromToken($token);

        self::assertNotNull($resolved, 'Snapshot antigo não pode invalidar uma sessão válida');
        self::assertSame($user->id, $resolved['user']->id);
    }

    public function test_failed_logins_update_attempts_using_email_as_the_primary_key(): void
    {
        StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student@example.test',
            'password_hash' => Hash::make('correct-password'),
            'name' => 'Student',
        ]);

        $credentials = [
            'email' => 'student@example.test',
            'password' => 'wrong-password',
        ];

        $this->postJson('/api/auth/login', $credentials)->assertUnauthorized();
        $this->postJson('/api/auth/login', $credentials)->assertUnauthorized();

        self::assertDatabaseHas('login_attempts', [
            'email' => 'student@example.test',
            'attempts' => 2,
        ]);
    }
}
