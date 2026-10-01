<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Mapeia public.notifications.
 */
class Notification extends Model
{
    protected $table = 'notifications';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'user_id', 'title', 'content', 'type', 'is_read', 'tenant_id'];

    protected $casts = ['is_read' => 'boolean'];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = null;

    public function reads(): HasMany
    {
        return $this->hasMany(NotificationRead::class, 'notification_id');
    }
}
