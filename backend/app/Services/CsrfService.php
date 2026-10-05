<?php

namespace App\Services;

use Illuminate\Http\Request;

/**
 * Token anti-CSRF assinado (double-submit com HMAC), espelho exato do
 * middleware Express: emitido no bootstrap e devolvido pelo cliente no
 * header X-CSRF-Token em requisições mutantes. A assinatura cobre o valor
 * do cookie de sessão, atrelando o token à sessão corrente.
 */
final class CsrfService
{
    /** Emite o token para a sessão corrente (cookie session_token). */
    public static function issue(Request $request): string
    {
        $secret = (string) (env('JWT_SECRET') ?? '');
        $sid = (string) ($request->cookie('session_token') ?? '');

        return hash_hmac('sha256', 'csrf:'.$sid, $secret);
    }

    /**
     * Verifica o token da requisição. Sem cookie de sessão não há
     * CSRF a proteger (requisição anônima/server-to-server).
     */
    public static function verify(Request $request): bool
    {
        if (! $request->cookie('session_token')) {
            return true;
        }

        $token = $request->header('X-CSRF-Token');
        if (! is_string($token) || $token === '') {
            return false;
        }

        $expected = self::issue($request);

        return hash_equals($expected, $token);
    }
}
