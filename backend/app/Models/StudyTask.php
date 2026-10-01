<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.user_study_tasks (plano de estudos).
 */
class StudyTask extends Model
{
    protected $table = 'user_study_tasks';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'user_id', 'title', 'estimated_time', 'target_tab', 'done', 'task_date', 'tenant_id', 'created_at',
    ];

    protected $casts = [
        'done' => 'boolean',
        'task_date' => 'date',
    ];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = null;
}
