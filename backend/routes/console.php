<?php

use App\Jobs\DatabaseBackupJob;
use App\Services\CronService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Console Routes & Schedule — NevaPro
|--------------------------------------------------------------------------
| Agendamentos equivalentes ao container cron da stack Express:
|  - 03:00 UTC: limpeza de logs/tokens expirados
|  - 04:00 UTC: backup do banco (pulado automaticamente enquanto o
|    storage remoto S3 não estiver configurado no .env)
*/

Schedule::call(fn () => app(CronService::class)->cleanup())
    ->dailyAt('03:00')->timezone('UTC')->name('cleanup');

Schedule::job(new DatabaseBackupJob)->dailyAt('04:00')->timezone('UTC')->name('backup');

Artisan::command('backup:run', function (): void {
    app(DatabaseBackupJob::class)->handle();
})->purpose('Gera um backup do banco de dados e o envia ao storage remoto (quando configurado)');
