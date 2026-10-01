<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mapeia public.materials.
 */
class Material extends Model
{
    protected $table = 'materials';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'title', 'subject', 'foco', 'description', 'url', 'type', 'tenant_id', 'uploaded_at',
    ];

    protected $casts = ['uploaded_at' => 'datetime'];

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
