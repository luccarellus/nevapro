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
                'email' => ['required', 'email'],
                'password' => ['required', 'string'],
            ]);

            $email = $this->auth->normalizeEmail($data['email']);

            // Rate limit por conta (brute force) — mesma política do Express
            if ($lock = $this->checkLock($email)) {
                return response()->json(['error' => $lock], 429);
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
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:6'],
            'name' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'school' => ['nullable', 'string', 'max:255'],
            'gremio' => ['nullable', 'string', 'max:255'],
        ]);

        $email = $this->auth->normalizeEmail($data['email']);

        // Rate limit por conta (anti-abuse de cadastro) — mesma política do login
        if ($lock = $this->checkLock($email)) {
            return response()->json(['error' => $lock], 429);
        }

        // Resposta 409 uniforme (anti-enumeração de contas) — mesma política do Express
        if (AdminUser::where('email', $email)->exists() || StudentUser::where('email', $email)->exists()) {
            $this->recordFailedAttempt($email);

            return response()->json(['error' => 'Não foi possível concluir o cadastro com este e-mail. Se for você, tente entrar ou recuperar a senha.'], 409);
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
        if ($token) {
            $resolved = $this->auth->resolveFromToken($token);
            if ($resolved && ! empty($resolved['accessToken']->id)) {
                PersonalAccessToken::whereKey($resolved['accessToken']->id)->delete();
            }
            $this->auth->forgetTokenCacheBySecret($token);
        }

        return response()->json(['success' => true])
            ->withCookie(cookie()->forget('session_token'));
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);

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
            'password' => ['required', 'string', 'min:6'],
            'token' => ['required', 'string'],
            'email' => ['nullable', 'email'],
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
            'email' => ['required', 'email'],
            'currentPassword' => ['required', 'string'],
            'newPassword' => ['required', 'string', 'min:6'],
        ]);

        $email = $this->auth->normalizeEmail($data['email']);
        if ($user->email !== $email) {
            return response()->json(['error' => 'Acesso negado: você só pode alterar a própria senha.'], 403);
        }

        if (! Hash::check($data['currentPassword'], $user->password_hash)) {
            return response()->json(['error' => 'Senha atual incorreta.'], 401);
        }

        $user->password_hash = Hash::make($data['newPassword']);
        $user->token_version = ($user->token_version ?? 0) + 1;
        $user->save();

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
    private function storeTokenVersion($user, string $plainToken, string $type): void
    {
        try {
            $tokenId = strstr($plainToken, '|', true);
            if ($tokenId === false || $tokenId === '') {
                return;
            }
            $model = PersonalAccessToken::find($tokenId);
            $model?->update(['name' => "auth:{$type}:tv".($user->token_version ?? 0)]);
        } catch (\Throwable $e) {
            Log::warning('[Auth] Falha ao marcar tv no token: '.$e->getMessage());
        }
    }
}
