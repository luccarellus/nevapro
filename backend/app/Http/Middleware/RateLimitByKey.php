<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rate limiter por chave (IP ou e-mail da conta) com janela fixa.
 * Espelha rateLimiter() do Express: rateLimiter(max, windowMs).
 * Uso: ->middleware('throttle.custom:10,300') ou ->middleware('throttle.account')
 */
class RateLimitByKey
{
    public function handle(Request $request, Closure $next, int $max = 60, int $windowSeconds = 60): Response
    {
        $key = 'rl:'.sha1($request->ip().'|'.$request->path());
        $accountKey = null;

        // Rate limit por CONTA quando há e-mail no body (proteção contra botnets)
        $email = $request->input('email');
        if (is_string($email) && $email !== '') {
            $accountKey = 'rl:acct:'.sha1(strtolower(trim($email)).'|'.$request->path());
        }

        foreach (array_filter([$key, $accountKey]) as $k) {
            // Janela fixa: o TTL é definido apenas na criação da chave (add);
            // o increment dos requests seguintes NÃO prorroga a janela.
            // Antes cada request fazia put() com TTL novo — a janela deslizava
            // para sempre sob tráfego contínuo (e eram 2 writes por request).
            Cache::add($k, 0, now()->addSeconds($windowSeconds));
            $attempts = Cache::increment($k);

            if ($attempts > $max) {
                return response()->json([
                    'error' => 'Muitas tentativas. Tente novamente em alguns minutos.',
                ], 429)->header('Retry-After', (string) $windowSeconds);
            }
        }

        return $next($request);
    }
}
