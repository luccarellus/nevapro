<?php

namespace App\Http\Controllers;

use App\Models\AdminUser;
use App\Models\StudentUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Admin — espelha routes/admin.ts da API Express.
 * Gerenciamento de usuários + estatísticas (RBAC: admin/tenant_admin).
 */
class AdminController extends Controller
{
    public function users(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');

        $users = StudentUser::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->orderBy('created_at')
            ->limit(500)
            ->get();

        return response()->json($users->map(fn ($u) => [
            'id' => $u->id,
            'email' => $u->email,
            'name' => $u->name,
            'role' => $u->role,
            'tenantId' => $u->tenant_id,
            'city' => $u->city,
            'school' => $u->school,
            'xp' => $u->xp,
            'level' => $u->level,
            'createdAt' => $u->created_at?->toISOString(),
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
        $user = StudentUser::findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'school' => ['sometimes', 'nullable', 'string', 'max:255'],
            'showInLeaderboard' => ['sometimes', 'boolean'],
            'xp' => ['sometimes', 'integer', 'min:0'],
        ]);

        $fieldMap = ['showInLeaderboard' => 'show_in_leaderboard'];
        $user->update(collect($data)->mapWithKeys(fn ($v, $k) => [$fieldMap[$k] ?? $k => $v])->all());

        return response()->json(['success' => true]);
    }

    public function deleteUser(string $id): JsonResponse
    {
        StudentUser::findOrFail($id)->delete();

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

    public function activities(): JsonResponse
    {
        // Placeholder — atividades de admin seriam alimentadas por logs
        return response()->json([]);
    }
}
