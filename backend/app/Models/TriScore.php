<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.user_tri_scores (TRI estimado por usuário).
 */
class TriScore extends Model
{
    protected $table = 'user_tri_scores';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'user_id', 'tenant_id', 'estimated_score',
        'math_score', 'nature_score', 'humanities_score', 'languages_score',
    ];

    protected $casts = [
        'estimated_score' => 'float',
        'math_score' => 'float',
        'nature_score' => 'float',
        'humanities_score' => 'float',
        'languages_score' => 'float',
        'calculated_at' => 'datetime',
    ];

    public $timestamps = false;

    const CREATED_AT = 'calculated_at';

    const UPDATED_AT = null;
}
