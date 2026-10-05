<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Services\TenantAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Multi-tenancy: resolve o tenant ativo da requisição.
 * Prioridade: header X-Tenant-ID → tenant do usuário → tenant da plataforma.
 *
 * A verificação "tenant existe e está ativo" é cacheada (300s) para cortar
 * uma query de DB por request. A invalidação acontece em TenantController
 * (update/destroy) e no migrate de tenants — os únicos caminhos que alteram
 * o status de um tenant.
 */
class ResolveTenant
{
    /** TTL do cache de existência/atividade de tenant (segundos). */
    public const ACTIVE_TTL = 300;

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('auth_user');
        $authType = (string) $request->attributes->get('auth_type', '');
        $requestedTenantId = $request->header('X-Tenant-ID');

        $tenantId = $requestedTenantId
            ?? $user?->tenant_id
            ?? Tenant::PLATFORM_ID;

        if (! self::tenantIsActive((string) $tenantId)
            || ! $user
            || ! TenantAccess::canAccess($user, $authType, (string) $tenantId)) {
            return response()->json(['error' => 'Acesso negado ao tenant solicitado.'], 403);
        }

        $request->attributes->set('tenant_id', $tenantId);

        return $next($request);
    }

    /** Verifica (com cache) se o tenant existe e está ativo. */
    public static function tenantIsActive(string $tenantId): bool
    {
        $key = 'tenant:active:'.$tenantId;

        $active = Cache::get($key);
        if (is_bool($active)) {
            return $active;
        }

        $active = Tenant::query()
            ->whereKey($tenantId)
            ->where('active', true)
            ->exists();

        Cache::put($key, $active, now()->addSeconds(self::ACTIVE_TTL));

        return $active;
    }

    /** Invalida o cache de atividade de um tenant (update/destroy). */
    public static function forgetActiveCache(string $tenantId): void
    {
        Cache::forget('tenant:active:'.$tenantId);
    }
}
