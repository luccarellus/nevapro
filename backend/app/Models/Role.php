<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Papéis RBAC — mapeia public.roles.
 */
class Role extends Model
{
    protected $table = 'roles';

    public $incrementing = false;

    protected $keyType = 'string';

    public const SUPER_ADMIN = 'super_admin';

    public const TENANT_ADMIN = 'tenant_admin';

    public const TEACHER = 'teacher';

    public const STUDENT = 'student';

    protected $fillable = ['id', 'code', 'name', 'description', 'tenant_id'];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(StudentUser::class, 'user_tenant_roles', 'role_id', 'user_id')
            ->withPivot('tenant_id');
    }
}
