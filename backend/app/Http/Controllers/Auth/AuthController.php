<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\AdminUser;
use App\Models\LoginAttempt;
use App\Models\PasswordResetToken;
use App\Models\StudentUser;
use App\Models\Tenant;
use App\Services\AuthService;
use App\Services\EmailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * AuthController — replica /api/auth da API Express:
 * login, register, logout, forgot/reset/change password.
 * Contratos JSON idênticos (success/user/error) para o React não mudar.
 */
class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly EmailService $email,
    ) {}

    public function login(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                // email estrito (RFC): rejeita formatos aceitos por engano
                // (sem TLD, com espaços/controles) e limita o tamanho.
                'email' => ['required', 'string', 'email:rfc,strict', 'max:255', 'not_regex:/[\x00-\x1F\x7F]/'],
                'password' => ['required', 'string', 'max:200'],
            ]);

            $email = $this->auth->normalizeEmail($data['email']);

            // Rate limit por conta (brute force) — mesma política do Express
            if ($lock = $this->checkLock($email)) {
                // Retry-After informa a janela do lockout (5 tentativas / 15 min):
                // sem ele, clientes e proxies ficam martelando o endpoint.
                return response()->json(['error' => $lock], 429)
                    ->header('Retry-After', '900');
            }

            $result = $this->auth->attempt($email, $data['password']);

            if (isset($result['error'])) {
                $this->recordFailedAttempt($email);

                return response()->json(['error' => $result['error']], 401);
            }

            LoginAttempt::where('email', $email)->delete();

            /** @var StudentUser|AdminUser $user */
            $user = $result['user'];
            $type = $result['type'];

            $token = $this->auth->issueToken($user, $type);
            $this->storeTokenVersion($user, $token, $type);

            // Cookie HttpOnly com o token Sanctum — mesmo nome usado pelo Express.
            // Assinatura do helper: cookie($name, $value, $minutes, $path, $domain,
            // $secure, $httpOnly, $raw, $sameSite) — HttpOnly=true, raw=false.
            $cookie = cookie('session_token', $token, 24 * 60, '/', null, (bool) config('session.secure'), true, false, 'Lax');

            return response()->json(['success' => true, 'user' => $user->toProfileArray()])
                ->withCookie($cookie);
        } catch (\Throwable $e) {
            Log::error('[Auth] Login error', [
                'email' => $request->input('email') ?? 'unknown',
                'exception' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json(['error' => 'Erro interno do servidor.'], 500);
        }
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc,strict', 'max:255', 'not_regex:/[\x00-\x1F\x7F]/'],
            // max:72 = limite do bcrypt (acima disso o hash truncaria a senha).
            'password' => ['required', 'string', 'min:6', 'max:72'],
            // Campos de texto puro: sem mark-up (nada aqui deve ser interpretado como HTML).
            'name' => ['nullable', 'string', 'max:255', 'not_regex:/[<>]/'],
            'city' => ['nullable', 'string', 'max:120', 'not_regex:/[<>]/'],
            'school' => ['nullable', 'string', 'max:255', 'not_regex:/[<>]/'],
            'gremio' => ['nullable', 'string', 'max:255', 'not_regex:/[<>]/'],
        ]);

        $email = $this->auth->normalizeEmail($data['email']);

        // Rate limit por conta (anti-abuse de cadastro) — mesma política do login
        if ($lock = $this->checkLock($email)) {
            return response()->json(['error' => $lock], 429)
                ->header('Retry-After', '900');
        }

        // Resposta 201 uniforme (anti-enumeração de contas) — não revela se o e-mail existe.
        $existingUser = AdminUser::where('email', $email)->first()
            ?: StudentUser::where('email', $email)->first();

        if ($existingUser) {
            // NUNCA emitir sessão sem conferir a senha: cadastrar com um e-mail já
            // existente era um bypass completo de autenticação (takeover de
            // qualquer conta, inclusive super admin, com qualquer senha).
            $passwordMatches = AuthService::verifyPassword($data['password'], $existingUser->password_hash)
                && (! $existingUser instanceof AdminUser || $existingUser->active);

            if (! $passwordMatches) {
                // Mesma resposta do cadastro bem-sucedido, sem cookie: não confirma
                // a existência da conta nem cria novo usuário/token.
                return response()->json([
                    'success' => true,
                    'message' => 'Se este e-mail já tiver conta, faça login ou redefina a senha para continuar.',
                ], 201);
            }

            // Senha confere: comporta-se como login (idempotente para quem
            // "recadastra" com os dados corretos).
            $type = $existingUser instanceof AdminUser ? 'admin' : 'student';
            $token = $this->auth->issueToken($existingUser, $type);
            $this->storeTokenVersion($existingUser, $token, $type);

            return response()->json(['success' => true, 'user' => $existingUser->toProfileArray()], 201)
                ->withCookie(cookie('session_token', $token, 24 * 60, '/', null, (bool) config('session.secure'), true, false, 'Lax'));
        }

        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => $email,
            'name' => $data['name'] ?? explode('@', $email)[0],
            'password_hash' => Hash::make($data['password']),
            'role' => 'student',
            'tenant_id' => Tenant::PLATFORM_ID,
            'city' => $data['city'] ?? null,
            'school' => $data['school'] ?? null,
            'gremio' => $data['gremio'] ?? null,
            'xp' => 0,
            'level' => 1,
        ]);

        // Vínculo RBAC: papel student no tenant da plataforma
        DB::statement(
            'INSERT INTO user_tenant_roles (user_id, tenant_id, role_id)
             SELECT ?, ?, id FROM roles WHERE code = ? AND tenant_id IS NULL
             ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING',
            [$user->id, Tenant::PLATFORM_ID, 'student'],
        );

        $this->email->sendWelcomeAsync($user->email, $user->name ?? '');

        $token = $this->auth->issueToken($user, 'student');
        $this->storeTokenVersion($user, $token, 'student');

        $cookie = cookie('session_token', $token, 24 * 60, '/', null, (bool) config('session.secure'), true, false, 'Lax');

        return response()->json(['success' => true, 'user' => $user->toProfileArray()], 201)
            ->withCookie($cookie);
    }

    public function logout(Request $request): JsonResponse
    {
        // Revoga o token atual se presente e limpa o cache de resolução
        // para que a revogação seja efetiva imediatamente. A exclusão é por id
        // porque o accessToken pode ter sido reconstruído a partir do cache
        // (modelo não persistido — delete() em memória seria no-op).
        $token = $request->cookie('session_token');
        if (is_string($token) && $token !== '') {
            $resolved = $this->auth->resolveFromToken($token);
            if ($resolved && ! empty($resolved['accessToken']->id)) {
                PersonalAccessToken::whereKey($resolved['accessToken']->id)->delete();
            }

            // Limpa a resolução em cache: sem isso o token revogado continuaria
            // autenticando até o snapshot expirar (TTL curto).
            $this->auth->forgetTokenCacheBySecret($token);
        }

        return response()->json(['success' => true])
            ->withCookie(cookie()->forget('session_token'));
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc,strict', 'max:255', 'not_regex:/[\x00-\x1F\x7F]/'],
        ]);

        $email = $this->auth->normalizeEmail($data['email']);
        $frontendUrl = rtrim(config('app.frontend_url') ?: config('app.url'), '/');

        $admin = AdminUser::where('email', $email)->first();
        $user = $admin ?: StudentUser::where('email', $email)->first();

        if ($user) {
            $plainToken = str_replace('-', '', (string) Str::uuid());

            DB::transaction(function () use ($user, $plainToken) {
                PasswordResetToken::where('user_id', $user->id)->delete();
                PasswordResetToken::create([
                    'id' => (string) Str::uuid(),
                    'user_id' => $user->id,
                    'token' => hash('sha256', $plainToken),
                    'expires_at' => now()->addHour(),
                ]);
            });

            $resetLink = "{$frontendUrl}/reset-password?token={$plainToken}&email=".urlencode($email);
            $this->email->sendPasswordResetAsync(
                $email,
                $user->name ?? explode('@', $email)[0],
                $resetLink,
            );
        }

        // Resposta genérica (anti-enumeração de contas)
        return response()->json([
            'success' => true,
            'message' => 'Se o e-mail estiver cadastrado, você receberá um link de recuperação em instantes.',
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:6', 'max:72'],
            'token' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'string', 'email:rfc,strict', 'max:255'],
        ]);

        $record = PasswordResetToken::where('token', hash('sha256', $data['token']))->first();

        if (! $record || $record->expires_at->isPast()) {
            return response()->json(['error' => 'Link de recuperação inválido ou expirado. Solicite um novo.'], 401);
        }

        $isAdmin = AdminUser::where('id', $record->user_id)->exists();
        $table = $isAdmin ? 'admin_users' : 'users';

        DB::transaction(function () use ($record, $data, $table) {
            DB::table($table)
                ->where('id', $record->user_id)
                ->update([
                    'password_hash' => Hash::make($data['password']),
                    'updated_at' => now(),
                    'token_version' => DB::raw('COALESCE(token_version, 0) + 1'),
                ]);
            PasswordResetToken::where('user_id', $record->user_id)->delete();
        });

        return response()->json(['success' => true, 'message' => 'Senha redefinida com sucesso.']);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $type = $request->attributes->get('auth_type');

        if (! $user) {
            return response()->json(['error' => 'Não autenticado.'], 401);
        }

        $data = $request->validate([
            'email' => ['required', 'string', 'email:rfc,strict', 'max:255'],
            'currentPassword' => ['required', 'string', 'max:200'],
            'newPassword' => ['required', 'string', 'min:6', 'max:72'],
        ]);

        $email = $this->auth->normalizeEmail($data['email']);
        if ($user->email !== $email) {
            return response()->json(['error' => 'Acesso negado: você só pode alterar a própria senha.'], 403);
        }

        // O snapshot que autentica a request não carrega password_hash (é $hidden),
        // então a conferência da senha atual precisa do registro do banco.
        $model = $type === 'admin' ? AdminUser::class : StudentUser::class;
        $liveUser = $model::whereKey($user->id)->first();
        if (! $liveUser) {
            return response()->json(['error' => 'Usuário não encontrado.'], 404);
        }

        if (! Hash::check($data['currentPassword'], $liveUser->password_hash)) {
            return response()->json(['error' => 'Senha atual incorreta.'], 401);
        }

        // O usuário do request vem do snapshot do AuthService (model não
        // persistido), então a escrita vai por query builder: save() faria INSERT.
        // O token_version é incrementado no banco para revogar as outras sessões.
        $table = $type === 'admin' ? 'admin_users' : 'users';
        DB::table($table)
            ->where('id', $liveUser->id)
            ->update([
                'password_hash' => Hash::make($data['newPassword']),
                'token_version' => DB::raw('COALESCE(token_version, 0) + 1'),
                'updated_at' => now(),
            ]);

        $newVersion = (int) DB::table($table)->where('id', $liveUser->id)->value('token_version');

        // A sessão atual continua válida: o token em uso é remarcado com a nova
        // versão. As demais caem ao expirar o snapshot (ou antes, no cache miss).
        $token = $request->cookie('session_token');
        if (is_string($token) && $token !== '') {
            $this->storeTokenVersion($user, $token, $type, $newVersion);
        }

        return response()->json(['success' => true, 'message' => 'Senha atualizada com sucesso.']);
    }

    // ===== Helpers de brute force (espelham a política do Express) =====

    private function checkLock(string $email): ?string
    {
        $attempt = LoginAttempt::where('email', $email)->first();
        if ($attempt && $attempt->lock_until && now()->lt($attempt->lock_until)) {
            $minutes = max(1, (int) ceil(now()->diffInMinutes($attempt->lock_until)));

            return "Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em {$minutes} minutos.";
        }

        return null;
    }

    private function recordFailedAttempt(string $email): void
    {
        $attempt = LoginAttempt::firstOrNew(['email' => $email]);
        $attempt->attempts = ($attempt->attempts ?? 0) + 1;
        $attempt->lock_until = $attempt->attempts >= 5 ? now()->addMinutes(15) : null;
        $attempt->updated_at = now();
        $attempt->save();
    }

    /** Guarda a versão do token no name do access token p/ checagem de revogação. */
    private function storeTokenVersion($user, string $plainToken, string $type, ?int $tokenVersion = null): void
    {
        try {
            $tokenId = strstr($plainToken, '|', true);
            if ($tokenId === false || $tokenId === '') {
                return;
            }
            $version = $tokenVersion ?? (int) ($user->token_version ?? 0);
            $model = PersonalAccessToken::find($tokenId);
            $model?->update(['name' => "auth:{$type}:tv".$version]);
        } catch (\Throwable $e) {
            Log::warning('[Auth] Falha ao marcar tv no token: '.$e->getMessage());
        }
    }
}
