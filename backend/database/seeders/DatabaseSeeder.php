<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $now = now();

        if (! DB::table('tenants')->where('slug', 'nevapro')->exists()) {
            DB::table('tenants')->insert([
                'id' => '00000000-0000-0000-0000-000000000001',
                'name' => 'NevaPro',
                'slug' => 'nevapro',
                'plan' => 'platform',
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        foreach ([
            ['super_admin', 'Super Admin', 'Controle total da plataforma (todos os tenants)'],
            ['tenant_admin', 'Admin do Tenant', 'Administração de um tenant específico'],
            ['teacher', 'Professor', 'Gestão de conteúdo pedagógico'],
            ['student', 'Aluno', 'Estudante da plataforma'],
        ] as [$code, $name, $description]) {
            $exists = DB::table('roles')
                ->where('code', $code)
                ->whereNull('tenant_id')
                ->exists();

            if (! $exists) {
                DB::table('roles')->insert([
                    'id' => (string) Str::uuid(),
                    'code' => $code,
                    'name' => $name,
                    'description' => $description,
                    'tenant_id' => null,
                    'created_at' => $now,
                ]);
            }
        }
    }
}
