<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autenticação do webhook EventEase via header X-Webhook-Secret.
 */
class VerifyWebhookSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.eventease.secret');
        $provided = (string) ($request->header('X-Webhook-Secret') ?? '');

        // Comparação em tempo constante com length equalizado via hash:
        // não vaza o tamanho do segredo nem diferenças de prefixo (timing attack).
        $valid = $expected !== '' && hash_equals(
            hash('sha256', $expected),
            hash('sha256', $provided),
        );

        if (! $valid) {
            Log::warning('[Webhook EventEase] Tentativa de acesso sem chave secreta válida.');

            return response()->json(['error' => 'Chave de integração inválida ou não configurada.'], 401);
        }

        return $next($request);
    }
}
