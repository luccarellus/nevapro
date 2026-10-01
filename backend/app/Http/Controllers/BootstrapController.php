<?php

namespace App\Http\Controllers;

use App\Services\ApiCache;
use App\Services\B2StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BootstrapController extends Controller
{
    public function __construct(private readonly ApiCache $cache) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $tenantId = $request->attributes->get('tenant_id');
        $cacheKey = 'bootstrap:'.$user->id.':'.($tenantId ?? 'platform');

        $payload = $this->cache->remember($cacheKey, 60, function () use ($user, $tenantId): array {
            $materials = DB::table('materials')
                ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
                ->orderByDesc('created_at')
                ->get(['id', 'title', 'subject', 'foco', 'description', 'url', 'type', 'uploaded_at', 'created_at'])
                ->map(fn ($material) => [
                    'id' => $material->id,
                    'title' => $material->title,
                    'subject' => $material->subject,
                    'foco' => $material->foco,
                    'description' => $material->description,
                    'url' => B2StorageService::resolveStoredUrl($material->url),
                    'type' => $material->type,
                    'uploadedAt' => $material->uploaded_at ?? $material->created_at,
                ])->all();

            $leaderboard = DB::table('users')
                ->where('role', '<>', 'admin')
                ->where('show_in_leaderboard', true)
                ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
                ->orderByDesc('xp')
                ->limit(20)
                ->get(['name', 'city', 'xp', 'level', 'avatar_url'])
                ->map(fn ($student) => [
                    'name' => $student->name,
                    'city' => $student->city,
                    'xp' => $student->xp,
                    'level' => $student->level,
                    'avatarUrl' => B2StorageService::resolveStoredUrl($student->avatar_url),
                ])->all();

            $logs = DB::table('xp_logs')
                ->where('user_id', $user->id)
                ->where('created_at', '>=', now()->subDays(6)->startOfDay())
                ->get(['amount', 'created_at']);
            $days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            $weekly = collect(range(6, 0))->map(function (int $daysAgo) use ($logs, $days): array {
                $date = now()->subDays($daysAgo);
                $dateKey = $date->toDateString();
                $xp = $logs->filter(fn ($log) => substr((string) $log->created_at, 0, 10) === $dateKey)
                    ->sum(fn ($log) => (int) $log->amount);

                return ['day' => $days[$date->dayOfWeek], 'xp' => $xp, 'fullDate' => $dateKey];
            })->all();
            $xpValues = array_column($weekly, 'xp');
            $total = array_sum($xpValues);

            return [
                'materials' => $materials,
                'leaderboard' => $leaderboard,
                'stats' => [
                    'weekly' => $weekly,
                    'summary' => [
                        'average' => (int) round($total / 7),
                        'best' => max($xpValues ?: [0]),
                        'total' => $total,
                    ],
                    'flashQuizCompleted' => (bool) $user->flash_quiz_completed,
                    'quizSecondsRemaining' => 0,
                ],
            ];
        });

        return response()->json($payload);
    }
}
