<?php

namespace Tests\Feature;

use App\Http\Controllers\AdminController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\ClientLogController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\MuralController;
use App\Http\Controllers\QuestionController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\RateLimitByKey;
use App\Http\Middleware\VerifyCronSecret;
use App\Http\Middleware\VerifyRecaptcha;
use App\Http\Middleware\VerifyWebhookSecret;
use App\Models\AdminUser;
use App\Models\Material;
use App\Models\MuralPost;
use App\Models\StudentUser;
use App\Models\Tenant;
use App\Services\ApiCache;
use App\Services\AuthService;
use App\Services\B2StorageService;
use App\Services\CsrfService;
use App\Services\EmailService;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Mockery;
use Symfony\Component\HttpKernel\Exception\HttpException as SymfonyHttpException;
use Tests\TestCase;

/**
 * Regressão dos achados da auditoria ofensiva:
 * cada teste falha se a correção correspondente for revertida.
 */
class SecurityFixesTest extends TestCase
{
    use RefreshDatabase;

    // ===== Achado 1 (CRÍTICO): cookie de sessão sem HttpOnly =====

    public function test_login_cookie_is_httponly_secure_and_lax(): void
    {
        $this->seed();
        $user = $this->createStudent('login-user@test.local');

        $auth = Mockery::mock(AuthService::class);
        $auth->shouldReceive('normalizeEmail')->with('login-user@test.local')->andReturn('login-user@test.local');
        $auth->shouldReceive('attempt')->with('login-user@test.local', 'password')
            ->andReturn(['user' => $user, 'type' => 'student']);
        $auth->shouldReceive('issueToken')->with($user, 'student')->andReturn('login-token');
        $email = Mockery::mock(EmailService::class);

        config(['session.secure' => true]);

        $request = Request::create('/api/auth/login', 'POST', [
            'email' => 'login-user@test.local',
            'password' => 'password',
        ]);

        $response = (new AuthController($auth, $email))->login($request);

        $cookies = $response->headers->getCookies();
        self::assertCount(1, $cookies);
        $cookie = $cookies[0];
        self::assertSame('session_token', $cookie->getName());
        self::assertTrue($cookie->isHttpOnly(), 'O cookie de sessão deve ser HttpOnly (não legível por JS).');
        self::assertTrue($cookie->isSecure(), 'O cookie de sessão deve ser Secure (só HTTPS).');
        // O Symfony normaliza SameSite para minúsculas.
        self::assertSame('lax', $cookie->getSameSite());
    }

    public function test_register_cookie_is_httponly_secure_and_lax(): void
    {
        $this->seed();

        $auth = Mockery::mock(AuthService::class);
        $auth->shouldReceive('normalizeEmail')->andReturn('register-user@test.local');
        $auth->shouldReceive('issueToken')->andReturn('register-token');
        $email = Mockery::mock(EmailService::class);
        $email->shouldReceive('sendWelcomeAsync')->andReturnNull();

        config(['session.secure' => true]);

        $request = Request::create('/api/auth/register', 'POST', [
            'email' => 'register-user@test.local',
            'password' => 'secret123',
            'name' => 'Register User',
        ]);

        $response = (new AuthController($auth, $email))->register($request);

        self::assertSame(201, $response->getStatusCode());

        $cookie = $response->headers->getCookies()[0];
        self::assertSame('session_token', $cookie->getName());
        self::assertTrue($cookie->isHttpOnly());
        self::assertTrue($cookie->isSecure());
        // O Symfony normaliza SameSite para minúsculas.
        self::assertSame('lax', $cookie->getSameSite());
    }

    // ===== Achado 6 (MÉDIA): cookie sem Secure por padrão =====

