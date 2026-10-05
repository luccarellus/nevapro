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
            $attempts = Cache::increment($k);
            Cache::put($k, $attempts, now()->addSeconds($windowSeconds));

            if ($attempts > $max) {
                return response()->json([
                    'error' => 'Muitas tentativas. Tente novamente em alguns minutos.',
                ], 429)->header('Retry-After', (string) $windowSeconds);
            }
        }

        return $next($request);
    }
}
