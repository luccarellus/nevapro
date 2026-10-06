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
            'entries' => ['sometimes', 'array', 'max:20'],
            'entries.*.level' => ['required_with:entries', 'string', 'in:debug,info,warn,error'],
            'entries.*.message' => ['required_with:entries', 'string', 'max:2000'],
            'entries.*.page' => ['nullable', 'string', 'max:500'],
            'entries.*.timestamp' => ['nullable', 'date'],
            'level' => ['required_without:entries', 'string', 'in:debug,info,warn,error'],
            'message' => ['required_without:entries', 'string', 'max:2000'],
            'context' => ['nullable', 'array'],
        ]);

        $entries = $data['entries'] ?? [$data];
        foreach ($entries as $entry) {
            // Log forging: quebras de linha viram espaços; o contexto é
            // sanitizado recursivamente (apenas escalares, com limite).
            $message = preg_replace('/[\r\n]+/', ' ', $entry['message']) ?? $entry['message'];
            $context = $entry['context'] ?? [];
            foreach (['page', 'timestamp'] as $field) {
                if (isset($entry[$field])) {
                    $context[$field] = $entry[$field];
                }
            }

            Log::channel('daily')->{$entry['level'] === 'warn' ? 'warning' : $entry['level']}('[Client] '.$message, [
                'user' => $request->attributes->get('auth_user')?->email ?? 'anonymous',
                'context' => $this->sanitizeContext($context),
            ]);
        }

        return response()->json(['success' => true, 'accepted' => count($entries)]);
    }

    private function sanitizeContext(mixed $value, int $depth = 0): mixed
    {
        if ($depth > 4) {
            return '(profundidade maxima)';
        }
        if (is_string($value)) {
            return mb_substr((string) preg_replace('/[\r\n]+/', ' ', $value), 0, 500);
        }
        if (is_scalar($value) || $value === null) {
            return $value;
        }
        if (! is_array($value)) {
            return '(tipo ignorado)';
        }

        $sanitized = [];
        foreach ($value as $key => $item) {
            if (! is_string($key) && ! is_int($key)) {
                continue;
            }
            $sanitizedKey = is_string($key)
                ? mb_substr((string) preg_replace('/[\r\n]+/', ' ', $key), 0, 100)
                : $key;
            $sanitized[$sanitizedKey] = $this->sanitizeContext($item, $depth + 1);
        }

        return $sanitized;
    }
}
