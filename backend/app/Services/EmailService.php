<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Serviço de e-mail transacional via Resend.
 * Mantém os mesmos templates/casos de uso da API Express:
 * boas-vindas e redefinição de senha (assíncronos, falha não bloqueia).
 */
class EmailService
{
    public function sendWelcomeAsync(string $to, string $name): void
    {
        if (! config('services.resend.key')) {
            return;
        }

        dispatch(function () use ($to, $name) {
            $this->send($to, 'Bem-vindo(a) ao Neva PRO!', "Olá {$name}, sua conta foi criada com sucesso!");
        })->catch(fn (\Throwable $e) => Log::error('[Email] Boas-vindas falhou: '.$e->getMessage()));
    }

    public function sendPasswordResetAsync(string $to, string $name, string $resetLink): void
    {
        if (! config('services.resend.key')) {
            return;
        }

        dispatch(function () use ($to, $name, $resetLink) {
            $this->send($to, 'Redefinição de senha — Neva PRO',
                "Olá {$name}, use o link para redefinir sua senha: {$resetLink} (válido por 1 hora).");
        })->catch(fn (\Throwable $e) => Log::error('[Email] Reset falhou: '.$e->getMessage()));
    }

    private function send(string $to, string $subject, string $text): void
    {
        Http::withToken(config('services.resend.key'))
            ->timeout(10)
            ->post('https://api.resend.com/emails', [
                'from' => config('services.resend.from'),
                'to' => [$to],
                'subject' => $subject,
                'text' => $text,
            ])->throw();
    }
}
