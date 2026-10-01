<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AnswerController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\ClientLogController;
use App\Http\Controllers\CronController;
use App\Http\Controllers\ErrorsBookController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LeaderboardController;
use App\Http\Controllers\LgpdController;
use App\Http\Controllers\MaterialController;
use App\Http\Controllers\MuralController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PerformanceController;
use App\Http\Controllers\QuestionController;
use App\Http\Controllers\StudyPlanController;
use App\Http\Controllers\TenantController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\WebhookController;
use App\Http\Middleware\VerifyCronSecret;
use App\Http\Middleware\VerifyWebhookSecret;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — NevaPro (Laravel 13)
|--------------------------------------------------------------------------
| Paths idênticos à API Express para o frontend React funcionar sem mudanças.
| Middlewares: auth.custom (Sanctum cookie), tenant, role, throttle.custom.
*/

// ===== Health (público, igual ao Express) =====
Route::get('/health', [HealthController::class, 'index']);
Route::get('/health/details', [HealthController::class, 'details'])
    ->middleware(['auth.custom', 'role:admin']);

// ===== Auth (público + rate limit) =====
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])
        ->middleware('throttle.custom:10,300');
    Route::post('register', [AuthController::class, 'register'])
        ->middleware('throttle.custom:5,900');
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle.custom:3,900');
    Route::post('reset-password', [AuthController::class, 'resetPassword'])
        ->middleware('throttle.custom:3,900');
    Route::post('logout', [AuthController::class, 'logout']);
    Route::post('change-password', [AuthController::class, 'changePassword'])
        ->middleware(['throttle.custom:3,900', 'auth.custom']);
});

// ===== Rotas autenticadas (cookie session_token) =====
Route::middleware(['auth.custom', 'tenant'])->group(function () {

    // Perfil
    Route::get('user/profile', [UserController::class, 'profile']);
    Route::post('user/profile', [UserController::class, 'updateProfile'])
        ->middleware(['throttle.custom:10,60', 'recaptcha']);

    // XP / gamificação
    Route::post('user/award-xp', [UserController::class, 'awardXp']);

    // Erros book
    Route::post('user/errors-book', [ErrorsBookController::class, 'store']);
    Route::get('user/errors-book', [ErrorsBookController::class, 'index']);

    // Leaderboard (top 20 por XP, cache 60s)
    Route::get('leaderboard', [LeaderboardController::class, 'index']);

    // Notificações
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::post('notifications/read', [NotificationController::class, 'markRead']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);

    // CRUD: materiais, eventos, mural (leitura p/ todos autenticados; escrita role)
    Route::get('materials', [MaterialController::class, 'index']);
    Route::post('materials', [MaterialController::class, 'store'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);
    Route::put('materials/{id}', [MaterialController::class, 'update'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);
    Route::delete('materials/{id}', [MaterialController::class, 'destroy'])
        ->middleware(['role:admin,tenant_admin,teacher']);

    Route::get('eventos', [EventController::class, 'index']);
    Route::post('eventos', [EventController::class, 'store'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);
    Route::put('eventos/{id}', [EventController::class, 'update'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);
    Route::delete('eventos/{id}', [EventController::class, 'destroy'])
        ->middleware(['role:admin,tenant_admin,teacher']);

    Route::get('recados', [MuralController::class, 'index']);
    Route::post('recados', [MuralController::class, 'store'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);
    Route::put('recados/{id}', [MuralController::class, 'update'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);
    Route::delete('recados/{id}', [MuralController::class, 'destroy'])
        ->middleware(['role:admin,tenant_admin,teacher']);

    // Questões: listagem do tenant + criação (professor/admin)
    Route::get('questoes/tenant', [QuestionController::class, 'tenant']);
    Route::post('questoes', [QuestionController::class, 'store'])
        ->middleware(['throttle.custom:10,60', 'role:admin,tenant_admin,teacher']);

    // Respostas (aluno responde; lote para simulados)
    Route::post('answers', [AnswerController::class, 'store'])
        ->middleware('throttle.custom:30,60');
    Route::post('answers/batch', [AnswerController::class, 'batch'])
        ->middleware('throttle.custom:10,60');

    // Plano de estudos
    Route::get('study-plans', [StudyPlanController::class, 'index']);
    Route::post('study-plans', [StudyPlanController::class, 'store']);
    Route::put('study-plans/{id}', [StudyPlanController::class, 'update']);
    Route::delete('study-plans/{id}', [StudyPlanController::class, 'destroy']);

    // Performance (TRI + estatísticas)
    Route::get('performance', [PerformanceController::class, 'index']);

    // Tenants (troca de instituição)
    Route::get('tenants', [TenantController::class, 'index']);

    // LGPD
    Route::post('lgpd/consent-log', [LgpdController::class, 'consentLog']);

    // Upload de avatar (multipart)
    Route::post('upload', [UploadController::class, 'store'])
        ->middleware('throttle.custom:5,60');

    // Logs do cliente (observabilidade, rate limit próprio)
    Route::post('client-logs', [ClientLogController::class, 'store'])
        ->middleware('throttle.custom:30,60');

    // Admin (RBAC: super_admin / tenant_admin)
    Route::prefix('admin')->middleware('role:admin,tenant_admin')->group(function () {
        Route::get('users', [AdminController::class, 'users']);
        Route::post('users', [AdminController::class, 'createUser']);
        Route::put('users/{id}', [AdminController::class, 'updateUser']);
        Route::delete('users/{id}', [AdminController::class, 'deleteUser']);
        Route::get('stats', [AdminController::class, 'stats']);
        Route::get('activities', [AdminController::class, 'activities']);
    });
});

// ===== Cron (server-to-server, autentica via CRON_SECRET) =====
Route::prefix('cron')->middleware(VerifyCronSecret::class)->group(function () {
    Route::post('cleanup', [CronController::class, 'cleanup']);
    Route::post('backup', [CronController::class, 'backup']);
});

// ===== Webhooks (server-to-server, sem CSRF) =====
Route::prefix('webhooks')->group(function () {
    Route::post('eventease', [WebhookController::class, 'eventease'])
        ->middleware(VerifyWebhookSecret::class);
});
