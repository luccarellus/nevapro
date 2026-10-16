<?php

namespace App\Providers;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // JWT_SECRET assina os tokens anti-CSRF (double-submit HMAC) e as URLs de
        // storage object (?file=...&s=...). Em produção, um valor ausente ou
        // curto torna essas assinaturas previsíveis — falha silenciosa e crítica.
        // A assinatura de storage já falha fechada (B2StorageService); aqui o
        // registro fica no log do container (LOG_CHANNEL=stderr) até ser corrigido.
        if ($this->app->environment('production') && strlen((string) config('services.jwt_secret')) < 16) {
            Log::critical(
                'JWT_SECRET ausente ou com menos de 16 caracteres: CSRF HMAC e assinatura de storage ficam inseguros. Defina a variável no .env.',
            );
        }
    }
}
