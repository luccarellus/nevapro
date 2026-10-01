<?php

namespace App\Services;

use App\Models\StudentUser;
use App\Models\XpLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Gamificação — mesma regra da API Express (xpService):
 * XP concedido EXCLUSIVAMENTE pelo servidor. Nível derivado do XP.
 */
class XpService
{
    public const XP_PER_CORRECT_ANSWER = 10;

    public const XP_PER_INCORRECT_ANSWER = 2;

    public static function levelFromXp(int $xp): int
    {
        return max(1, intdiv($xp, 100) + 1);
    }

    /**
     * Concede XP atomicamente (lock na row do usuário) e registra o log.
     */
    public function award(?string $userId, ?string $tenantId, int $amount, string $reason): void
    {
        if (! $userId || $amount === 0) {
            return;
        }

        DB::transaction(function () use ($userId, $tenantId, $amount, $reason) {
            $user = StudentUser::whereKey($userId)->lockForUpdate()->first();
            if (! $user) {
                return;
            }

            $user->xp = ($user->xp ?? 0) + $amount;
            $user->level = self::levelFromXp($user->xp);
            $user->save();

            XpLog::create([
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'amount' => $amount,
                'reason' => $reason,
                'tenant_id' => $tenantId,
            ]);
        });
    }
}
