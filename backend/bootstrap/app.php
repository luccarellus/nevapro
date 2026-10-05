<?php

use App\Http\Middleware\Authenticate;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\RateLimitByKey;
use App\Http\Middleware\ResolveTenant;
use App\Http\Middleware\VerifyCsrfToken;
use App\Http\Middleware\VerifyRecaptcha;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Aliases de middleware — espelham os do Express
        $middleware->alias([
            'auth.custom' => Authenticate::class,
            'role' => EnsureRole::class,
            'tenant' => ResolveTenant::class,
            'throttle.custom' => RateLimitByKey::class,
            'recaptcha' => VerifyRecaptcha::class,
            'csrf' => VerifyCsrfToken::class,
        ]);

        // Todas as rotas de /api/* retornam JSON.
        // CSRF (double-submit HMAC) roda antes de tudo: só bloqueia
        // requisições mutantes com cookie de sessão — login, register,
        // cron e webhooks são anônimos (sem cookie) e passam direto.
        $middleware->api(prepend: [
            HandleCors::class,
            VerifyCsrfToken::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Formato de erro idêntico ao Express: { "error": "mensagem" }
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $status = match (true) {
                $e instanceof AuthenticationException => 401,
                $e instanceof ValidationException => 422,
                $e instanceof HttpExceptionInterface => $e->getStatusCode(),
                default => 500,
            };

            if ($e instanceof ValidationException) {
                $first = collect($e->errors())->flatten()->first();

                return response()->json(['error' => $first ?? 'Dados inválidos.'], 422);
            }

            $message = $status >= 500
                ? 'Erro interno do servidor.'
                : ($e->getMessage() ?: 'Erro ao processar requisição.');

            if ($status >= 500) {
                Log::error('[Unhandled Error] '.$e->getMessage(), [
                    'exception' => get_class($e),
                ]);
            }

            return response()->json(['error' => $message], $status);
        });
    })->create();
