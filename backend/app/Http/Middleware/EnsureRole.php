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

        if ($type === 'admin') {
            // Admins: role code vem da própria tabela admin_users
            $code = $user->role === 'super' ? Role::SUPER_ADMIN : ($user->role ?: 'admin');
            if (in_array($code, $roles, true) || $code === Role::SUPER_ADMIN) {
                return $next($request);
            }

            return response()->json(['error' => 'Permissão insuficiente.'], 403);
        }

        // Alunos: papel via tabela user_tenant_roles
        $userRole = $user->roles()->pluck('code')->all();
        if (array_intersect($roles, $userRole)) {
            return $next($request);
        }

        return response()->json(['error' => 'Permissão insuficiente.'], 403);
    }
}
