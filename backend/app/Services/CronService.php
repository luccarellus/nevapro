<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class CronService
{
    /**
     * @return array{xp_logs_deleted: int, reset_tokens_deleted: int}
     */
    public function cleanup(): array
    {
        return DB::transaction(function (): array {
            return [
                'xp_logs_deleted' => DB::table('xp_logs')
                    ->where('created_at', '<', now()->subDays(90))
                    ->delete(),
                'reset_tokens_deleted' => DB::table('password_reset_tokens')
                    ->where('expires_at', '<', now())
                    ->delete(),
            ];
        });
    }
}
