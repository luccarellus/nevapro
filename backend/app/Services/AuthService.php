<?php

namespace App\Services;

use App\Models\AdminUser;
use App\Models\StudentUser;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\PersonalAccessToken;

class AuthService
{
    public const TOKEN_CACHE_TTL = 60;

    public const USER_CACHE_TTL = 10;

    public function attempt(string $email, string $password): array
    {
        $email = $this->normalizeEmail($email);

        $admin = AdminUser::where('email', $email)->first();
        if ($admin) {
            if (! $admin->active) {
                return ['error' => 'E-mail ou senha incorretos.'];
            }
            if (self::verifyPassword($password, $admin->password_hash)) {
                return ['user' => $admin, 'type' => 'admin'];
            }

            return ['error' => 'E-mail ou senha incorretos.'];
        }

        $student = StudentUser::where('email', $email)->first();
        if ($student && self::verifyPassword($password, $student->password_hash)) {
            return ['user' => $student, 'type' => 'student'];
        }

        return ['error' => 'E-mail ou senha incorretos.'];
    }

    public function issueToken($user, string $type): string
    {
        return $user->createToken("auth:{$type}", ['*'], now()->addDay())->plainTextToken;
    }

    /** Cache da resolução de token por requisição: corta 1 DB query por request. */
    public function resolveFromToken(string $token): ?array
    {
        $cacheKey = 'auth:token:'.hash('sha256', $token);

        $cached = Cache::get($cacheKey);

        if (! is_array($cached)) {
            $accessToken = PersonalAccessToken::findToken($token);
            if (! $accessToken || $accessToken->expires_at?->isPast()) {
                return null;
            }

            $type = str_starts_with($accessToken->name, 'auth:admin') ? 'admin' : 'student';

            $user = $type === 'admin'
                ? AdminUser::find($accessToken->tokenable_id)
                : StudentUser::find($accessToken->tokenable_id);

            if (! $user) {
                return null;
            }

            // ----- START USER SNAPSHOT CACHE (avoids 1 query DB to build/validate hash) -----
            $tokenVersion = (int) ($user->token_version ?? 0);
            $tokenTv = preg_match('/(?:^|:)tv(\d+)$/', (string) $accessToken->name, $matches)
                ? (int) $matches[1]
                : 0;

            if ($tokenVersion > $tokenTv) {
                return null;
            }

            $raw = array_map(
                static fn ($v) => $v instanceof \Carbon\Carbon ? $v->toIso8601String() : $v,
                $user->toArray(),
            );

            // token_version está em $hidden, então toArray() o omite. Sem ele no
            // snapshot a checagem de revogação leria 0 e recusaria todo token de
            // usuário com versão > 0 (401 em qualquer rota autenticada).
            $raw['token_version'] = $tokenVersion;

            $tenantId = $type === 'admin'
                ? ($user instanceof AdminUser ? $user->tenant_id : null)
                : ($user instanceof StudentUser ? $user->tenant_id : null);

            $cached = [
                'token_id' => $accessToken->id,
                'token_name' => $accessToken->name,
                'expires_at' => $accessToken->expires_at?->toIso8601String(),
                'type' => $type,
                'tokenable_id' => (string) $accessToken->tokenable_id,
                'tokenable_type' => $type === 'admin' ? AdminUser::class : StudentUser::class,
                'token_version' => $tokenVersion,
                'token_name_tv' => $tokenTv,
                'cache_token' => $token,
                'raw' => $raw,
            ];

            Cache::put($cacheKey, $cached, now()->addSeconds(self::TOKEN_CACHE_TTL));
            AuthCacheService::storeCachedTokenForUser($cacheKey, $cached, $tenantId, $type);
            // ----- END USER SNAPSHOT CACHE ---------------------------------------------------
        }

        $accessToken = $this->reconstructAccessToken($cached);

        if (! $accessToken) {
            Cache::forget($cacheKey);

            return null;
        }

        // Revogação: versão do usuário no snapshot x versão gravada no name do
        // token (auth:{type}:tv{n}) na emissão. Snapshots antigos não têm
        // token_name_tv — deriva do próprio name para não recusar token válido.
        $tokenNameTv = $cached['token_name_tv']
            ?? (preg_match('/(?:^|:)tv(\d+)$/', (string) ($cached['token_name'] ?? ''), $m) ? (int) $m[1] : 0);

        if (($cached['token_version'] ?? 0) > $tokenNameTv) {
            Cache::forget($cacheKey);

            return null;
        }

        $rawUser = $cached['tokenable_type'] === AdminUser::class
            ? AdminUser::createFromArray($cached['raw'] ?? [])
            : StudentUser::createFromArray($cached['raw'] ?? []);

        if (! $rawUser) {
            Cache::forget($cacheKey);

            return null;
        }

        return ['user' => $rawUser, 'type' => $cached['type'], 'accessToken' => $accessToken];
    }

    private function reconstructAccessToken(array $cached): ?PersonalAccessToken
    {
        $expiresAt = isset($cached['expires_at']) && is_string($cached['expires_at'])
            ? \Carbon\Carbon::parse($cached['expires_at'])
            : null;
        if ($expiresAt && $expiresAt->isPast()) {
            return null;
        }

        $accessToken = new PersonalAccessToken;
        $accessToken->forceFill([
            'id' => (int) $cached['token_id'],
            'name' => (string) $cached['token_name'],
            'tokenable_type' => (string) $cached['tokenable_type'],
            'tokenable_id' => (string) $cached['tokenable_id'],
            'expires_at' => $expiresAt,
        ]);

        return $accessToken;
    }

    /**
     * Remove a resolução em cache de um token — chamado no logout para que a
     * revogação seja efetiva imediatamente (mesma política do Express).
     */
    public function forgetTokenCacheBySecret(string $plainToken): void
    {
        Cache::forget('auth:token:'.hash('sha256', $plainToken));
    }

    public function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    public static function verifyPassword(string $password, ?string $hash): bool
    {
        if (! $hash) {
            return false;
        }

        if (! str_starts_with($hash, '$2b$')) {
            return Hash::check($password, $hash);
        }

        return password_verify($password, '$2y$'.substr($hash, 4));
    }

    public function ensureRecaptcha(?string $token = null): bool
    {
        $secret = config('services.recaptcha.secret');
        if (! $secret) {
            return false;
        }
        if (! is_string($token) || trim($token) === '') {
            return true;
        }
        try {
            $response = Http::asForm()
                ->timeout(2)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                ]);

            $data = $response->json();

            if (($data['success'] ?? false) !== true) {
                return true;
            }
            if (isset($data['score']) && $data['score'] < 0.5) {
                return true;
            }

            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }
}
