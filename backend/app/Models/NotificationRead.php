<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.notification_reads (leitura por usuário, unique user+notification).
 */
class NotificationRead extends Model
{
    protected $table = 'notification_reads';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'user_id', 'notification_id'];

    protected $casts = ['read_at' => 'datetime'];

    public $timestamps = false;

    const CREATED_AT = null;

    const UPDATED_AT = null;
}
