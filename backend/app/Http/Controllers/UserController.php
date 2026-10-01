<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\StudentUser;
use App\Services\ApiCache;
use App\Services\XpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Perfil — espelha routes/users.ts da API Express:
 * leitura/próprio perfil, atualização com proteção de mass assignment,
 * guard atômico do flash quiz e XP concedido só pelo servidor.
 */
class UserController extends Controller
{
    public function __construct(private readonly ApiCache $cache) {}

    public function profile(Request $request): JsonResponse
    {
        $authUser = $request->attributes->get('auth_user');
        $type = $request->attributes->get('auth_type');
        $email = $request->query('email', $authUser->email);

        // Política: cada usuário acessa APENAS o próprio perfil
        if ($authUser->email !== strtolower($email)) {
            return response()->json(['error' => 'Acesso negado: você só pode acessar o próprio perfil.'], 403);
        }

        $profile = $this->cache->profile($email, function () use ($authUser, $type) {
            if ($type === 'admin') {
                return AdminUser::where('email', $authUser->email)->first()?->toProfileArray();
            }

            return StudentUser::where('email', $authUser->email)->first()?->toProfileArray();
        });

        if (! $profile) {
            return response()->json(['error' => 'Usuário não encontrado'], 404);
        }

        return response()->json($profile);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $authUser = $request->attributes->get('auth_user');
        $type = $request->attributes->get('auth_type');

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'school' => ['sometimes', 'nullable', 'string', 'max:255'],
            'gremio' => ['sometimes', 'nullable', 'string', 'max:255'],
            'showInLeaderboard' => ['sometimes', 'boolean'],
            'languagePreference' => ['sometimes', 'string', 'max:20'],
            'avatarUrl' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);

        // Mass assignment protection: nunca via esta rota
        unset($data['role'], $data['xp'], $data['level'], $data['streak'],
            $data['answeredQuestions'], $data['correctAnswers'], $data['flashQuizCompleted']);

        // Flash quiz: guard atômico + XP fixo concedido pelo SERVIDOR
        if ($request->boolean('isFlashQuizUpdate') && $type === 'student') {
            $locked = StudentUser::whereKey($authUser->id)
                ->where(fn ($q) => $q->whereNull('flash_quiz_completed')->orWhere('flash_quiz_completed', false))
                ->update(['flash_quiz_completed' => true]);

            if ($locked > 0) {
                app(XpService::class)->award(
                    $authUser->id,
                    $request->attributes->get('tenant_id'),
                    50,
                    'Flash Quiz: Maranhão',
                );
            }
        }

        $fieldMap = [
            'showInLeaderboard' => 'show_in_leaderboard',
            'languagePreference' => 'language_preference',
            'avatarUrl' => 'avatar_url',
        ];
        $dbData = collect($data)->mapWithKeys(fn ($v, $k) => [$fieldMap[$k] ?? $k => $v])->all();

        $model = $type === 'admin' ? AdminUser::class : StudentUser::class;
        $model::where('email', $authUser->email)->update($dbData);

        $this->cache->invalidate("profile:{$authUser->email}");

        $fresh = $model::where('email', $authUser->email)->first();

        return response()->json($fresh->toProfileArray());
    }

    public function awardXp(Request $request): JsonResponse
    {
        $authUser = $request->attributes->get('auth_user');
        $type = $request->attributes->get('auth_type');

        if ($type !== 'student') {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $data = $request->validate([
            'amount' => ['required', 'integer', 'min:0', 'max:100'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        app(XpService::class)->award(
            $authUser->id,
            $request->attributes->get('tenant_id'),
            $data['amount'],
            $data['reason'],
        );

        return response()->json(['success' => true]);
    }
}
