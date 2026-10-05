<?php

return [

    // ===== Segredo compartilhado (CSRF HMAC, assinatura de storage object) =====
    // Acessado via config() para ser compatível com `artisan config:cache`.
    'jwt_secret' => env('JWT_SECRET'),

    // ===== reCAPTCHA v3 (server-side) =====
    'recaptcha' => [
        'secret' => env('RECAPTCHA_SECRET_KEY'),
    ],

    // ===== Resend (e-mail transacional) =====
    'resend' => [
        'key' => env('RESEND_API_KEY'),
        'from' => env('RESEND_FROM_EMAIL', 'naoresponda@seudominio.com'),
        'name' => env('RESEND_SENDER_NAME', 'Neva PRO'),
    ],

    // ===== Cron (rotas /api/cron) =====
    'cron' => [
        'secret' => env('CRON_SECRET'),
    ],

    // ===== Webhook EventEase =====
    'eventease' => [
        'secret' => env('EVENTEASE_WEBHOOK_SECRET'),
    ],

    // ===== EnemHub (2ª fonte de questões ENEM) =====
    'enemhub' => [
        'key' => env('ENEMHUB_API_KEY'),
    ],

    'allowed_image_hosts' => array_filter(array_map('trim', explode(',', (string) env('ALLOWED_IMAGE_HOSTS', '')))),

];
