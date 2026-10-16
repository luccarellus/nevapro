<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\Cache;    /**
     * Cache helper — espelha services/cache.ts da API Express.
     * Chaves estáveis (CACHE_KEYS) e TTL curto; sem Redis configurado,
     * usa o cache default do Laravel (file/database).
     *
     * @phpstan-require-extends false
     */
class ApiCache
{
    public const MATERIALS = 'materials';

    public const EVENTS = 'events';

    public const MURAL = 'mural';

    public const LEADERBOARD = 'leaderboard';

    public const QUESTIONS = 'questions';

    public const ADMIN_ACTIVITIES = 'admin_activities';

    public const ADMIN_USERS = 'admin_users';

    /** Chaves estáveis usadas pelo AuthService para o cache de snapshot do usuário. */
    public const USER_TOKEN_KEY_PREFIX = 'auth:user';

    public const USER_TOKEN_KEY_TTL_SECONDS = 10;

    public function remember(string $key, int $ttlSeconds, Closure $callback): mixed
    {
        return Cache::remember("neva:{$key}", now()->addSeconds($ttlSeconds), $callback);
    }

    public function invalidate(string ...$keys): void
    {
        foreach ($keys as $key) {
            Cache::forget("neva:{$key}");
        }
    }

    /** Cache de perfil do usuário (TTL 60s, mesma política do Express). */
    public function profile(string $email, Closure $callback): mixed
    {
        return $this->remember("profile:{$email}", 60, $callback);
    }

    /** Força invalidação do cache de snapshot do usuário e seus tokens relacionados. */
    public function invalidateUserSnapshot(string $userId, string $type, ?int $tenantId = null): void
    {
        $this->invalidate(self::userCacheKey($userId, $type, $tenantId));
        $this->invalidate(self::tokenCacheKey('').':*');
    }

    /** Retorna a lista de chaves do token cacheadas para um usuário específico, sem expurgar. */
    public function userTokenCacheKeys(string $userId, string $type, ?int $tenantId = null): array
    {
        $userCacheKey = self::userCacheKey($userId, $type, $tenantId);

        return Cache::tags([$userCacheKey])->get('token_cache_keys') ?? [];
    }

    /** Salva no cache a relação entre o usuario e os tokens de cache cacheados para ele. */
    public function stampUserTokenCacheKey(string $userId, string $type, ?int $tenantId, string $tokenCacheKey): void
    {
        $this->remember(self::userCacheKey($userId, $type, $tenantId), self::USER_TOKEN_KEY_TTL_SECONDS, function () use ($tokenCacheKey) {
            $p = self::tokenCacheKey('');
            $keys = Cache::tags([self::userCacheKey($userId, $type, $tenantId)])->get('token_cache_keys') ?? [];
            if (! in_array($tokenCacheKey, $keys, true)) {
                $keys[] = $tokenCacheKey;
                Cache::tags([self::userCacheKey($userId, $type, $tenantId)])->put('token_cache_keys', $keys, now()->addSeconds(self::USER_TOKEN_KEY_TTL_SECONDS));
            }

            return $keys;
        });
    }

    /** Remove do cache as relações de token agrupadas por usuário. */
    public function forgetUserTokenRelation(string $userId, string $type, ?int $tenantId = null): void
    {
        $userCacheKey = self::userCacheKey($userId, $type, $tenantId);
        Cache::tags([$userCacheKey])->forget('token_cache_keys');
    }
}
