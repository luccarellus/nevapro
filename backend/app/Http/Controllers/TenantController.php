<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use Illuminate\Http\JsonResponse;

/**
 * Tenants — lista instituições disponíveis (troca de contexto no frontend).
 */
class TenantController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Tenant::where('active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'slug', 'plan'])
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'slug' => $t->slug,
                    'plan' => $t->plan,
                ]),
        );
    }
}
