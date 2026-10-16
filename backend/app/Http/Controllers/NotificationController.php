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

        // Shape consumido pelo frontend (Header.tsx): { id, title, message, type, read, createdAt }
        $data = $notifications->map(fn ($n) => [
            'id' => $n->id,
            'title' => $n->title,
            'message' => $n->content,
            'type' => $n->type,
            'read' => (bool) ($n->is_read || in_array($n->id, $readIds, true)),
            'createdAt' => $n->created_at?->toISOString(),
        ]);

        return response()->json($data);
    }

    public function markRead(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['string', 'max:64'],
        ]);

        // Só marca notificações que o usuário realmente enxerga (globais ou
        // próprias, do tenant dele): sem isto o cliente gravava linhas
        // arbitrárias em notification_reads (array sem limite).
        $ids = Notification::query()
            ->whereIn('id', $data['ids'])
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $user->tenant_id))
            ->pluck('id');

        foreach ($ids as $notificationId) {
            NotificationRead::firstOrCreate(
                ['user_id' => $user->id, 'notification_id' => $notificationId],
                ['id' => (string) Str::uuid(), 'read_at' => now()],
            );
        }

        return response()->json(['success' => true]);
    }

    public function markOneRead(Request $request, string $id): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $notification = Notification::query()
            ->whereKey($id)
            ->where(fn ($query) => $query->whereNull('user_id')->orWhere('user_id', $user->id))
            ->where(fn ($query) => $query->whereNull('tenant_id')->orWhere('tenant_id', $request->attributes->get('tenant_id')))
            ->first();

        if (! $notification) {
            return response()->json(['error' => 'Notificação não encontrada.'], 404);
        }

        NotificationRead::firstOrCreate(
            ['user_id' => $user->id, 'notification_id' => $notification->id],
            ['id' => (string) Str::uuid(), 'read_at' => now()],
        );

        return response()->json(['success' => true]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $ids = Notification::query()
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))
            // Mesmo escopo do index(): sem o filtro de tenant, "marcar todas"
            // gravava leitura de notificações de outros tenants.
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $user->tenant_id))
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
