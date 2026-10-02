<?php

namespace Tests\Feature;

use App\Http\Controllers\MaterialController;
use App\Http\Middleware\ResolveTenant;
use App\Models\Material;
use App\Models\StudentUser;
use App\Services\ApiCache;
use App\Services\NotificationService;
use App\Services\TenantAccess;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_cannot_select_a_tenant_without_a_membership(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('tenant-other');
        $user = new StudentUser;
        $user->id = (string) Str::uuid();
        $user->tenant_id = '00000000-0000-0000-0000-000000000001';

        $request = Request::create('/api/materials', 'GET', [], [], [], [
            'HTTP_X_TENANT_ID' => $tenantId,
        ]);
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');

        $response = (new ResolveTenant)->handle($request, fn () => response()->noContent());

        self::assertSame(403, $response->getStatusCode());
    }

    public function test_users_can_select_a_tenant_they_are_linked_to(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('tenant-linked');
        $userId = (string) Str::uuid();
        $roleId = DB::table('roles')
            ->where('code', 'teacher')
            ->whereNull('tenant_id')
            ->value('id');

        DB::table('user_tenant_roles')->insert([
            'user_id' => $userId,
            'tenant_id' => $tenantId,
            'role_id' => $roleId,
        ]);

        $user = new StudentUser;
        $user->id = $userId;
        $user->tenant_id = '00000000-0000-0000-0000-000000000001';
        $request = Request::create('/api/materials', 'GET', [], [], [], [
            'HTTP_X_TENANT_ID' => $tenantId,
        ]);
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');

        $response = (new ResolveTenant)->handle($request, fn () => response()->noContent());

        self::assertSame($tenantId, $request->attributes->get('tenant_id'));
        self::assertSame(204, $response->getStatusCode());
    }

    public function test_users_cannot_select_an_inactive_tenant_even_with_membership(): void
    {
        $this->seed();
        $tenantId = $this->createTenant('tenant-inactive');
        $userId = (string) Str::uuid();
        $roleId = DB::table('roles')
            ->where('code', 'teacher')
            ->whereNull('tenant_id')
            ->value('id');

        DB::table('user_tenant_roles')->insert([
            'user_id' => $userId,
            'tenant_id' => $tenantId,
            'role_id' => $roleId,
        ]);
        DB::table('tenants')->where('id', $tenantId)->update(['active' => false]);

        $user = new StudentUser;
        $user->id = $userId;
        $user->tenant_id = '00000000-0000-0000-0000-000000000001';
        $request = Request::create('/api/materials', 'GET', [], [], [], [
            'HTTP_X_TENANT_ID' => $tenantId,
        ]);
        $request->attributes->set('auth_user', $user);
        $request->attributes->set('auth_type', 'student');

        $response = (new ResolveTenant)->handle($request, fn () => response()->noContent());

        self::assertSame(403, $response->getStatusCode());
    }

    public function test_legacy_admin_role_is_not_a_global_super_admin_role(): void
    {
        $admin = new \App\Models\AdminUser;
        $admin->role = 'admin';

        self::assertFalse(TenantAccess::isSuperAdmin($admin, 'admin'));
    }

    public function test_material_updates_and_deletes_are_scoped_to_the_active_tenant(): void
    {
        $this->seed();
        $otherTenantId = $this->createTenant('tenant-other');
        $material = Material::create([
            'id' => (string) Str::uuid(),
            'title' => 'Tenant A material',
            'url' => 'https://example.test/material.pdf',
            'type' => 'pdf',
            'tenant_id' => '00000000-0000-0000-0000-000000000001',
        ]);
        $request = Request::create('/api/materials/'.$material->id, 'PUT', ['title' => 'Changed']);
        $request->attributes->set('tenant_id', $otherTenantId);
        $controller = new MaterialController(
            Mockery::mock(ApiCache::class),
            Mockery::mock(NotificationService::class),
        );

        try {
            $controller->update($request, $material->id);
            self::fail('Cross-tenant update should not find the material.');
        } catch (ModelNotFoundException) {
            self::assertDatabaseHas('materials', [
                'id' => $material->id,
                'title' => 'Tenant A material',
            ]);
        }

        try {
            $controller->destroy($request, $material->id);
            self::fail('Cross-tenant delete should not find the material.');
        } catch (ModelNotFoundException) {
            self::assertDatabaseHas('materials', ['id' => $material->id]);
        }
    }

    private function createTenant(string $slug): string
    {
        $id = (string) Str::uuid();
        DB::table('tenants')->insert([
            'id' => $id,
            'name' => $slug,
            'slug' => $slug,
            'plan' => 'free',
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }
}
