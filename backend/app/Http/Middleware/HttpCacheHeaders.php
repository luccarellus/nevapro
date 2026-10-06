<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Evita que respostas da API autenticadas ou limitadas por tenant sejam compartilhadas em caches. */
class HttpCacheHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->is('api/*')) {
            $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        }

        return $response;
    }
}
