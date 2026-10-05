<?php

namespace Tests\Feature;

use App\Http\Controllers\AdminController;
use App\Models\StudentUser;
use App\Models\Tenant;
use App\Services\ApiCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminUsersCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_users_are_cached_and_refreshed_after_update(): void
    {
        $this->seed();
        $tenantId = Tenant::PLATFORM_ID;
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'cached-student@test.local',
            'password_hash' => Hash::make('password'),
            'name' => 'Before update',
            'role' => 'student',
            'tenant_id' => $tenantId,
            'xp' => 0,
            'level' => 1,
        ]);
        $controller = new AdminController(new ApiCache);

        $listRequest = Request::create('/api/admin/users', 'GET');
        $listRequest->attributes->set('tenant_id', $tenantId);
        $before = $controller->users($listRequest)->getData(true);

        self::assertSame('Before update', $before[0]['name']);
        self::assertArrayNotHasKey('password_hash', $before[0]);

        $updateRequest = Request::create('/api/admin/users/'.$user->id, 'PUT', ['name' => 'After update']);
        $updateRequest->attributes->set('tenant_id', $tenantId);
        $controller->updateUser($updateRequest, $user->id);

        $after = $controller->users($listRequest)->getData(true);
        self::assertSame('After update', $after[0]['name']);
    }
}
