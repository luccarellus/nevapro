<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Mapeia public.questions (schema existente — pk varchar, não UUID).
 */
class Question extends Model
{
    protected $table = 'questions';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'subject', 'text', 'image_url', 'correct_option_index',
        'explanation', 'difficulty', 'xp_reward', 'year', 'index', 'tenant_id',
    ];

    protected $casts = [
        'correct_option_index' => 'integer',
        'xp_reward' => 'integer',
        'year' => 'integer',
        'index' => 'integer',
    ];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    public function options(): HasMany
    {
        return $this->hasMany(QuestionOption::class, 'question_id');
    }
}
