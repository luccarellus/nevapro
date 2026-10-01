<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tenants — multi-tenancy da plataforma.
 * Mapeia public.tenants (schema existente, UUID pk).
 */
class Tenant extends Model
{
    protected $table = 'tenants';

    public $incrementing = false;

    protected $keyType = 'string';

    public const PLATFORM_ID = '00000000-0000-0000-0000-000000000001';

    protected $fillable = ['id', 'name', 'slug', 'domain', 'plan', 'active'];

    protected $casts = ['active' => 'boolean'];

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';

    public function roles(): HasMany
    {
        return $this->hasMany(Role::class);
    }
}
