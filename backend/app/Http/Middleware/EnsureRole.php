<?php

namespace App\Http\Middleware;

use App\Models\Role;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * RBAC — verifica papel do usuário autenticado.
 * Uso: ->middleware('role:admin') ou ->middleware('role:teacher,tenant_admin')
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->attributes->get('auth_user');
        $type = $request->attributes->get('auth_type');

        if (! $user) {
            return response()->json(['error' => 'Não autenticado.'], 401);
        }

        $tenantId = (string) $request->attributes->get('tenant_id', '');

        if ($type === 'admin') {
            // Admins: role code vem da própria tabela admin_users
            $code = $user->role === 'super' ? Role::SUPER_ADMIN : ($user->role ?: 'admin');
            if (in_array($code, $roles, true) || $code === Role::SUPER_ADMIN) {
                // Papéis de tenant só autorizam dentro do próprio tenant:
                // um tenant_admin/teacher de outro tenant não passa aqui.
                if (in_array($code, ['tenant_admin', 'teacher'], true)
                    && (string) ($user->tenant_id ?? '') !== $tenantId) {
                    return response()->json(['error' => 'Permissão insuficiente.'], 403);
                }

                return $next($request);
            }

            return response()->json(['error' => 'Permissão insuficiente.'], 403);
        }

        // Alunos: papel via tabela user_tenant_roles, escopado ao tenant
        // resolvido — um papel vinculado a outro tenant não autoriza aqui.
        $userRole = $user->roles()
            ->wherePivot('tenant_id', $tenantId)
            ->pluck('code')
            ->all();
        if (array_intersect($roles, $userRole)) {
            return $next($request);
        }

        return response()->json(['error' => 'Permissão insuficiente.'], 403);
    }
}
