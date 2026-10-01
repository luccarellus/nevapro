<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
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
        $tenantId = $request->header('X-Tenant-ID')
            ?? $request->attributes->get('auth_user')?->tenant_id
            ?? Tenant::PLATFORM_ID;

        $request->attributes->set('tenant_id', $tenantId);

        return $next($request);
    }
}