    public function test_secure_cookie_defaults_to_true_when_env_is_unset(): void
    {
        // Produção não pode depender de .env para ter cookies seguros:
        // com a variável ausente, o default precisa ser true.
        putenv('SESSION_SECURE_COOKIE');
        unset($_ENV['SESSION_SECURE_COOKIE'], $_SERVER['SESSION_SECURE_COOKIE']);

        $config = require config_path('session.php');

        self::assertTrue((bool) $config['secure']);
    }

    // ===== Achado 2 (ALTA): mass assignment de tenant_id =====

    public function test_material_update_ignores_tenant_id_from_payload(): void
    {
        $this->seed();
        $tenantA = $this->createTenant('tenant-a');
        $tenantB = $this->createTenant('tenant-b');
        $material = Material::create([
            'id' => (string) Str::uuid(),
            'title' => 'Original',
            'url' => 'https://example.test/material.pdf',
            'type' => 'pdf',
            'tenant_id' => $tenantA,
        ]);

        $request = Request::create('/api/materials/'.$material->id, 'PUT', [
            'title' => 'Alterado',
            'tenant_id' => $tenantB,
        ]);
        $request->attributes->set('tenant_id', $tenantA);

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();

        $controller = new MaterialController($cache, Mockery::mock(NotificationService::class));
        $controller->update($request, $material->id);

        self::assertSame($tenantA, $material->fresh()->tenant_id, 'Um item nunca pode mudar de tenant via payload.');
        self::assertSame('Alterado', $material->fresh()->title);
    }

    public function test_mural_update_ignores_tenant_id_from_payload(): void
    {
        $this->seed();
        $tenantA = $this->createTenant('mural-a');
        $tenantB = $this->createTenant('mural-b');
        $post = MuralPost::create([
            'id' => (string) Str::uuid(),
            'title' => 'Recado',
            'content' => 'Conteúdo',
            'type' => 'geral',
            'tenant_id' => $tenantA,
        ]);

        $request = Request::create('/api/mural/'.$post->id, 'PUT', [
            'title' => 'Atualizado',
            'tenant_id' => $tenantB,
        ]);
        $request->attributes->set('tenant_id', $tenantA);

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();

        $controller = new MuralController($cache, Mockery::mock(NotificationService::class));
        $controller->update($request, $post->id);

        self::assertSame($tenantA, $post->fresh()->tenant_id);
        self::assertSame('Atualizado', $post->fresh()->title);
    }

    // ===== Achado 7 (MÉDIA): materiais sem validação de url/title =====

    public function test_material_rejects_external_url(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('materials-reject');

        $request = Request::create('/api/materials', 'POST', [
            'title' => 'Material externo',
            'url' => 'https://evil.example.com/malware.pdf',
            'type' => 'pdf',
        ]);
        $request->attributes->set('tenant_id', $tenantId);

        $controller = new MaterialController(
            Mockery::mock(ApiCache::class),
            Mockery::mock(NotificationService::class),
        );

        try {
            $controller->store($request);
            self::fail('URL externa ao bucket não deve ser aceita.');
        } catch (ValidationException $e) {
            self::assertArrayHasKey('url', $e->errors());
        }
    }

    public function test_material_accepts_signed_b2_object_url(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('materials-accept');
        $url = '/api/storage/object?file='.rawurlencode('materials/'.(string) Str::uuid().'.pdf')
            .'&s='.rawurlencode('assinatura');

        $request = Request::create('/api/materials', 'POST', [
            'title' => 'Apostila',
            'url' => $url,
            'type' => 'pdf',
        ]);
        $request->attributes->set('tenant_id', $tenantId);

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();
        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('addAsync')->andReturnNull();

        $controller = new MaterialController($cache, $notifications);
        $response = $controller->store($request);

        self::assertSame(201, $response->getStatusCode());
        self::assertDatabaseHas('materials', ['url' => $url, 'tenant_id' => $tenantId]);
    }

