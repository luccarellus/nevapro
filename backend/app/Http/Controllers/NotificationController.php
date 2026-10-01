<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\NotificationRead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Notificações do usuário — espelha routes/notifications.ts da API Express.
 */
class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $notifications = Notification::query()
            ->where(function ($q) use ($user) {
                $q->whereNull('user_id')->orWhere('user_id', $user->id);
            })
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $user->tenant_id))
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $readIds = NotificationRead::where('user_id', $user->id)
            ->pluck('notification_id')
            ->all();

        $data = $notifications->map(fn ($n) => [
            'id' => $n->id,
            'title' => $n->title,
            'content' => $n->content,
            'type' => $n->type,
            'isRead' => $n->is_read || in_array($n->id, $readIds, true),
            'createdAt' => $n->created_at?->toISOString(),
        ]);

        return response()->json($data);
    }

    public function markRead(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $data = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['string'],
        ]);

        foreach ($data['ids'] as $notificationId) {
            NotificationRead::firstOrCreate(
                ['user_id' => $user->id, 'notification_id' => $notificationId],
                ['id' => (string) Str::uuid(), 'read_at' => now()],
            );
        }

        return response()->json(['success' => true]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $ids = Notification::query()
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))
            ->pluck('id');

        foreach ($ids as $notificationId) {
            NotificationRead::firstOrCreate(
                ['user_id' => $user->id, 'notification_id' => $notificationId],
                ['id' => (string) Str::uuid(), 'read_at' => now()],
            );
        }

        return response()->json(['success' => true]);
    }
}
