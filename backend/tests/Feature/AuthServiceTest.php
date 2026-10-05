<?php

namespace Tests\Feature;

use App\Models\StudentUser;
use App\Services\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            'token_version' => 2,
        ]);
        $token = $user->createToken('auth:student:tv2', ['*'], now()->addDay())->plainTextToken;

        $resolved = app(AuthService::class)->resolveFromToken($token);

        self::assertNotNull($resolved);
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
        ])->assertOk();

        self::assertSame(
            'auth:student:tv2',
            PersonalAccessToken::query()->sole()->name,
        );

        $cookie = $login->getCookie('session_token', false);
        self::assertNotNull($cookie);
        self::assertNotNull(app(AuthService::class)->resolveFromToken($cookie->getValue()));
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
