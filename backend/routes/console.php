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
|  - 04:00 UTC: backup do banco no Backblaze B2
*/

Schedule::call(fn () => app(CronService::class)->cleanup())
    ->dailyAt('03:00')->timezone('UTC')->name('cleanup');

Schedule::job(new DatabaseBackupJob)->dailyAt('04:00')->timezone('UTC')->name('backup');

Artisan::command('backup:run', function (): void {
    app(DatabaseBackupJob::class)->handle();
})->purpose('Gera e envia um backup do banco de dados para o Backblaze B2');
