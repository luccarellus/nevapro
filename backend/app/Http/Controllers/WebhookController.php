<?php

namespace App\Http\Controllers;

use App\Models\PasswordResetToken;
use App\Models\StudentUser;
use App\Models\Tenant;
use App\Services\AuthService;
use App\Services\EmailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Webhooks — espelha routes/webhooks.ts da API Express (EventEase).
 * Cadastra alunos automaticamente quando se registram no EventEase.
 */
class WebhookController extends Controller
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly EmailService $email,
    ) {}

    public function eventease(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'school' => ['nullable', 'string', 'max:255'],
            'gremio' => ['nullable', 'string', 'max:255'],
        ]);

        $email = $this->auth->normalizeEmail($data['email']);
        $name = trim(strip_tags((string) ($data['name'] ?? '')));
        if ($name === '') {
            $name = explode('@', $email)[0];
        }

        // Idempotência: e-mail já cadastrado não recria conta
        $existing = StudentUser::where('email', $email)->first();
        if ($existing) {
            return response()->json([
                'success' => true,
                'message' => 'Usuário já cadastrado no NevaPro.',
                'userId' => $existing->id,
            ]);
        }

        // Senha temporária de alta entropia (~143 bits). NUNCA um valor
        // padrão fixo — senha conhecida permitiria account takeover em massa.
        $tempPassword = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');

        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => $email,
            'name' => $name,
            'password_hash' => Hash::make($tempPassword),
            'role' => 'student',
            'tenant_id' => Tenant::PLATFORM_ID,
            'city' => $data['city'] ?? null,
            'school' => $data['school'] ?? null,
            'gremio' => $data['gremio'] ?? null,
            'xp' => 0,
            'level' => 1,
        ]);

        // Vínculo RBAC: papel student no tenant da plataforma
        DB::statement(
            'INSERT INTO user_tenant_roles (user_id, tenant_id, role_id)
             SELECT ?, ?, id FROM roles WHERE code = ? AND tenant_id IS NULL
             ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING',
            [$user->id, Tenant::PLATFORM_ID, 'student'],
        );

        // Token de definição de senha (1h). Só o hash SHA-256 é persistido;
        // o token em texto claro existe apenas no link do e-mail.
        $resetToken = str_replace('-', '', (string) Str::uuid());
        PasswordResetToken::create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'token' => hash('sha256', $resetToken),
            'expires_at' => now()->addHour(),
        ]);

        $frontendUrl = rtrim(config('app.frontend_url') ?: config('app.url'), '/');
        $resetLink = "{$frontendUrl}/reset-password?token={$resetToken}&email=".urlencode($email);

        // E-mails assíncronos: a resposta ao webhook não depende da entrega
        $this->email->sendPasswordResetAsync($email, $name, $resetLink);
        $this->email->sendWelcomeAsync($email, $name);

        Log::info("[Webhook EventEase] Aluno cadastrado: {$email}");

        return response()->json([
            'success' => true,
            'message' => 'Usuário criado com sucesso no NevaPro. O aluno receberá um e-mail para definir a própria senha.',
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
            ],
        ], 201);
    }
}
