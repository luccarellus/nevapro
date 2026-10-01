<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.events (calendário pedagógico).
 */
class Event extends Model
{
    protected $table = 'events';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'title', 'description', 'date', 'time', 'type',
        'category', 'observation', 'questions_count', 'xp_reward', 'tenant_id',
    ];

    protected $casts = [
        'questions_count' => 'integer',
        'xp_reward' => 'integer',
    ];

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';
}
