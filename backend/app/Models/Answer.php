<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mapeia public.answers (respostas dos alunos às questões).
 */
class Answer extends Model
{
    protected $table = 'answers';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'user_id', 'question_id', 'selected_option_index', 'is_correct', 'tenant_id',
    ];

    protected $casts = [
        'selected_option_index' => 'integer',
        'is_correct' => 'boolean',
    ];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = null;

    public function user(): BelongsTo
    {
        return $this->belongsTo(StudentUser::class, 'user_id');
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(Question::class, 'question_id');
    }
}
