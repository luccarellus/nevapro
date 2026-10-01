<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.mural (recados).
 */
class MuralPost extends Model
{
    protected $table = 'mural';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'title', 'content', 'type', 'tag', 'sender', 'tenant_id'];

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';
}
