<?php

namespace App\Http\Controllers;

use App\Models\StudentUser;
use App\Services\ApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Leaderboard — espelha routes/leaderboard.ts da API Express:
 * top 20 alunos por XP com scoping por tenant e cache.
 */
class LeaderboardController extends Controller
{
    public function __construct(private readonly ApiCache $cache) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $key = $tenantId ? ApiCache::LEADERBOARD.":{$tenantId}" : ApiCache::LEADERBOARD;

        $data = $this->cache->remember($key, 60, function () use ($tenantId) {
            return StudentUser::query()
                ->where('show_in_leaderboard', true)
                ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->orderByDesc('xp')
                ->limit(20)
                ->get(['id', 'name', 'city', 'xp', 'level', 'avatar_url'])
                ->map(fn ($u) => [
                    'name' => $u->name,
                    'city' => $u->city,
                    'xp' => $u->xp ?? 0,
                    'level' => $u->level ?? 1,
                    'avatarUrl' => $u->avatar_url,
                ])->values()->all();
        });

        return response()->json($data);
    }
}
