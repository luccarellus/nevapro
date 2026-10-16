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

        // Assinatura do objeto: sem JWT_SECRET não há como assinar a URL de
        // leitura — falha explícita em vez de devolver URL inutilizável.
        $signature = B2StorageService::signObjectKey($key);
        if ($signature === '') {
            return response()->json(['error' => 'Armazenamento de arquivos indisponível.'], 503);
        }

        try {
            app(B2StorageService::class)->putFile($key, $file->getRealPath(), $file->getMimeType());
        } catch (\InvalidArgumentException $e) {
            // Conteúdo real rejeitado pela allowlist do storage (magic bytes):
            // erro do cliente, não 500.
            report($e);

            return response()->json(['error' => 'Tipo de arquivo não permitido.'], 422);
        }

        $url = '/api/storage/object?file='.rawurlencode($key).'&s='.rawurlencode($signature);

        return response()->json(['url' => $url]);
    }

    /**
     * Valida o conteúdo real (magic bytes): a extensão declarada e o
     * Content-Type do multipart vêm do cliente e não provam nada — um
     * arquivo com conteúdo inesperado pode explorar parsers downstream.
     * Imagens, PDF e vídeos (mp4/webm) têm assinatura verificável.
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

        if ($extension === 'mp4') {
            // ISO-BMFF: box "ftyp" nos bytes 4-8.
            if (substr((string) file_get_contents($path, false, null, 4, 4), 0, 4) !== 'ftyp') {
                abort(422, 'Conteúdo do vídeo inválido.');
            }
        }

        if ($extension === 'webm') {
            // Matroska/WebM: EBML header 0x1A45DFA3.
            if (bin2hex((string) file_get_contents($path, false, null, 0, 4)) !== '1a45dfa3') {
                abort(422, 'Conteúdo do vídeo inválido.');
            }
        }
    }
}
