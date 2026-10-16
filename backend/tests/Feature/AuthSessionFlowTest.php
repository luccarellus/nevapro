<?php

namespace Tests\Feature;

use App\Models\StudentUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Fluxo real que o React usa: /api/auth/{register,login} devolve o cookie
 * session_token e as rotas autenticadas (profile, bootstrap, notifications)
 * precisam aceitá-lo. Um 401 aqui derruba a tela logo após o cadastro.
 */
class AuthSessionFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_grants_a_session_that_authenticates_subsequent_requests(): void
    {
        $this->seed();

        $register = $this->postJson('/api/auth/register', [
            'email' => 'novo@neva.pro',
            'password' => 'secret123',
            'name' => 'Novo',
        ]);

        self::assertSame(201, $register->getStatusCode(), $register->getContent());
        $token = $this->sessionTokenFrom($register);

        self::assertNotSame(401, $this->getWithSession('/api/user/profile?email=novo%40neva.pro', $token)->getStatusCode());
        self::assertNotSame(401, $this->getWithSession('/api/bootstrap', $token)->getStatusCode());
        self::assertNotSame(401, $this->getWithSession('/api/notifications?email=novo%40neva.pro', $token)->getStatusCode());
    }

    public function test_login_grants_a_session_for_a_user_with_a_token_version(): void
    {
        $this->seed();
        $user = $this->createStudent('estudante@neva.pro', tokenVersion: 3);

        $login = $this->postJson('/api/auth/login', [
            'email' => 'estudante@neva.pro',
            'password' => 'secret123',
        ]);

        self::assertSame(200, $login->getStatusCode(), $login->getContent());
        $token = $this->sessionTokenFrom($login);

        $profile = $this->getWithSession('/api/user/profile?email=estudante%40neva.pro', $token);
        self::assertSame(200, $profile->getStatusCode(), $profile->getContent());
        self::assertSame($user->id, $profile->json('id'));
    }

    public function test_register_for_an_existing_user_gives_a_working_session(): void
    {
        $this->seed();
        $user = $this->createStudent('estudante@neva.pro', tokenVersion: 3);

        $register = $this->postJson('/api/auth/register', [
            'email' => 'estudante@neva.pro',
            'password' => 'secret123',
            'name' => 'Estudante',
        ]);

        self::assertSame(201, $register->getStatusCode(), $register->getContent());
        $token = $this->sessionTokenFrom($register);
        self::assertSame($user->id, $register->json('user.id'));

        $profile = $this->getWithSession('/api/user/profile?email=estudante%40neva.pro', $token);
        self::assertSame(200, $profile->getStatusCode(), $profile->getContent());
    }

    public function test_logout_revokes_the_session(): void
    {
        $this->seed();
        $this->createStudent('sair@neva.pro');

        $login = $this->postJson('/api/auth/login', [
            'email' => 'sair@neva.pro',
            'password' => 'secret123',
        ]);
        $token = $this->sessionTokenFrom($login);

        $logout = $this->postWithSession('/api/auth/logout', $token);

        self::assertSame(200, $logout->getStatusCode(), $logout->getContent());
        self::assertSame(0, PersonalAccessToken::query()->count(), 'Logout deve revogar o access token');
        self::assertSame(
            401,
            $this->getWithSession('/api/user/profile?email=sair%40neva.pro', $token)->getStatusCode(),
            'Token revogado no logout não pode autenticar',
        );
    }

    public function test_change_password_keeps_the_current_session_and_revokes_the_others(): void
    {
        $this->seed();
        $user = $this->createStudent('troca@neva.pro');

        $token = $this->sessionTokenFrom($this->postJson('/api/auth/login', [
            'email' => 'troca@neva.pro',
            'password' => 'secret123',
        ]));
        $otherToken = $this->sessionTokenFrom($this->postJson('/api/auth/login', [
            'email' => 'troca@neva.pro',
            'password' => 'secret123',
        ]));
        self::assertNotSame($token, $otherToken);

        $response = $this->postWithSession('/api/auth/change-password', $token, [
            'email' => 'troca@neva.pro',
            'currentPassword' => 'secret123',
            'newPassword' => 'nova-senha-123',
        ]);

        self::assertSame(200, $response->getStatusCode(), $response->getContent());
        self::assertSame(1, (int) $user->fresh()->token_version);
        self::assertTrue(Hash::check('nova-senha-123', $user->fresh()->password_hash));

        // Sem cache: a sessão que trocou a senha segue válida e as outras caem.
        Cache::flush();
        self::assertSame(
            200,
            $this->getWithSession('/api/user/profile?email=troca%40neva.pro', $token)->getStatusCode(),
            'A sessão atual deve continuar válida após trocar a senha',
        );
        self::assertSame(
            401,
            $this->getWithSession('/api/user/profile?email=troca%40neva.pro', $otherToken)->getStatusCode(),
            'As outras sessões devem ser revogadas após a troca de senha',
        );
    }

    private function createStudent(string $email, int $tokenVersion = 0): StudentUser
    {
        return StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => $email,
            'password_hash' => Hash::make('secret123'),
            'name' => 'Estudante',
            'role' => 'student',
            'tenant_id' => '00000000-0000-0000-0000-000000000001',
            'xp' => 0,
            'level' => 1,
            'token_version' => $tokenVersion,
        ]);
    }

    /** Cookie de sessão do login/registro, como o browser devolveria na próxima request. */
    private function sessionTokenFrom(TestResponse $response): string
    {
        $cookie = $response->getCookie('session_token', false);
        self::assertNotNull($cookie, 'Resposta de autenticação sem cookie session_token');

        return $cookie->getValue();
    }

    private function getWithSession(string $url, string $sessionToken): TestResponse
    {
        // O cookie da API não é criptografado (rotas /api não usam EncryptCookies)
        // e os helpers json() só enviam cookies com credenciais habilitadas.
        return $this->withCredentials()
            ->withUnencryptedCookie('session_token', $sessionToken)
            ->getJson($url);
    }

    /** POST autenticado, com o header anti-CSRF que o frontend envia. */
    private function postWithSession(string $url, string $sessionToken, array $data = []): TestResponse
    {
        config(['services.jwt_secret' => 'test-csrf-secret']);

        return $this->withCredentials()
            ->withUnencryptedCookie('session_token', $sessionToken)
            ->withHeaders(['X-CSRF-Token' => hash_hmac('sha256', 'csrf:'.$sessionToken, 'test-csrf-secret')])
            ->postJson($url, $data);
    }
}
