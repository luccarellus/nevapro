<?php

namespace App\Http\Controllers;

use App\Http\Middleware\ResolveTenant;
use App\Models\Tenant;
use App\Services\B2StorageService;
use App\Services\TenantAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Tenants — lista instituições disponíveis (troca de contexto no frontend).
 */
class TenantController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        if (! $user) {
            return response()->json(['error' => 'Não autenticado.'], 401);
        }

        return response()->json(
            TenantAccess::accessibleTenants($user, (string) $request->attributes->get('auth_type', ''))
                ->orderBy('name')
                ->get(['id', 'name', 'slug', 'domain', 'plan', 'active', 'created_at'])
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'slug' => $t->slug,
                    'domain' => $t->domain,
                    'plan' => $t->plan,
                    'active' => $t->active,
                    'created_at' => $t->created_at,
                ]),
        );
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isSuperAdmin($request)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:120'],
            'domain' => ['nullable', 'string', 'max:255'],
            'plan' => ['nullable', 'string', 'max:50'],
        ]);
        $data['slug'] = Str::slug($data['slug']);

        $tenant = Tenant::create([
            'id' => (string) Str::uuid(),
            ...$data,
            'active' => true,
        ]);

        return response()->json($tenant, 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        if (! $this->canAccess($request, $id)) {
            return response()->json(['error' => 'Acesso negado: você não pertence a este tenant.'], 403);
        }

        return response()->json(Tenant::findOrFail($id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        if (! $this->isSuperAdmin($request) || ! $this->canAccess($request, $id)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:120'],
            'domain' => ['sometimes', 'nullable', 'string', 'max:255'],
            'plan' => ['sometimes', 'string', 'max:50'],
            'active' => ['sometimes', 'boolean'],
        ]);
        if (isset($data['slug'])) {
            $data['slug'] = Str::slug($data['slug']);
        }

        $tenant = Tenant::findOrFail($id);
        $tenant->update($data);
        ResolveTenant::forgetActiveCache($id);

        return response()->json($tenant->fresh());
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        if (! $this->isSuperAdmin($request) || ! $this->canAccess($request, $id)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }
        if ($id === Tenant::PLATFORM_ID) {
            return response()->json(['error' => 'O tenant da plataforma não pode ser desativado.'], 400);
        }

        $tenant = Tenant::findOrFail($id);
        $tenant->update(['active' => false]);
        ResolveTenant::forgetActiveCache($id);

        return response()->json(['success' => true, 'data' => $tenant->fresh()]);
    }

    public function roles(Request $request, string $id): JsonResponse
    {
        if (! $this->canAccess($request, $id)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $roles = DB::table('roles')
            ->where(fn ($query) => $query->whereNull('tenant_id')->orWhere('tenant_id', $id))
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'description', 'tenant_id']);

        return response()->json($roles);
    }

    public function members(Request $request, string $id): JsonResponse
    {
        if (! $this->canAccess($request, $id) || ! $this->isTenantAdmin($request, $id)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $members = DB::table('user_tenant_roles as utr')
            ->join('roles as r', 'r.id', '=', 'utr.role_id')
            ->leftJoin('users as u', 'u.id', '=', 'utr.user_id')
            ->leftJoin('admin_users as au', 'au.id', '=', 'utr.user_id')
            ->where('utr.tenant_id', $id)
            ->orderByDesc('utr.created_at')
            ->get([
                'utr.user_id',
                'utr.created_at as assigned_at',
                'r.id as role_id',
                'r.code as role_code',
                'r.name as role_name',
                DB::raw("COALESCE(u.name, au.name, 'Usuário') as user_name"),
                DB::raw('COALESCE(u.email, au.email) as user_email'),
                DB::raw('COALESCE(u.avatar_url, au.avatar_url) as avatar_url'),
                DB::raw('COALESCE(u.xp, au.xp, 0) as xp'),
                DB::raw('COALESCE(u.level, au.level, 1) as level'),
                DB::raw("CASE WHEN au.id IS NOT NULL THEN 'admin' ELSE 'student' END as source_table"),
            ])
            ->map(fn ($member) => [
                ...((array) $member),
                'avatar_url' => B2StorageService::resolveStoredUrl($member->avatar_url),
                'link_id' => $member->user_id.':'.$member->role_id,
            ]);

        return response()->json($members);
    }

    public function assignMember(Request $request, string $id): JsonResponse
    {
        if (! $this->isSuperAdmin($request) || ! $this->canAccess($request, $id)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $data = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', 'in:tenant_admin,teacher,student'],
        ]);
        $email = strtolower($data['email']);
        $userId = DB::table('users')->where('email', $email)->value('id')
            ?? DB::table('admin_users')->where('email', $email)->value('id');
        if (! $userId) {
            return response()->json(['error' => 'Usuário não encontrado.'], 404);
        }

        $roleId = DB::table('roles')
            ->where('code', $data['role'])
            ->where(fn ($query) => $query->whereNull('tenant_id')->orWhere('tenant_id', $id))
            ->value('id');
        if (! $roleId) {
            return response()->json(['error' => 'Papel não encontrado.'], 404);
        }

        DB::table('user_tenant_roles')->insertOrIgnore([
            'user_id' => $userId,
            'tenant_id' => $id,
            'role_id' => $roleId,
            'created_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    public function removeMember(Request $request, string $id, string $userId): JsonResponse
    {
        if (! $this->isSuperAdmin($request) || ! $this->canAccess($request, $id)) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $removed = DB::table('user_tenant_roles')
            ->where('tenant_id', $id)
            ->where('user_id', $userId)
            ->delete();

        return response()->json(['success' => true, 'removed' => $removed]);
    }

    private function isSuperAdmin(Request $request): bool
    {
        return TenantAccess::isSuperAdmin(
            $request->attributes->get('auth_user'),
            (string) $request->attributes->get('auth_type', ''),
        );
    }

    private function isTenantAdmin(Request $request, string $tenantId): bool
    {
        $user = $request->attributes->get('auth_user');

        return $this->isSuperAdmin($request)
            || DB::table('user_tenant_roles')
                ->join('roles', 'roles.id', '=', 'user_tenant_roles.role_id')
                ->where('user_tenant_roles.user_id', $user->id)
                ->where('user_tenant_roles.tenant_id', $tenantId)
                ->where('roles.code', 'tenant_admin')
                ->exists();
    }

    private function canAccess(Request $request, string $tenantId): bool
    {
        return TenantAccess::canAccess(
            $request->attributes->get('auth_user'),
            (string) $request->attributes->get('auth_type', ''),
            $tenantId,
        );
    }
}
