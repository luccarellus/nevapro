<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DomainSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_domain_schema_and_platform_roles_are_ready_after_seeding(): void
    {
        $this->seed();
        $this->seed();

        self::assertTrue(Schema::hasTable('users'));
        self::assertTrue(Schema::hasColumn('users', 'password_hash'));
        self::assertTrue(Schema::hasColumn('users', 'token_version'));
        self::assertTrue(Schema::hasColumn('admin_users', 'token_version'));
        self::assertTrue(Schema::hasTable('questions'));
        self::assertTrue(Schema::hasTable('user_tenant_roles'));
        self::assertDatabaseHas('tenants', [
            'id' => '00000000-0000-0000-0000-000000000001',
            'slug' => 'nevapro',
        ]);

        self::assertSame(
            4,
            DB::table('roles')->whereNull('tenant_id')->count(),
        );
    }
}
