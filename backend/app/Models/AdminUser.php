<?php

namespace App\Models;

use App\Services\B2StorageService;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Admins — mapeia public.admin_users (schema existente).
 * Autentica via guard 'admin' (Sanctum), separado dos alunos.
 */
class AdminUser extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'admin_users';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'email', 'password_hash', 'name', 'avatar_url', 'active',
        'role', 'tenant_id', 'answered_questions', 'correct_answers',
        'xp', 'level', 'streak', 'points', 'flash_quiz_completed',
        'show_in_leaderboard', 'language_preference', 'token_version',
    ];

    protected $hidden = ['password_hash', 'token_version'];

    protected $casts = [
        'active' => 'boolean',
        'flash_quiz_completed' => 'boolean',
        'show_in_leaderboard' => 'boolean',
        'answered_questions' => 'integer',
        'correct_answers' => 'integer',
        'xp' => 'integer',
        'level' => 'integer',
        'streak' => 'integer',
        'points' => 'integer',
        'token_version' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public $timestamps = true;

    const CREATED_AT = 'created_at';

    const UPDATED_AT = 'updated_at';

    public function getAuthPassword(): string
    {
        return $this->password_hash;
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    /** Perfil no formato consumido pelo frontend React. */
    public function toProfileArray(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'avatarUrl' => B2StorageService::resolveStoredUrl($this->avatar_url),
            'role' => $this->role ?: 'admin',
            'isAdmin' => true,
            'tenantId' => $this->tenant_id,
            'xp' => $this->xp,
            'level' => $this->level,
            'streak' => $this->streak,
            'points' => $this->points,
            'answeredQuestions' => $this->answered_questions,
            'correctAnswers' => $this->correct_answers,
            'flashQuizCompleted' => $this->flash_quiz_completed,
            'showInLeaderboard' => $this->show_in_leaderboard,
            'languagePreference' => $this->language_preference,
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