    public function test_mural_maps_category_to_type_and_rejects_oversized_content(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('mural-map');

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();
        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('addAsync')->andReturnNull();

        $controller = new MuralController($cache, $notifications);

        $request = Request::create('/api/mural', 'POST', [
            'title' => 'Aviso importante',
            'content' => 'Conteúdo do recado',
            'category' => 'aviso',
        ]);
        $request->attributes->set('tenant_id', $tenantId);
        $response = $controller->store($request);

        self::assertSame(201, $response->getStatusCode());
        self::assertDatabaseHas('mural', ['type' => 'aviso', 'tenant_id' => $tenantId]);

        $request = Request::create('/api/mural', 'POST', [
            'title' => 'Gigante',
            'content' => str_repeat('x', 10001),
        ]);
        $request->attributes->set('tenant_id', $tenantId);

        try {
            $controller->store($request);
            self::fail('Conteúdo acima do limite deve ser rejeitado.');
        } catch (ValidationException $e) {
            self::assertArrayHasKey('content', $e->errors());
        }
    }

    public function test_event_store_maps_camel_case_fields_and_enforces_bounds(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('events-map');

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();
        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('addAsync')->andReturnNull();

        $controller = new EventController($cache, $notifications);

        // O frontend (AdminDashboard) envia camelCase; o banco espera snake_case.
        $request = Request::create('/api/events', 'POST', [
            'title' => 'Simulado ENEM',
            'date' => '2026-11-01',
            'questionsCount' => 10,
            'xpReward' => 5,
        ]);
        $request->attributes->set('tenant_id', $tenantId);
        $response = $controller->store($request);

        self::assertSame(201, $response->getStatusCode());
        self::assertDatabaseHas('events', [
            'questions_count' => 10,
            'xp_reward' => 5,
            'tenant_id' => $tenantId,
        ]);
        self::assertSame(10, $response->getData()->questionsCount);

        $request = Request::create('/api/events', 'POST', [
            'title' => 'Estourado',
            'date' => '2026-11-01',
            'questionsCount' => 100001,
        ]);
        $request->attributes->set('tenant_id', $tenantId);

        try {
            $controller->store($request);
            self::fail('questionsCount acima do limite deve ser rejeitado.');
        } catch (ValidationException $e) {
            self::assertArrayHasKey('questionsCount', $e->errors());
        }
    }

    // ===== Achado 3 (ALTA): avatarUrl de outro usuário (IDOR) e deleção B2 =====

    public function test_update_profile_rejects_foreign_avatar_url(): void
    {
        $this->seed();
        $user = $this->createStudent('owner@test.local');
        $otherId = (string) Str::uuid();

        $request = Request::create('/api/users/me', 'PUT', [
            'avatarUrl' => '/api/storage/object?file='.rawurlencode("avatars/{$otherId}/photo.png")
                .'&s='.rawurlencode('assinatura'),
        ]);
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');

        $controller = new UserController(Mockery::mock(ApiCache::class));

        try {
            $controller->updateProfile($request);
            self::fail('Avatar de outro usuário não deve ser aceito (IDOR de leitura).');
        } catch (ValidationException $e) {
            self::assertArrayHasKey('avatarUrl', $e->errors());
        }
    }

    public function test_update_profile_accepts_own_avatar_url(): void
    {
        $this->seed();
        $user = $this->createStudent('self@test.local');
        $url = '/api/storage/object?file='.rawurlencode("avatars/{$user->id}/photo.png")
            .'&s='.rawurlencode('assinatura');

        $request = Request::create('/api/users/me', 'PUT', ['avatarUrl' => $url]);
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();

        $controller = new UserController($cache);
        $response = $controller->updateProfile($request);

        self::assertSame(200, $response->getStatusCode());
        self::assertDatabaseHas('users', ['id' => $user->id, 'avatar_url' => $url]);
    }

