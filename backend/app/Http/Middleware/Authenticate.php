<?php

namespace App\Http\Middleware;

use App\Services\AuthService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware de autenticação custom — substitui auth:sanctum para suportar
 * as DUAS tabelas de usuário (admin_users + users) e a revogação por
 * token_version, mantendo os atributos req.user / req.isAdmin da API Express.
 *
 * Coloca no Request:
 *  - auth_user  (StudentUser|AdminUser)
 *  - auth_type  ('student'|'admin')
 *  - is_admin   (bool)
 */
class Authenticate
{
    public function __construct(private readonly AuthService $auth) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->cookie('session_token')
            ?? $request->bearerToken();

        if (! $token) {
            return response()->json(['error' => 'Não autenticado.'], 401);
        }

        $resolved = $this->auth->resolveFromToken($token);

        if (! $resolved) {
            return response()->json(['error' => 'Sessão inválida ou expirada.'], 401);
        }

        $request->attributes->set('auth_user', $resolved['user']);
        $request->attributes->set('auth_type', $resolved['type']);
        $request->attributes->set('is_admin', $resolved['type'] === 'admin');
        $request->attributes->set('auth_access_token', $resolved['accessToken']);

        return $next($request);
    }
}
