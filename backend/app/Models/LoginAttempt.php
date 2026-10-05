<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.login_attempts (proteção brute-force).
 */
class LoginAttempt extends Model
{
    protected $table = 'login_attempts';

    protected $primaryKey = 'email';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['email', 'attempts', 'lock_until'];

    protected $casts = [
        'attempts' => 'integer',
        'lock_until' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public $timestamps = true;

    const CREATED_AT = null;

    const UPDATED_AT = 'updated_at';
}
