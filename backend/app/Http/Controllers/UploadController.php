<?php

namespace App\Http\Controllers;

use App\Services\B2StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Upload — espelha routes/uploads.ts da API Express (avatar do usuário).
 */
class UploadController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $isMaterial = $request->query('kind') === 'material';
        $tenantId = $request->attributes->get('tenant_id');
        $hasTenantUploadRole = $tenantId && DB::table('user_tenant_roles')
            ->join('roles', 'roles.id', '=', 'user_tenant_roles.role_id')
            ->where('user_tenant_roles.user_id', $user->id)
            ->where('user_tenant_roles.tenant_id', $tenantId)
            ->whereIn('roles.code', ['tenant_admin', 'teacher', 'super_admin'])
            ->exists();
        if ($isMaterial
            && $request->attributes->get('auth_type') !== 'admin'
            && ! in_array($user->role ?? null, ['admin', 'tenant_admin', 'teacher', 'super_admin'], true)
            && ! $hasTenantUploadRole) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        if (! B2StorageService::isConfigured()) {
            return response()->json(['error' => 'Armazenamento de arquivos indisponível.'], 503);
        }

        $request->validate([
            'file' => $isMaterial
                ? ['required', 'file', 'mimes:pdf,jpg,jpeg,png,gif,webp,mp4,webm', 'max:5120']
                : ['required', 'file', 'image', 'max:2048'],
        ]);

        $file = $request->file('file');
        $this->assertSafeContent($file);
        $prefix = $isMaterial ? 'materials' : "avatars/{$user->id}";
        $key = $prefix.'/'.Str::uuid().'.'.$file->guessExtension();

        app(B2StorageService::class)->putFile($key, $file->getRealPath(), $file->getMimeType());

        $url = '/api/storage/object?file='.rawurlencode($key).'&s='.rawurlencode(B2StorageService::signObjectKey($key));

        return response()->json(['url' => $url]);
    }

    /**
     * Valida o conteúdo real (magic bytes): a extensão declarada
     * não prova o tipo do arquivo, e um formato inesperado pode
     * explorar parsers downstream. Vídeos (mp4/webm) não têm
     * assinatura textual confiável — ficam por conta de mimes+max.
     */
    private function assertSafeContent(UploadedFile $file): void
    {
        $extension = strtolower((string) $file->guessExtension());
        $path = $file->getRealPath();
        if ($path === false) {
            abort(422, 'Arquivo inválido.');
        }

        if (in_array($extension, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)
            && @getimagesize($path) === false) {
            abort(422, 'Conteúdo da imagem inválido.');
        }

        if ($extension === 'pdf' && file_get_contents($path, false, null, 0, 5) !== '%PDF-') {
            abort(422, 'Conteúdo do PDF inválido.');
        }
    }
}
