<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * LGPD — espelha routes/lgpd.ts da API Express:
 * registro de consentimento (cookie banners, tracking).
 */
class LgpdController extends Controller
{
    public function consentLog(Request $request): JsonResponse
    {
        $data = $request->validate([
            'consent_type' => ['required', 'string', 'max:100'],
            'granted' => ['required', 'boolean'],
            'policy_version' => ['nullable', 'string', 'max:20'],
        ]);

        $user = $request->attributes->get('auth_user');

        Log::channel('daily')->info('[LGPD] consent', [
            'user_id' => $user?->id,
            'email' => $user?->email,
            'ip' => $request->ip(),
            ...$data,
        ]);

        return response()->json(['success' => true]);
    }
}
