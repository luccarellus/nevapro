<?php

namespace App\Services;

use App\Models\AdminUser;
use App\Models\StudentUser;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Autenticação unificada (admin + aluno) contra o schema existente.
 * Mantém a semântica da API Express: busca nas duas tabelas e compara
 * password_hash (bcrypt), retornando o perfil no formato do frontend.
 */
class AuthService
{
    /**
     * Tenta autenticar por e-mail. Retorna ['user' => Authenticatable, 'type' => string]
     * ou ['error' => string].
     */
    public function attempt(string $email, string $password): array
    {
        $email = $this->normalizeEmail($email);

        $admin = AdminUser::where('email', $email)->first();
        if ($admin) {
            if (! $admin->active) {
                return ['error' => 'Conta administrativa desativada.'];
            }
            if (Hash::check($password, $admin->password_hash)) {
                return ['user' => $admin, 'type' => 'admin'];
            }

            return ['error' => 'E-mail ou senha incorretos.'];
        }

        $student = StudentUser::where('email', $email)->first();
        if ($student && Hash::check($password, $student->password_hash)) {
            return ['user' => $student, 'type' => 'student'];
        }

        return ['error' => 'E-mail ou senha incorretos.'];
    }

    /**
     * Emite um token Sanctum que embute o "tipo" de usuário no name,
     * permitindo que o middleware resolva o usuário certo por tabela.
     */
    public function issueToken($user, string $type): string
    {
        return $user->createToken("auth:{$type}", ['*'], now()->addDay())->plainTextToken;
    }

    /** Resolve o usuário a partir de um personal access token Sanctum. */
    public function resolveFromToken(string $token): ?array
    {
        $parts = explode(':', $token);
        if (count($parts) !== 2) {
            return null;
        }
        [$tokenId, $tokenHash] = $parts;

        $accessToken = PersonalAccessToken::findToken($token);
        if (! $accessToken || $accessToken->expires_at?->isPast()) {
            return null;
        }

        $type = str_starts_with($accessToken->name, 'auth:admin') ? 'admin' : 'student';

        $user = $type === 'admin'
            ? AdminUser::find($accessToken->tokenable_id)
            : StudentUser::find($accessToken->tokenable_id);

        if (! $user) {
            return null;
        }

        // Revogação por versão (senha trocada → todas as sessões anteriores caem)
        $tokenVersion = (int) ($user->token_version ?? 0);
        $tokenTv = (int) ($accessToken->name_data['tv'] ?? 0);
        if ($tokenVersion > $tokenTv) {
            return null;
        }

        return ['user' => $user, 'type' => $type, 'accessToken' => $accessToken];
    }

    public function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }
}
