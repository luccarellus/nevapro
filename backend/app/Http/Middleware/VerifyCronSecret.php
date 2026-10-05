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
        $expected = (string) config('services.cron.secret');
        $provided = (string) ($request->header('X-Cron-Secret') ?? '');

        // Comparação em tempo constante com length equalizado via hash
        // (não vaza o tamanho do segredo via timing).
        $valid = $expected !== '' && hash_equals(
            hash('sha256', $expected),
            hash('sha256', $provided),
        );

        if (! $valid) {
            return response()->json(['error' => 'Não autorizado.'], 401);
        }

        return $next($request);
    }
}
