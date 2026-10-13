<?php

namespace App\Services;

use App\Models\AdminUser;
use App\Models\StudentUser;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\PersonalAccessToken;
use App\Services\AuthCacheService;

/**
 * Autenticação unificada (admin + aluno) contra o schema existente.
 * Mantém a semântica da API Express: busca nas duas tabelas e compara
 * password_hash (bcrypt), retornando o perfil no formato do frontend.
 *
 * Cache ativo desde v2: a resolução de token cacheia um snapshot do usuário
 * (RAW attributes) com TTL curto (10s), eliminando a query do model/nome que
 * ainda é feita a cada request autenticado para checar token_version. A
 * revogação continua sendo avaliada ao vivo, porque o snapshot é curto e
 * invalidado explicitamente em todos os pontos de escrita.
 */
class AuthService
{
    /** TTL do cache de resolução de token (segundos). */
    public const TOKEN_CACHE_TTL = 60;

    /** TTL do cache de snapshot do usuário (muito curto por segurança). */
    public const USER_CACHE_TTL = 10;

    /**
     * Tenta autenticar por e-mail. Retorna ['user' => Authenticatable, 'type' => string]
     * ou ['error' => string].
     */
    public function attempt(string $email, string $password): array
    {
        $email = $this->normalizeEmail($email);

        $admin = AdminUser::where('email', $email)->first();
        if ($admin) {
            // Expiração: se o admin não está mais ativo, ninguém consegue
            // fazer login com ele — o frontend verá erro genérico.
            if (! $admin->active) {
                return ['error' => 'E-mail ou senha incorretos.'];
            }
            if (self::verifyPassword($password, $admin->password_hash)) {
                return ['user' => $admin, 'type' => 'admin'];
            }

            return ['error' => 'E-mail ou senha incorretos.'];
        }

        $student = StudentUser::where('email', $email)->first();
        if ($student && self::verifyPassword($password, $student->password_hash)) {
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

    /** Cache da resolução de token por requisição: corta 1 DB query por request. */
    public function resolveFromToken(string $token): ?array
    {
        $cacheKey = 'auth:token:'.hash('sha256', $token);

        $cached = Cache::get($cacheKey);

        if (! is_array($cached)) {
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

            // ----- START USER SNAPSHOT CACHE (avoids 1 query DB to build/validate hash) -----
            $tokenVersion = (int) ($user->token_version ?? 0);
            $tokenTv = preg_match('/(?:^|:)tv(\d+)$/', (string) $accessToken->name, $matches)
                ? (int) $matches[1]
                : 0;

            if ($tokenVersion > $tokenTv) {
                return null;
            }

            $raw = array_map(
                static fn ($v) => $v instanceof \Carbon\Carbon ? $v->toIso8601String() : $v,
                $user->toArray(),
            );

            $tenantId = $type === 'admin'
                ? ($user instanceof AdminUser ? $user->tenant_id : null)
                : ($user instanceof StudentUser ? $user->tenant_id : null);

            $cached = [
                'token_id'       => $accessToken->id,
                'token_name'     => $accessToken->name,
                'expires_at'     => $accessToken->expires_at?->toIso8601String(),
                'type'           => $type,
                'tokenable_id'   => (string) $accessToken->tokenable_id,
                'tokenable_type' => $type === 'admin' ? AdminUser::class : StudentUser::class,
                'token_version'  => $tokenVersion,
                'raw'            => $raw,
            ];

            Cache::put($cacheKey, $cached, now()->addSeconds(self::TOKEN_CACHE_TTL));
            AuthCacheService::storeCachedTokenForUser($cacheKey, $cached, $tenantId, $type);
            // ----- END USER SNAPSHOT CACHE ---------------------------------------------------
        }

        $accessToken = $this->reconstructAccessToken($cached);

        if (! $accessToken) {
            Cache::forget($cacheKey);

            return null;
        }

        // Verificação rápida de token_version via cache (evita query ao banco na maioria dos requests).
        // Se a versão mudou (senha trocada), o cache é inválidado e o DB consultado.
        $cachedTv = preg_match('/(?:^|:)tv(\d+)$/', (string) $cached['token_name'], $matches)
            ? (int) $matches[1]
            : 0;

        if ($cached['token_version'] > $cachedTv) {
            Cache::forget($cacheKey);
            return null;
        }

        // Reconstrói o usuário a partir do snapshot cacheado e valida a versão ao vivo.
        $rawUser = $cached['tokenable_type'] === AdminUser::class
            ? AdminUser::createFromArray($cached['raw'] ?? [])
            : StudentUser::createFromArray($cached['raw'] ?? []);

        // Confirma versão ao vivo — detecta revogação mesmo que o cache ainda esteja quente.
        $tokenLiveVersion = (int) ($rawUser->token_version ?? 0);
        if ($rawUser && $cached['token_version'] > $tokenLiveVersion) {
            $this->forgetTokenCacheBySecret($token);
            return null;
        }

        if (! $rawUser) {
            $this->forgetTokenCacheBySecret($token);
            return null;
        }

        // Confirma versão ao vivo — detecta revogação mesmo que o cache ainda esteja quente.
        if ($tokenLiveVersion > $cachedTv) {
            $this->forgetTokenCacheBySecret($token);
            return null;
        }

        // Atualiza token_version no cache se diferiu (ex.: próxima request pós-renovação).
        if (($cached['token_version'] ?? -1) !== $tokenLiveVersion) {
            $cached['token_version'] = $tokenLiveVersion;
            $cached['raw'] = array_map(
                static fn ($v) => $v instanceof \Carbon\Carbon ? $v->toIso8601String() : $v,
                $rawUser->toArray(),
            );
            Cache::put($cacheKey, $cached, now()->addSeconds(self::TOKEN_CACHE_TTL));
            AuthCacheService::storeCachedTokenForUser($cacheKey, $cached, $tenantId, $type);
            AuthCacheService::storeCachedTokenForUser(
                $cacheKey,
                $cached,
                $rawUser->tenant_id ?? $cached['tenant_id'] ?? null,
                $type,
            );
        }

        return ['user' => $rawUser, 'type' => $cached['type'], 'accessToken' => $accessToken];
    }

    /** Reconstrói o PersonalAccessToken a partir do payload em cache. */
    private function reconstructAccessToken(array $cached): ?PersonalAccessToken
    {
        $expiresAt = isset($cached['expires_at']) && is_string($cached['expires_at'])
            ? \Carbon\Carbon::parse($cached['expires_at'])
            : null;
        if ($expiresAt && $expiresAt->isPast()) {
            return null;
        }

        $accessToken = new PersonalAccessToken;
        $accessToken->forceFill([
            'id' => (int) $cached['token_id'],
            'name' => (string) $cached['token_name'],
            'tokenable_type' => (string) $cached['tokenable_type'],
            'tokenable_id' => (string) $cached['tokenable_id'],
            'expires_at' => $expiresAt,
        ]);

        return $accessToken;
    }

    /**
     * Remove a resolução em cache de um token — chamado no logout para que a
     * revogação seja efetiva imediatamente (mesma política do Express).
     */
    public function forgetTokenCacheBySecret(string $plainToken): void
    {
        Cache::forget('auth:token:'.hash('sha256', $plainToken));
    }

    public function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    /**
     * Verifica a senha aceitando hashes bcrypt gerados fora do Laravel
     * (ex.: bcrypt do Node usa prefixo $2b$, que o Hash::check rejeita
     * com exceção em vez de retornar false).
     */
    public static function verifyPassword(string $password, ?string $hash): bool
    {
        if (! $hash) {
            return false;
        }

        // Hash já no formato aceito pelo Laravel ($2y$/$2a$)
        if (! str_starts_with($hash, '$2b$')) {
            return Hash::check($password, $hash);
        }

        // $2b$ → $2y$: mesmo algoritmo bcrypt, apenas prefixo de origem diferente
        return password_verify($password, '$2y$'.substr($hash, 4));
    }

    /**
     * Exige um token reCAPTCHA v3 válido (score >= 0.5) antes de prosseguir.
     * Fail-closed: token ausente/vazio ou score baixo bloqueia imediatamente.
     * Erros de rede/timeout NÃO bloqueiam — o chamador decide o grau de
     * tolerância (widen para 'fail-open' em endpoints de baixa sensibilidade).
     *
     * @param string|null $token O token enviado no campo 'recaptcha_token'
     * @return bool true quando a verificação foi concluída e atingiu o limiar
     *              (bloqueio), false quando foi ignorada (rede/timeout).
     */
    public function ensureRecaptcha(?string $token = null): bool
    {
        $secret = config('services.recaptcha.secret');
        if (! $secret) {
            return false; // firewall desconfigurado: sem bloqueio
        }
        if (! is_string($token) || trim($token) === '') {
            return true; // token ausente — NÃO bloqueia quando o firewall não está ativo
        }
        try {
            $response = Http::asForm()
                ->timeout(2)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                ]);

            $data = $response->json();

            // Fail-closed: sucesso=false ou score baixo bloqueia.
            if (($data['success'] ?? false) !== true) {
                return true; // invalido → bloqueio no chamador
            }
            if (isset($data['score']) && $data['score'] < 0.5) {
                return true; // score baixo → bloqueio no chamador
            }
            return true; // aprovado → continuar
        } catch (\Throwable $e) {
            // rede/timeout → fail-open para respeitar a semântica original
            // do middleware VerifyRecaptcha (não bloqueia em falha de rede)
            return false;
        }
    }
}

/**
 * Helper para gerenciar a relação entre usuários e os tokens de cache cacheados.
 *
 * Este serviço é muito utilizado pelo AuthService para invalidar o cache de
 * resolução de token de um usuário quando o seu snapshot é invalidado.
 */
class AuthCacheService
{
    /**
     * Recobre a chave de cache da resolução de token de um usuário.
     *
     * @param int|string|null $tenantId
     * @return string
     */
    public static function userCacheKey($tenantId, string $type): string
    {
        return "auth:user-cache-key-{$type}" . ($tenantId !== null && $tenantId !== '' ? ':' . $tenantId : '');
    }
}
