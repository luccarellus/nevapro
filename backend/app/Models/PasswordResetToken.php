<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Mapeia public.password_reset_tokens (tokens SHA-256 com expiração).
 */
class PasswordResetToken extends Model
{
    protected $table = 'password_reset_tokens';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'user_id', 'token', 'expires_at'];

    protected $casts = ['expires_at' => 'datetime'];

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = null;
}
