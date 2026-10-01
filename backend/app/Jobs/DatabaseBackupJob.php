<?php

namespace App\Jobs;

use App\Services\B2StorageService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

/**
 * Backup do PostgreSQL enviado ao Backblaze B2.
 * Usa pg_dump no container; o dump customizado é enviado ao B2.
 * Agendado diariamente via routes/console.php (schedule).
 */
class DatabaseBackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        $connection = DB::connection()->getConfig();
        $database = $connection['database'];
        $host = $connection['host'];
        $port = $connection['port'];
        $user = $connection['username'];
        $password = $connection['password'];

        $file = storage_path('app/backups/nevapro_'.now()->format('Y-m-d_His').'.dump');
        $directory = dirname($file);
        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            throw new \RuntimeException('Não foi possível criar o diretório temporário de backup.');
        }

        $process = Process::env([
            'PGPASSWORD' => $password,
            'PGSSLMODE' => $connection['sslmode'] ?? 'prefer',
        ])->run([
            'pg_dump',
            '-h', (string) $host,
            '-p', (string) $port,
            '-U', (string) $user,
            '-d', (string) $database,
            '-F', 'c',
            '-f', $file,
        ]);

        if (! $process->successful()) {
            throw new \RuntimeException('[Backup] pg_dump falhou: '.$process->errorOutput());
        }

        try {
            if (! app(B2StorageService::class)->putFile('backups/db/'.basename($file), $file)) {
                throw new \RuntimeException('Não foi possível enviar o backup para o Backblaze B2.');
            }
        } finally {
            if (is_file($file) && ! unlink($file)) {
                Log::warning('[Backup] Não foi possível remover o arquivo temporário: '.$file);
            }
        }

        Log::info('[Backup] Banco enviado ao B2: '.basename($file));
    }
}
