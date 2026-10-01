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

        if ($requestedTenantId && $user && ! TenantAccess::canAccess($user, $authType, $requestedTenantId)) {
            return response()->json(['error' => 'Acesso negado ao tenant solicitado.'], 403);
        }

        $tenantId = $requestedTenantId
            ?? $user?->tenant_id
            ?? Tenant::PLATFORM_ID;

        $request->attributes->set('tenant_id', $tenantId);

        return $next($request);
    }
}
