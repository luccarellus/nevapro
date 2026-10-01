<?php

use App\Models\AdminUser;
use App\Models\StudentUser;

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults — NevaPro
    |--------------------------------------------------------------------------
    | Dois guardas sobre o schema existente:
    |  - students: tabela public.users (alunos)
    |  - admin:    tabela public.admin_users
    | Ambos via token Sanctum no cookie session_token.
    */

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'students'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'students'),
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'students',
        ],

        'students' => [
            'driver' => 'sanctum',
            'provider' => 'students',
        ],

        'admin' => [
            'driver' => 'sanctum',
            'provider' => 'admins',
        ],
    ],

    'providers' => [
        'students' => [
            'driver' => 'eloquent',
            'model' => StudentUser::class,
        ],

        'admins' => [
            'driver' => 'eloquent',
            'model' => AdminUser::class,
        ],
    ],

    'passwords' => [
        'students' => [
            'provider' => 'students',
            'table' => 'password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => 10800,

];
