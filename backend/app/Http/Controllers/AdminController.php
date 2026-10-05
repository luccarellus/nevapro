<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\StudentUser;
use App\Services\ApiCache;
use App\Services\B2StorageService;
use App\Services\TenantAccess;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Admin — espelha routes/admin.ts da API Express.
 * Gerenciamento de usuários + estatísticas (RBAC: admin/tenant_admin).
 */
class AdminController extends Controller
{
    public function __construct(private readonly ApiCache $cache) {}

    public function users(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $users = StudentUser::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->orderBy('created_at')
            ->limit(500)
            ->get();

        return response()->json($users->map(fn ($u) => [
            ...$u->toProfileArray(),
            'tenantId' => $u->tenant_id,
            'school' => $u->school,
            'gremio' => $u->gremio,
            'rank' => $u->rank,
            'updatedAt' => $u->updated_at?->toISOString(),
        ]));
    }

    public function createUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:6'],
            'name' => ['required', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'school' => ['nullable', 'string', 'max:255'],
        ]);

        $email = strtolower(trim($data['email']));
        if (StudentUser::where('email', $email)->exists() || AdminUser::where('email', $email)->exists()) {
            return response()->json(['error' => 'E-mail já cadastrado.'], 400);
        }

        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => $email,
            'name' => $data['name'],
            'password_hash' => Hash::make($data['password']),
            'role' => 'student',
            'tenant_id' => $request->attributes->get('tenant_id'),
            'city' => $data['city'] ?? null,
            'school' => $data['school'] ?? null,
        ]);

        return response()->json(['id' => $user->id], 201);
    }

    public function updateUser(Request $request, string $id): JsonResponse
    {
        $user = StudentUser::query()
            ->when($request->attributes->get('tenant_id'), fn ($query, $tenantId) => $query->where('tenant_id', $tenantId))
            ->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'school' => ['sometimes', 'nullable', 'string', 'max:255'],
            'showInLeaderboard' => ['sometimes', 'boolean'],
            'xp' => ['sometimes', 'integer', 'min:0'],
            'answeredQuestions' => ['sometimes', 'integer', 'min:0'],
            'correctAnswers' => ['sometimes', 'integer', 'min:0'],
        ]);
        $answered = $data['answeredQuestions'] ?? $user->answered_questions;
        $correct = $data['correctAnswers'] ?? $user->correct_answers;
        if ($correct > $answered) {
            return response()->json(['error' => 'Respostas corretas não podem exceder o total respondido.'], 422);
        }

        $fieldMap = [
            'showInLeaderboard' => 'show_in_leaderboard',
            'answeredQuestions' => 'answered_questions',
            'correctAnswers' => 'correct_answers',
        ];
        $user->update(collect($data)->mapWithKeys(fn ($v, $k) => [$fieldMap[$k] ?? $k => $v])->all());
        $this->cache->invalidate(
            "profile:{$user->email}",
            ApiCache::LEADERBOARD,
            ApiCache::ADMIN_ACTIVITIES,
        );

        return response()->json(['success' => true]);
    }

    public function deleteUser(Request $request, string $id): JsonResponse
    {
        $user = StudentUser::query()
            ->when($request->attributes->get('tenant_id'), fn ($query, $tenantId) => $query->where('tenant_id', $tenantId))
            ->findOrFail($id);
        $objectKey = $user->avatar_url ? B2StorageService::extractObjectKey($user->avatar_url) : null;
        // Só remove o objeto se estiver no diretório de avatar deste usuário:
        // URLs legadas/invalidadas não podem deletar objetos arbitrários do bucket.
        if ($objectKey !== null && ! str_starts_with($objectKey, 'avatars/'.$user->id.'/')) {
            $objectKey = null;
        }

        DB::transaction(function () use ($user): void {
            DB::table('user_tenant_roles')->where('user_id', $user->id)->delete();
            PersonalAccessToken::where('tokenable_id', $user->id)
                ->where('tokenable_type', StudentUser::class)
                ->delete();
            $user->delete();
        });

        if ($objectKey) {
            try {
                if (! app(B2StorageService::class)->delete($objectKey)) {
                    Log::warning("[Admin User Delete] Não foi possível remover o avatar de {$user->email} do B2.");
                }
            } catch (\Throwable $exception) {
                Log::warning("[Admin User Delete] Falha ao remover avatar de {$user->email}: ".$exception->getMessage());
            }
        }
        $this->cache->invalidate(
            "profile:{$user->email}",
            ApiCache::LEADERBOARD,
            ApiCache::ADMIN_ACTIVITIES,
        );

        return response()->json(['success' => true]);
    }

    public function stats(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $base = StudentUser::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId));

        return response()->json([
            'total_users' => (clone $base)->count(),
            'total_xp' => (clone $base)->sum('xp'),
            'answered_questions' => (clone $base)->sum('answered_questions'),
            'correct_answers' => (clone $base)->sum('correct_answers'),
        ]);
    }

    public function activities(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $isSuperAdmin = TenantAccess::isSuperAdmin(
            $request->attributes->get('auth_user'),
            (string) $request->attributes->get('auth_type', ''),
        );
        $cacheKey = ApiCache::ADMIN_ACTIVITIES.($tenantId ? ":{$tenantId}" : '');

        $result = $this->cache->remember($cacheKey, 60, function () use ($tenantId, $isSuperAdmin): array {
            $logsQuery = DB::table('xp_logs as x');
            if ($isSuperAdmin && ! $tenantId) {
                $logsQuery->leftJoin('users as u', 'u.id', '=', 'x.user_id');
            } else {
                $logsQuery->join('users as u', 'u.id', '=', 'x.user_id');
            }
            if ($tenantId) {
                $logsQuery->where('u.tenant_id', $tenantId);
            }
            $logs = $logsQuery->orderByDesc('x.created_at')
                ->limit(20)
                ->get(['x.id', 'x.amount', 'x.reason', 'x.created_at', 'u.name as user_name', 'u.city as user_city']);

            $activities = $logs->map(function ($entry): array {
                $minutes = max(0, (int) floor((now()->timestamp - strtotime((string) $entry->created_at)) / 60));
                $time = $minutes === 0 ? 'Agora' : ($minutes < 60
                    ? "Há {$minutes} min"
                    : ($minutes < 1440 ? 'Há '.(int) floor($minutes / 60).'h' : 'Há '.(int) floor($minutes / 1440).' dias'));

                return [
                    'id' => $entry->id,
                    'user' => $entry->user_name ?: 'Estudante',
                    'action' => "Ganhou {$entry->amount} XP: ".($entry->reason ?: 'Atividade'),
                    'time' => $time,
                    'city' => $entry->user_city ?: 'Brasil',
                ];
            })->all();

            $since = now()->subDays(7);
            $materials = DB::table('materials')
                ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
                ->where('uploaded_at', '>=', $since->toDateString())
                ->get(['uploaded_at']);
            $notices = DB::table('mural')
                ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
                ->where('created_at', '>=', $since)
                ->get(['created_at']);

            $days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
            $production = [];
            foreach (range(6, 0) as $daysAgo) {
                $date = now()->subDays($daysAgo);
                $production[$days[$date->dayOfWeek]] = 0;
            }
            foreach ($materials as $material) {
                $day = $days[Carbon::parse($material->uploaded_at)->dayOfWeek];
                $production[$day]++;
            }
            foreach ($notices as $notice) {
                $day = $days[Carbon::parse($notice->created_at)->dayOfWeek];
                $production[$day]++;
            }

            return [
                'activities' => $activities,
                'production' => collect($production)->map(fn ($value, $day) => ['day' => $day, 'value' => $value])->values()->all(),
            ];
        });

        return response()->json($result);
    }
}