    public function test_admin_delete_user_never_deletes_foreign_avatar_object(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('delete-foreign');
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'victim@test.local',
            'password_hash' => Hash::make('password'),
            'name' => 'Victim',
            'role' => 'student',
            'tenant_id' => $tenantId,
            // Avatar aponta para um objeto FORA do diretório do usuário
            'avatar_url' => '/api/storage/object?file='.rawurlencode('materials/secret.pdf')
                .'&s='.rawurlencode('assinatura'),
        ]);

        $b2 = Mockery::mock(B2StorageService::class);
        $b2->shouldReceive('delete')->never();
        $this->instance(B2StorageService::class, $b2);

        $request = Request::create('/api/admin/users/'.$user->id, 'DELETE');
        $request->attributes->set('tenant_id', $tenantId);

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();

        $controller = new AdminController($cache);
        $response = $controller->deleteUser($request, $user->id);

        self::assertSame(200, $response->getStatusCode());
        self::assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_admin_delete_user_deletes_own_avatar_object(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('delete-own');
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'leaver@test.local',
            'password_hash' => Hash::make('password'),
            'name' => 'Leaver',
            'role' => 'student',
            'tenant_id' => $tenantId,
            'avatar_url' => '/api/storage/object?file='.rawurlencode("avatars/".(string) Str::uuid()."/p.png")
                .'&s='.rawurlencode('assinatura'),
        ]);
        // Corrige para o próprio diretório (o que o upload real produz)
        $ownUrl = '/api/storage/object?file='.rawurlencode("avatars/{$user->id}/photo.png")
            .'&s='.rawurlencode('assinatura');
        StudentUser::where('id', $user->id)->update(['avatar_url' => $ownUrl]);

        $b2 = Mockery::mock(B2StorageService::class);
        $b2->shouldReceive('delete')->once()->with("avatars/{$user->id}/photo.png")->andReturn(true);
        $this->instance(B2StorageService::class, $b2);

        $request = Request::create('/api/admin/users/'.$user->id, 'DELETE');
        $request->attributes->set('tenant_id', $tenantId);

        $cache = Mockery::mock(ApiCache::class);
        $cache->shouldReceive('invalidate')->andReturnNull();

        $controller = new AdminController($cache);
        $controller->deleteUser($request, $user->id);
    }

    // ===== Achado 4 (ALTA): RBAC sem escopo de tenant =====

    public function test_tenant_admin_cannot_access_other_tenant(): void
    {
        $this->seed();
        $tenantA = $this->createTenant('rbac-a');
        $tenantB = $this->createTenant('rbac-b');

        $admin = new AdminUser;
        $admin->role = 'tenant_admin';
        $admin->tenant_id = $tenantA;

        $request = Request::create('/api/admin/users', 'GET');
        $request->attributes->set('auth_user', $admin);
        $request->attributes->set('auth_type', 'admin');
        $request->attributes->set('tenant_id', $tenantB);

        $response = (new EnsureRole)->handle($request, fn () => response()->noContent(), 'tenant_admin');

        self::assertSame(403, $response->getStatusCode());
    }

    public function test_student_role_from_other_tenant_is_rejected(): void
    {
        $this->seed();
        $tenantA = $this->createTenant('student-a');
        $tenantB = $this->createTenant('student-b');
        $userId = (string) Str::uuid();
        $roleId = DB::table('roles')->where('code', 'teacher')->whereNull('tenant_id')->value('id');
        DB::table('user_tenant_roles')->insert([
            'user_id' => $userId,
            'tenant_id' => $tenantA,
            'role_id' => $roleId,
        ]);

        $user = new StudentUser;
        $user->id = $userId;

        $request = Request::create('/api/courses', 'GET');
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');
        $request->attributes->set('tenant_id', $tenantB);

        $response = (new EnsureRole)->handle($request, fn () => response()->noContent(), 'teacher');

        self::assertSame(403, $response->getStatusCode());
    }

    public function test_student_role_in_requested_tenant_is_allowed(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('student-ok');
        $userId = (string) Str::uuid();
        $roleId = DB::table('roles')->where('code', 'teacher')->whereNull('tenant_id')->value('id');
        DB::table('user_tenant_roles')->insert([
            'user_id' => $userId,
            'tenant_id' => $tenantId,
            'role_id' => $roleId,
        ]);

        $user = new StudentUser;
        $user->id = $userId;

        $request = Request::create('/api/courses', 'GET');
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');
        $request->attributes->set('tenant_id', $tenantId);

        $response = (new EnsureRole)->handle($request, fn () => response()->noContent(), 'teacher');

        self::assertSame(204, $response->getStatusCode());
    }

    public function test_super_admin_passes_across_tenants(): void
    {
        $this->seed();
        $tenantA = $this->createTenant('super-a');
        $tenantB = $this->createTenant('super-b');

        $admin = new AdminUser;
        $admin->role = 'super';
        $admin->tenant_id = $tenantA;

        $request = Request::create('/api/admin/users', 'GET');
        $request->attributes->set('auth_user', $admin);
        $request->attributes->set('auth_type', 'admin');
        $request->attributes->set('tenant_id', $tenantB);

        $response = (new EnsureRole)->handle($request, fn () => response()->noContent(), 'admin');

        self::assertSame(204, $response->getStatusCode());
    }

    // ===== Achado 5 (MÉDIA): recaptcha fail-open =====

    public function test_recaptcha_rejects_missing_token_when_secret_is_configured(): void
    {
        config(['services.recaptcha.secret' => 'test-secret']);

        $request = Request::create('/api/contact', 'POST', []);

        $response = (new VerifyRecaptcha)->handle($request, fn () => response()->noContent());

        self::assertSame(403, $response->getStatusCode(), 'Token ausente não pode burlar o recaptcha (fail closed).');
    }

    public function test_recaptcha_rejects_unsuccessful_verification(): void
    {
        config(['services.recaptcha.secret' => 'test-secret']);
        Http::fake(['www.google.com/*' => Http::response(['success' => false])]);

        $request = Request::create('/api/contact', 'POST', ['recaptcha_token' => 'token']);

        $response = (new VerifyRecaptcha)->handle($request, fn () => response()->noContent());

        self::assertSame(403, $response->getStatusCode());
    }

    public function test_recaptcha_rejects_low_score(): void
    {
        config(['services.recaptcha.secret' => 'test-secret']);
        Http::fake(['www.google.com/*' => Http::response(['success' => true, 'score' => 0.3])]);

        $request = Request::create('/api/contact', 'POST', ['recaptcha_token' => 'token']);

        $response = (new VerifyRecaptcha)->handle($request, fn () => response()->noContent());

        self::assertSame(403, $response->getStatusCode());
    }

    public function test_recaptcha_accepts_valid_token(): void
    {
        config(['services.recaptcha.secret' => 'test-secret']);
        Http::fake(['www.google.com/*' => Http::response(['success' => true, 'score' => 0.9])]);

        $request = Request::create('/api/contact', 'POST', ['recaptcha_token' => 'token']);

        $response = (new VerifyRecaptcha)->handle($request, fn () => response()->noContent());

        self::assertSame(204, $response->getStatusCode());
    }

    public function test_recaptcha_allows_request_when_secret_is_not_configured(): void
    {
        config(['services.recaptcha.secret' => null]);

        $request = Request::create('/api/contact', 'POST', []);

        $response = (new VerifyRecaptcha)->handle($request, fn () => response()->noContent());

        self::assertSame(204, $response->getStatusCode());
    }

    // ===== Achado 9 (BAIXA): upload sem validação de magic bytes =====

    public function test_upload_rejects_fake_image_content(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'fakeimg');
        file_put_contents($path, 'this is not an image');

        // A extensão declarada é jpg, mas o conteúdo não é uma imagem.
        $file = new class($path, 'avatar.jpg', 'image/jpeg', null, true) extends UploadedFile {
            public function guessExtension(): ?string
            {
                return 'jpg';
            }
        };

        $this->assertContentRejected($file);
    }

    public function test_upload_rejects_fake_pdf_content(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'fakepdf');
        file_put_contents($path, 'not really a pdf');

        // A extensão declarada é pdf, mas o cabeçalho %PDF- está ausente.
        $file = new class($path, 'material.pdf', 'application/pdf', null, true) extends UploadedFile {
            public function guessExtension(): ?string
            {
                return 'pdf';
            }
        };

        $this->assertContentRejected($file);
    }

    public function test_upload_accepts_real_pdf_magic_bytes(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'realpdf');
        file_put_contents($path, "%PDF-1.4\n1 0 obj\n%%EOF\n");

        $file = new UploadedFile($path, 'material.pdf', 'application/pdf', null, true);

        $controller = new UploadController();
        $method = new \ReflectionMethod(UploadController::class, 'assertSafeContent');
        $method->setAccessible(true);

        // Não deve lançar: cabeçalho %PDF- é válido
        $method->invoke($controller, $file);
        self::assertTrue(true);
    }

    private function assertContentRejected(UploadedFile $file): void
    {
        $controller = new UploadController();
        $method = new \ReflectionMethod(UploadController::class, 'assertSafeContent');
        $method->setAccessible(true);

        try {
            $method->invoke($controller, $file);
            self::fail('Conteúdo com magic bytes inválidos deve ser rejeitado.');
        } catch (SymfonyHttpException $e) {
            self::assertSame(422, $e->getStatusCode());
        }
    }

    // ===== Achado 10 (BAIXA): log forging / PII no log =====

    public function test_client_log_sanitizes_line_breaks_and_context(): void
    {
        $logger = Mockery::mock();
        $logger->shouldReceive('info')->once()->withArgs(function ($message, $context) {
            return ! str_contains((string) $message, "\n")
                && ! str_contains((string) $message, "\r")
                && ($context['context']['injected'] ?? null) === 'safe value';
        });
        $manager = Mockery::mock(\Illuminate\Log\LogManager::class);
        $manager->shouldReceive('channel')->with('daily')->andReturn($logger);
        Log::swap($manager);

        $request = Request::create('/api/client-logs', 'POST', [
            'level' => 'info',
            'message' => "primeira linha\nsegunda linha",
            'context' => ['injected' => "safe\r\nvalue"],
        ]);

        $response = (new ClientLogController)->store($request);

        self::assertSame(200, $response->getStatusCode());
    }

    // ===== Achado 11 (BAIXA): rate limit sem Retry-After =====

    public function test_rate_limit_returns_retry_after_header(): void
    {
        $request = Request::create('/api/security-fixes-rate-limit', 'POST', [
            'email' => 'security-fixes-rate-limit@test.local',
        ]);
        $middleware = new RateLimitByKey();

        $first = $middleware->handle($request, fn () => response()->noContent(), 1, 60);
        self::assertSame(204, $first->getStatusCode());

        $second = $middleware->handle($request, fn () => response()->noContent(), 1, 60);
        self::assertSame(429, $second->getStatusCode());
        self::assertSame('60', $second->headers->get('Retry-After'), 'Respostas 429 devem informar Retry-After.');
    }

    // ===== Achado 12 (BAIXA): persistExternalQuestions não sanitizada =====

    public function test_external_question_text_is_sanitized(): void
    {
        $controller = new QuestionController(Mockery::mock(ApiCache::class));
        $method = new \ReflectionMethod(QuestionController::class, 'sanitizeRichText');
        $method->setAccessible(true);

        $result = (string) $method->invoke(
            $controller,
            '<script>alert(1)</script><img src=x onerror=alert(2)><p>Texto <b>válido</b></p>',
        );

        self::assertStringNotContainsString('<script', $result);
        self::assertStringNotContainsString('<img', $result);
        self::assertStringNotContainsString('onerror', $result);
        self::assertStringContainsString('<p', $result);
        self::assertStringContainsString('<b>', $result);

        // Atributos de evento em tags permitidas são removidos
        $result = (string) $method->invoke($controller, '<p onclick="evil()">ok</p>');
        self::assertStringNotContainsString('onclick', $result);
        self::assertStringContainsString('<p>ok</p>', $result);

        // esquemas perigosos em href são removidos
        $result = (string) $method->invoke($controller, '<a href="javascript:alert(1)">x</a>');
        self::assertStringNotContainsString('javascript:', $result);
        self::assertStringContainsString('<a>x</a>', $result);
    }

    // ===== Hardening novo: CSRF (double-submit HMAC) =====

    public function test_csrf_requires_double_submit_token_with_session(): void
    {
        putenv('JWT_SECRET=csrf-test-secret');

        $request = Request::create('/api/protected', 'POST');
        $request->cookies->set('session_token', 'session-id-123');

        self::assertFalse(CsrfService::verify($request), 'Sem header X-CSRF-Token a requisição mutante deve ser rejeitada.');
    }

    public function test_csrf_accepts_valid_double_submit_token(): void
    {
        putenv('JWT_SECRET=csrf-test-secret');

        $request = Request::create('/api/protected', 'POST');
        $request->cookies->set('session_token', 'session-id-123');
        $request->headers->set('X-CSRF-Token', hash_hmac('sha256', 'csrf:session-id-123', 'csrf-test-secret'));

        self::assertTrue(CsrfService::verify($request));
    }

    public function test_csrf_allows_requests_without_session_cookie(): void
    {
        putenv('JWT_SECRET=csrf-test-secret');

        $request = Request::create('/api/public', 'POST');

        // Sem cookie de sessão não há estado a proteger (login, webhooks, cron)
        self::assertTrue(CsrfService::verify($request));
    }

    // ===== Hardening novo: segredos de webhook/cron (fail closed) =====

    public function test_webhook_secret_rejects_invalid_key(): void
    {
        config(['services.eventease.secret' => 'expected-webhook-secret']);

        $request = Request::create('/api/webhooks/eventease', 'POST', [], [], [], [
            'HTTP_X_WEBHOOK_SECRET' => 'wrong-secret',
        ]);

        $response = (new VerifyWebhookSecret)->handle($request, fn () => response()->noContent());

        self::assertSame(401, $response->getStatusCode());
    }

    public function test_webhook_secret_accepts_valid_key(): void
    {
        config(['services.eventease.secret' => 'expected-webhook-secret']);

        $request = Request::create('/api/webhooks/eventease', 'POST', [], [], [], [
            'HTTP_X_WEBHOOK_SECRET' => 'expected-webhook-secret',
        ]);

        $response = (new VerifyWebhookSecret)->handle($request, fn () => response()->noContent());

        self::assertSame(204, $response->getStatusCode());
    }

    public function test_cron_secret_rejects_invalid_key(): void
    {
        config(['services.cron.secret' => 'expected-cron-secret']);

        $request = Request::create('/api/cron/cleanup', 'GET', [], [], [], [
            'HTTP_X_CRON_SECRET' => 'wrong-secret',
        ]);

        $response = (new VerifyCronSecret)->handle($request, fn () => response()->noContent());

        self::assertSame(401, $response->getStatusCode());
    }

    // ===== Helpers =====

    private function createStudent(string $email): StudentUser
    {
        return StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => $email,
            'password_hash' => Hash::make('password'),
            'name' => 'Test User',
            'role' => 'student',
            'tenant_id' => Tenant::PLATFORM_ID,
            'xp' => 0,
            'level' => 1,
        ]);
    }

    private function createTenant(string $slug): string
    {
        $id = (string) Str::uuid();
        DB::table('tenants')->insert([
            'id' => $id,
            'name' => $slug,
            'slug' => $slug,
            'plan' => 'free',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }
}
