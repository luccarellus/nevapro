<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autenticação das rotas /api/cron via header X-Cron-Secret.
 * Espelha routes/cron.ts da API Express.
 */
class VerifyCronSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('services.cron.secret');

        if (! $secret || ! hash_equals($secret, (string) $request->header('X-Cron-Secret'))) {
            return response()->json(['error' => 'Não autorizado.'], 401);
        }

        return $next($request);
    }
}
