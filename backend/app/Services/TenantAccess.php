<?php

namespace App\Services;

use App\Http\Middleware\ResolveTenant;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class TenantAccess
{
    public static function isSuperAdmin(object $user, string $authType): bool
    {
        return $authType === 'admin'
            && in_array($user->role ?? null, ['super', 'super_admin'], true);
    }

    public static function canAccess(object $user, string $authType, string $tenantId): bool
    {
        if (self::isSuperAdmin($user, $authType)) {
            return true;
        }

        // Cacheado em ResolveTenant (300s) — evita a 2ª query idêntica por request.
        if (! ResolveTenant::tenantIsActive($tenantId)) {
            return false;
        }
        if ((string) ($user->tenant_id ?? '') === $tenantId) {
            return true;
        }

        return DB::table('user_tenant_roles')
            ->where('user_id', $user->id)
            ->where('tenant_id', $tenantId)
            ->exists();
    }

    public static function accessibleTenants(object $user, string $authType): Builder
    {
        $query = Tenant::query()->where('active', true);

        if (self::isSuperAdmin($user, $authType)) {
            return $query;
        }

        return $query->where(function (Builder $query) use ($user): void {
            if ($user->tenant_id) {
                $query->whereKey($user->tenant_id);
            }

            $query->orWhereExists(function ($membership) use ($user): void {
                $membership->selectRaw('1')
                    ->from('user_tenant_roles')
                    ->whereColumn('user_tenant_roles.tenant_id', 'tenants.id')
                    ->where('user_tenant_roles.user_id', $user->id);
            });
        });
    }
}
