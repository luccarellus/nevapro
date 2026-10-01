<?php

return [

    /*
    |--------------------------------------------------------------------------
    | CORS — NevaPro
    |--------------------------------------------------------------------------
    | O frontend React consome a API por cookie de sessão (same-origin na VPS
    | atrás do Nginx). Em dev, o Vite faz proxy para o Laravel — sem CORS.
    | FRONTEND_URL suporta lista separada por vírgula, como na API Express.
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(array_map(
        fn ($url) => trim($url),
        explode(',', env('FRONTEND_URL', 'http://localhost:3000')),
    )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'X-Tenant-ID', 'Accept'],

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => true,

];
