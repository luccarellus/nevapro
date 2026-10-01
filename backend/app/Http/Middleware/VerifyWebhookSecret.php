<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autenticação do webhook EventEase via header X-Webhook-Secret.
 */
class VerifyWebhookSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('services.eventease.secret');

        if (! $secret || ! hash_equals($secret, (string) $request->header('X-Webhook-Secret'))) {
            return response()->json(['error' => 'Não autorizado.'], 401);
        }

        return $next($request);
    }
}
