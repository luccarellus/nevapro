<?php

namespace App\Http\Controllers;

use App\Jobs\DatabaseBackupJob;
use App\Services\CronService;
use Illuminate\Http\JsonResponse;

/**
 * Cron — espelha routes/cron.ts da API Express.
 * Cleanup diário de logs/tokens expirados e backup.
 */
class CronController extends Controller
{
    public function cleanup(CronService $cron): JsonResponse
    {
        return response()->json(['success' => true, 'result' => $cron->cleanup()]);
    }

    public function backup(): JsonResponse
    {
        // O backup usa o script dedicado (php artisan backup:run no host
        // ou Job na queue). Aqui apenas dispara o job assíncrono.
        DatabaseBackupJob::dispatch();

        return response()->json(['success' => true, 'message' => 'Backup agendado.']);
    }
}
