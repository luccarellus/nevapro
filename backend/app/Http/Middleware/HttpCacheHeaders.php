<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cache-Control para a API — espelha a política da API Express:
 *  - GETs estáveis (leaderboard, materials, questoes, eventos, recados):
 *    cache público curto (max-age=30, stale-while-revalidate=60), igual ao
 *    middleware anti-caching do Express.
 *  - Demais endpoints: no-store (dados por usuário/mutáveis).
 */
class HttpCacheHeaders
{
    /** Prefixos de path com resposta estável e cacheável. */
    private const STABLE_PATHS = [
        'api/leaderboard',
        'api/materials',
        'api/questoes',
        'api/eventos',
        'api/recados',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->isMethod('GET') && $request->is('api/*')) {
            $isStable = false;
            foreach (self::STABLE_PATHS as $stable) {
                if (str_starts_with($request->path(), $stable)) {
                    $isStable = true;
                    break;
                }
            }

            if ($isStable && $response->isSuccessful()) {
                $response->headers->set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
            } else {
                $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            }
        }

        return $response;
    }
}
