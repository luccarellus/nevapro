<?php

namespace App\Http\Controllers;

use App\Services\B2StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Upload — espelha routes/uploads.ts da API Express (avatar do usuário).
 */
class UploadController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $request->validate([
            'file' => ['required', 'file', 'image', 'max:2048'], // 2 MB
        ]);

        $file = $request->file('file');
        $key = "avatars/{$user->id}/".now()->timestamp.'.'.$file->getClientOriginalExtension();

        app(B2StorageService::class)->put($key, $file->getContent());

        $url = app(B2StorageService::class)->url($key);

        $user->update(['avatar_url' => $url]);

        return response()->json(['url' => $url]);
    }
}
