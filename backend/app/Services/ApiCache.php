<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * Cache helper — espelha services/cache.ts da API Express.
 * Chaves estáveis (CACHE_KEYS) e TTL curto; sem Redis configurado,
 * usa o cache default do Laravel (file/database).
 */
class ApiCache
{
    public const MATERIALS = 'materials';

    public const EVENTS = 'events';

    public const MURAL = 'mural';

    public const LEADERBOARD = 'leaderboard';

    public const QUESTIONS = 'questions';

    public const ADMIN_ACTIVITIES = 'admin_activities';

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
}
