<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Health — espelha routes/health.ts da API Express.
 * Público expõe o mínimo (status/timestamp); detalhes exigem admin.
 */
class HealthController extends Controller
{
    public function index(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
            $healthy = true;
        } catch (\Throwable $e) {
            report($e);
            $healthy = false;
        }

        return response()->json([
            'status' => $healthy ? 'ok' : 'degraded',
            'timestamp' => now()->toIso8601String(),
        ], $healthy ? 200 : 503);
    }

    public function details(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
            $db = 'connected';
        } catch (\Throwable) {
            $db = 'unavailable';
        }

        try {
            Redis::ping();
            $redis = 'connected';
        } catch (\Throwable) {
            $redis = 'not-configured';
        }

        $healthy = $db === 'connected';

        return response()->json([
            'status' => $healthy ? 'ok' : 'degraded',
            'timestamp' => now()->toIso8601String(),
            'uptimeSeconds' => round(microtime(true) - LARAVEL_START),
            'memory' => [
                'rssMb' => round(memory_get_usage(true) / 1024 / 1024, 2),
            ],
            'dependencies' => [
                'database' => $db,
                'redis' => $redis,
            ],
        ], $healthy ? 200 : 503);
    }
}
