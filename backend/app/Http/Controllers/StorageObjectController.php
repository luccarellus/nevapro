<?php

namespace App\Http\Controllers;

use App\Services\B2StorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class StorageObjectController extends Controller
{
    public function show(Request $request): Response
    {
        $file = $request->query('file');
        if (! is_string($file) || $file === '') {
            return response()->json(['error' => 'Parâmetro file é obrigatório.'], 400);
        }
        if (str_contains($file, '..') || str_contains($file, '\\') || str_starts_with($file, '/')
            || ! preg_match('#^(avatars|materials)/[^/]+(?:/[^/]+)*$#', $file)) {
            return response()->json(['error' => 'Caminho de arquivo inválido.'], 400);
        }
        if (! B2StorageService::isConfigured()) {
            return response()->json(['error' => 'Armazenamento de arquivos indisponível.'], 503);
        }

        $storage = app(B2StorageService::class);
        if (str_starts_with($file, 'materials/')) {
            $tenantId = $request->attributes->get('tenant_id');
            $proxyUrl = '/api/storage/object?file='.rawurlencode($file);
            $belongsToTenant = DB::table('materials')
                ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
                ->whereIn('url', [$proxyUrl, $file, $storage->url($file)])
                ->exists();
            if (! $belongsToTenant) {
                return response()->json(['error' => 'Arquivo não encontrado.'], 404);
            }
        }

        $content = $storage->get($file);
        if ($content === null) {
            return response()->json(['error' => 'Arquivo não encontrado.'], 404);
        }

        return response($content)
            ->header('Content-Type', $storage->mimeType($file) ?? 'application/octet-stream')
            ->header('Cache-Control', 'private, max-age=3600')
            ->header('X-Content-Type-Options', 'nosniff');
    }
}
