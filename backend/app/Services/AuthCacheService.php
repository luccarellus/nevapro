<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Helper para gerenciar a relação entre usuários e os tokens de cache cacheados.
 *
 * Este serviço é muito utilizado pelo AuthService para invalidar o cache de
 * resolução de token de um usuário quando o seu snapshot é invalidado.
 *
 * Chave base: auth:user-cache-key-{type}
 * TTL: 10 segundos. Após a expiração, os tokens ficam "órfãos" até o próximo
 * movimento de negócio (login/logout/change-password/progress sync).
 */
class AuthCacheService
{
    /**
     * Recobre a chave de cache da resolução de token de um usuário.
     *
     * @param  int|string|null  $tenantId
     */
    public static function userCacheKey($tenantId, string $type): string
    {
        return "auth:user-cache-key-{$type}".($tenantId !== null && $tenantId !== '' ? ':'.$tenantId : '');
    }

    /**
     * Guarda no cache a relação entre um usuário e um token cacheado.
     * A expiração global é de 10s, alinhada com o TTL do snapshot do usuário.
     *
     * @param  int|string|null  $tenantId
     */
    public static function storeCachedTokenForUser(string $cacheKey, array $payload, $tenantId, string $type): void
    {
        $key = self::userCacheKey($tenantId, $type);

        Cache::tags([$key])->put(
            $cacheKey,
            $payload,
            now()->addSeconds(10),
        );
    }

    /**
     * Invalida a resolução em cache de todos os tokens de um determinado usuário.
     *
     * @param  int|string|null  $tenantId
     */
    public static function invalidateCachedTokensForUser($tenantId, string $type): void
    {
        Cache::tags([self::userCacheKey($tenantId, $type)])->flush();
    }

    /**
     * Retorna o token de acesso em cache do usuário autenticado.
     *
     * @param  int|string|null  $tenantId
     */
    public static function getCachedTokenForUser(string $cacheKey, $tenantId, string $type): ?array
    {
        return Cache::tags([self::userCacheKey($tenantId, $type)])->get($cacheKey);
    }
}
