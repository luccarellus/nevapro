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
        // Shape consumido pelo frontend (consentManager.ts): { preferences, userAgent }
        $data = $request->validate([
            'preferences' => ['required', 'array'],
            'preferences.*' => ['boolean'],
            'userAgent' => ['nullable', 'string', 'max:512'],
        ]);

        $user = $request->attributes->get('auth_user');

        $consentTypes = collect($data['preferences'])
            ->filter(fn ($granted) => $granted === true)
            ->keys()
            ->slice(0, 20)
            ->values()
            ->all();

        Log::channel('daily')->info('[LGPD] consent', [
            'user_id' => $user?->id,
            'email' => $user?->email,
            'ip' => $this->anonymizeIp($request->ip()),
            'userAgent' => $data['userAgent'] ?? $request->userAgent(),
            'consentTypes' => $consentTypes ?: ['necessary_only'],
        ]);

        return response()->json(['success' => true]);
    }

    /**
     * Minimização de PII (LGPD): preserva apenas os 3 primeiros
     * octetos do IPv4 — permite correlação por /24 sem
     * identificar o usuário exato.
     */
    private function anonymizeIp(?string $ip): ?string
    {
        if ($ip === null || filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
            return $ip;
        }

        return implode('.', array_slice(explode('.', $ip), 0, 3)).'.0';
    }
}
