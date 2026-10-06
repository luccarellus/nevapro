<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Redis;

/**
 * Redis diagnostic endpoint — espelha o comportamento do frontend que
 * precisa de status, latência e mensagem de erro para exibir ao usuário.
 *
 * Sets a dummy key, reads it back and reports:
 *   - status: "ok" | "error"
 *   - latencyMs: tempo do ciclo set→get→delete
 *   - message: mensagem legível (vazia quando tudo funciona)
 */
class RedisDiagnosticController extends Controller
{
    private const DUMMY_KEY = 'diagnostic:test-ping';
    private const DUMMY_VALUE = 'ok';

    public function diagnose(): JsonResponse
    {
        $start = microtime(true);
        $error = null;

        try {
            Redis::set(self::DUMMY_KEY, self::DUMMY_VALUE);
            $value = Redis::get(self::DUMMY_KEY);
            Redis::del(self::DUMMY_KEY);

            if ($value !== self::DUMMY_VALUE) {
                $error = 'Redis respondeu, mas o valor lido não confere com o valor escrito.';
            }
        } catch (\Throwable $e) {
            $error = $e->getMessage();
        }

        $latencyMs = round((microtime(true) - $start) * 1000, 2);

        $status = $error === null ? 'ok' : 'error';

        return response()->json([
            'status' => $status,
            'latencyMs' => $latencyMs,
            'message' => $error ?? null,
        ], $status === 'ok' ? 200 : 500);
    }
}
