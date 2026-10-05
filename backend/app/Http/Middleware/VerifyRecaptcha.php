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

        // Sem segredo configurado o recurso fica sem proteção (documentado
        // em .env.example) — mesma política do Express.
        if (! $secret) {
            return $next($request); // desconfigurado: sem bloqueio
        }

        // Com segredo configurado, token ausente/vazio NÃO passa (fail closed):
        // omitir o token não pode burlar a proteção.
        if (! is_string($token) || trim($token) === '') {
            return response()->json(['error' => 'Verificação de segurança falhou. Tente novamente.'], 403);
        }

        try {
            $response = Http::asForm()
                ->timeout(2)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                ]);

            $data = $response->json();

            // Fail-closed: mesma política do Express (auth.ts) — sucesso=false ou score baixo bloqueia.
            if (($data['success'] ?? false) !== true) {
                Log::warning('[Recaptcha] verificação rejeitada pelo Google.');

                return response()->json(['error' => 'Verificação de segurança falhou. Tente novamente.'], 403);
            }

            if (isset($data['score']) && $data['score'] < 0.5) {
                Log::warning('[Recaptcha] score baixo: '.$data['score']);

                return response()->json(['error' => 'Verificação de segurança falhou. Tente novamente.'], 403);
            }
        } catch (\Throwable $e) {
            Log::warning('[Recaptcha] erro (non-blocking): '.$e->getMessage());
        }

        return $next($request);
    }
}
