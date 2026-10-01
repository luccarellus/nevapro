<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Webhooks — espelha routes/webhooks.ts da API Express (EventEase).
 */
class WebhookController extends Controller
{
    public function eventease(Request $request): JsonResponse
    {
        $data = $request->validate([
            'event' => ['required', 'string', 'max:100'],
            'payload' => ['nullable', 'array'],
        ]);

        Log::channel('daily')->info('[Webhook EventEase]', $data);

        return response()->json(['success' => true]);
    }
}
