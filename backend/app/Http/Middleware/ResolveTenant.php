<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Services\TenantAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Multi-tenancy: resolve o tenant ativo da requisição.
 * Prioridade: header X-Tenant-ID → tenant do usuário → tenant da plataforma.
 */
class ResolveTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('auth_user');
        $authType = (string) $request->attributes->get('auth_type', '');
        $requestedTenantId = $request->header('X-Tenant-ID');

        $tenantId = $requestedTenantId
            ?? $user?->tenant_id
            ?? Tenant::PLATFORM_ID;

        $tenantIsActive = Tenant::query()
            ->whereKey($tenantId)
            ->where('active', true)
            ->exists();
        if (! $tenantIsActive || ! $user || ! TenantAccess::canAccess($user, $authType, (string) $tenantId)) {
            return response()->json(['error' => 'Acesso negado ao tenant solicitado.'], 403);
        }

        $request->attributes->set('tenant_id', $tenantId);

        return $next($request);
    }
}
