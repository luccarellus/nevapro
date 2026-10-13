<?php

namespace App\Services;

use App\Models\AdminUser;
use App\Models\StudentUser;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Autenticação unificada (admin + aluno) contra o schema existente.
 * Mantém a semântica da API Express: busca nas duas tabelas e compara
 * password_hash (bcrypt), retornando o perfil no formato do frontend.
 */
class AuthService
{
    /**
     * Tenta autenticar por e-mail. Retorna ['user' => Authenticatable, 'type' => string]
     * ou ['error' => string].
     */
    public function attempt(string $email, string $password): array
    {
        $email = $this->normalizeEmail($email);

        $admin = AdminUser::where('email', $email)->first();
        if ($admin) {
            if (! $admin->active) {
                return ['error' => 'Conta administrativa desativada.'];
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

    /**
     * Emite um token Sanctum que embute o "tipo" de usuário no name,
     * permitindo que o middleware resolva o usuário certo por tabela.
     */
    public function issueToken($user, string $type): string
    {
        return $user->createToken("auth:{$type}", ['*'], now()->addDay())->plainTextToken;
    }

    /**
     * Cache da resolução de token por requisição: corta 2 queries de DB
     * (personal_access_tokens + users/admin_users) em toda chamada autenticada.
     * O payload em cache contém APENAS o id/tipo — o model do usuário é
     * recarregado a cada request para refletir dados frescos; a revogação por
     * token_version continua sendo avaliada ao vivo. Invalidação explícita
     * em logout (e na exclusão de token) mantém a revogação efetiva.
     */
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

            // Revogação por versão (senha trocada → todas as sessões anteriores caem)
            $tokenVersion = (int) ($user->token_version ?? 0);
            $tokenTv = preg_match('/(?:^|:)tv(\d+)$/', (string) $accessToken->name, $matches)
                ? (int) $matches[1]
                : 0;
            if ($tokenVersion > $tokenTv) {
                return null;
            }

            $cached = [
                'token_id'       => $accessToken->id,
                'token_name'     => $accessToken->name,
                'expires_at'     => $accessToken->expires_at?->toIso8601String(),
                'type'           => $type,
                'tokenable_id'   => (string) $accessToken->tokenable_id,
                'tokenable_type' => $type === 'admin' ? AdminUser::class : StudentUser::class,
                'token_version'  => (int) ($user->token_version ?? 0),
            ];
            Cache::put($cacheKey, $cached, now()->addSeconds(self::TOKEN_CACHE_TTL));
        }

        $accessToken = $this->reconstructAccessToken($cached);
        if (! $accessToken) {
            Cache::forget($cacheKey);

            return null;
        }

        // Verificação rápida de token_version via cache (evita query ao banco na maioria dos requests).
        // Se a versão mudou (senha trocada), o cache é invalidado e o DB é consultado.
        $cachedTv = preg_match('/(?:^|:)tv(\d+)$/', (string) $cached['token_name'], $matches)
            ? (int) $matches[1]
            : 0;
        if (isset($cached['token_version']) && (int) $cached['token_version'] > $cachedTv) {
            Cache::forget($cacheKey);

            return null;
        }

        $user = $cached['type'] === 'admin'
            ? AdminUser::find($cached['tokenable_id'])
            : StudentUser::find($cached['tokenable_id']);

        if (! $user) {
            Cache::forget($cacheKey);

            return null;
        }

        // Confirma versão ao vivo — detecta revogação mesmo que o cache ainda esteja quente
        $tokenVersion = (int) ($user->token_version ?? 0);
        if ($tokenVersion > $cachedTv) {
            Cache::forget($cacheKey);

            return null;
        }

        // Atualiza token_version no cache se diferiu (ex.: próxima request pós-renovação)
        if (($cached['token_version'] ?? -1) !== $tokenVersion) {
            $cached['token_version'] = $tokenVersion;
            Cache::put($cacheKey, $cached, now()->addSeconds(self::TOKEN_CACHE_TTL));
        }

        return ['user' => $user, 'type' => $cached['type'], 'accessToken' => $accessToken];
    }

    /** Reconstrói o PersonalAccessToken a partir do payload em cache. */
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

    /** TTL do cache de resolução de token (segundos). */
    public const TOKEN_CACHE_TTL = 60;

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

    /**
     * Verifica a senha aceitando hashes bcrypt gerados fora do Laravel
     * (ex.: bcrypt do Node usa prefixo $2b$, que o Hash::check rejeita
     * com exceção em vez de retornar false).
     */
    public static function verifyPassword(string $password, ?string $hash): bool
    {
        if (! $hash) {
            return false;
        }

        // Hash já no formato aceito pelo Laravel ($2y$/$2a$)
        if (! str_starts_with($hash, '$2b$')) {
            return Hash::check($password, $hash);
        }

        // $2b$ → $2y$: mesmo algoritmo bcrypt, apenas prefixo de origem diferente
        return password_verify($password, '$2y$'.substr($hash, 4));
    }
}
