<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\StudentUser;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Notificações — espelha services/notification.ts da API Express:
 * broadcast para todos os alunos visíveis no leaderboard.
 */
class NotificationService
{
    /**
     * Cria notificações para todos os alunos do tenant (batch, async por padrão).
     */
    public function addAsync(?string $tenantId, string $title, string $content, string $type): void
    {
        dispatch(function () use ($tenantId, $title, $content, $type) {
            $this->add($tenantId, $title, $content, $type);
        })->catch(fn (\Throwable $e) => Log::error('[Notification] broadcast falhou: '.$e->getMessage()));
    }

    public function add(?string $tenantId, string $title, string $content, string $type): void
    {
        $users = StudentUser::query()
            ->where('show_in_leaderboard', true)
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->pluck('id');

        $rows = $users->map(fn ($userId) => [
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'title' => $title,
            'content' => $content,
            'type' => $type,
            'is_read' => false,
            'tenant_id' => $tenantId,
            'created_at' => now(),
        ])->all();

        foreach (array_chunk($rows, 500) as $chunk) {
            Notification::insert($chunk);
        }
    }
}
