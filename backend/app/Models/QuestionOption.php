<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mapeia public.question_options.
 */
class QuestionOption extends Model
{
    protected $table = 'question_options';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'question_id', 'text', 'image_url', 'letter', 'is_correct'];

    protected $casts = ['is_correct' => 'boolean'];

    public $timestamps = false;

    public function question(): BelongsTo
    {
        return $this->belongsTo(Question::class, 'question_id');
    }
}
