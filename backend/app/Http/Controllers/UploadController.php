<?php

namespace App\Http\Controllers;

use App\Services\B2StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        $prefix = $isMaterial ? 'materials' : "avatars/{$user->id}";
        $key = $prefix.'/'.Str::uuid().'.'.$file->guessExtension();

        app(B2StorageService::class)->putFile($key, $file->getRealPath(), $file->getMimeType());

        $url = '/api/storage/object?file='.rawurlencode($key);

        return response()->json(['url' => $url]);
    }
}
