<?php

namespace App\Jobs;

use App\Services\B2StorageService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

/**
 * Backup do PostgreSQL enviado ao Backblaze B2.
 * Usa pg_dump no host; o .sql.gz é enviado ao bucket B2.
 * Agendado diariamente via routes/console.php (schedule).
 */
class DatabaseBackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        $database = config('database.connections.pgsql.database');
        $host = config('database.connections.pgsql.host');
        $port = config('database.connections.pgsql.port');
        $user = config('database.connections.pgsql.username');
        $password = config('database.connections.pgsql.password');

        $file = storage_path('app/backups/nevapro_'.now()->format('Y-m-d_His').'.sql.gz');
        @mkdir(dirname($file), 0755, true);

        $env = http_build_query([
            'PGPASSWORD' => $password,
        ]);

        $process = Process::run("PGPASSWORD='{$password}' pg_dump -h {$host} -p {$port} -U {$user} -d {$database} -F c -f {$file}");

        if (! $process->successful()) {
            Log::error('[Backup] pg_dump falhou: '.$process->errorOutput());

            return;
        }

        // Comprime e envia ao B2
        $gzFile = $file.'.gz';
        exec("gzip -c {$file} > {$gzFile}");
        unlink($file);

        B2StorageService::put('backups/db/'.basename($gzFile), file_get_contents($gzFile));
        unlink($gzFile);

        Log::info('[Backup] Banco enviado ao B2: '.basename($gzFile));
    }
}
