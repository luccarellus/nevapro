<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Client Logs — espelha routes/clientLogs.ts da API Express:
 * recebe erros/telemetria do frontend (Sentry fallback) e grava no log.
 */
class ClientLogController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'level' => ['required', 'string', 'in:debug,info,warn,error'],
            'message' => ['required', 'string', 'max:2000'],
            'context' => ['nullable', 'array'],
        ]);

        Log::channel('daily')->{$data['level'] === 'warn' ? 'warning' : $data['level']}('[Client] '.$data['message'], [
            'user' => $request->attributes->get('auth_user')?->email,
            'context' => $data['context'] ?? null,
        ]);

        return response()->json(['success' => true]);
    }
}
