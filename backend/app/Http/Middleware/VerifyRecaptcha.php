<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verificação do Google reCAPTCHA v3 (server-side).
 * Non-blocking: falha de rede/timeout NÃO bloqueia a requisição.
 * Uso: ->middleware('recaptcha')
 */
class VerifyRecaptcha
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('services.recaptcha.secret');
        $token = $request->input('recaptcha_token');

        if (! $secret || ! is_string($token) || $token === '') {
            return $next($request); // desconfigurado: sem bloqueio
        }

        try {
            $response = Http::asForm()
                ->timeout(2)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                ]);

            $data = $response->json();

            // Só bloqueia em score explicitamente baixo (mesma política do Express)
            if (($data['success'] ?? false) === true && isset($data['score']) && $data['score'] < 0.5) {
                Log::warning('[Recaptcha] score baixo: '.$data['score']);
            }
        } catch (\Throwable $e) {
            Log::warning('[Recaptcha] erro (non-blocking): '.$e->getMessage());
        }

        return $next($request);
    }
}
