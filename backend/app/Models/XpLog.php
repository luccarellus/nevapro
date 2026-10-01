<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mapeia public.xp_logs (histórico de XP por usuário).
 */
class XpLog extends Model
{
    protected $table = 'xp_logs';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'user_id', 'amount', 'reason', 'tenant_id'];

    protected $casts = ['amount' => 'integer'];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = null;

    public function user(): BelongsTo
    {
        return $this->belongsTo(StudentUser::class, 'user_id');
    }
}
