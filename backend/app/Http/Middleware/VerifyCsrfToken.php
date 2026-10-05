<?php

namespace App\Http\Middleware;

use App\Services\CsrfService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Proteção anti-CSRF (double-submit HMAC) — espelho do csrfProtection
 * do Express:
 *
 *  - Obrigatório para requisições mutantes (POST/PUT/PATCH/DELETE)
 *    SOMENTE quando há cookie de sessão (session_token); sem sessão
 *    não há estado a proteger (login, register, webhooks, cron).
 *  - Métodos idempotentes (GET/HEAD/OPTIONS) passam direto.
 */
class VerifyCsrfToken
{
    public function handle(Request $request, Closure $next): Response
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return $next($request);
        }

        if (! CsrfService::verify($request)) {
            return response()->json(['error' => 'Acesso negado: token CSRF inválido.'], 403);
        }

        return $next($request);
    }
}
