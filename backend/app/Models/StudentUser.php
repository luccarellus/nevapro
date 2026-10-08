<?php

namespace App\Models;

use App\Services\B2StorageService;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Alunos — mapeia public.users (schema existente).
 * O nome User fica reservado ao modelo padrão do Laravel; este modelo
 * representa explicitamente o aluno da plataforma.
 */
class StudentUser extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'users';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'email', 'password_hash', 'name', 'avatar_url', 'role', 'tenant_id',
        'city', 'school', 'gremio', 'answered_questions', 'correct_answers',
        'xp', 'level', 'streak', 'points', 'rank', 'flash_quiz_completed',
        'show_in_leaderboard', 'language_preference', 'tri_target_score',
        'token_version',
    ];

    protected $hidden = ['password_hash', 'token_version'];

    protected $casts = [
        'flash_quiz_completed' => 'boolean',
        'show_in_leaderboard' => 'boolean',
        'answered_questions' => 'integer',
        'correct_answers' => 'integer',
        'xp' => 'integer',
        'level' => 'integer',
        'streak' => 'integer',
        'points' => 'integer',
        'rank' => 'integer',
        'tri_target_score' => 'integer',
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

    public function getPasswordAttribute(): ?string
    {
        return $this->password_hash;
    }

    public function setPasswordAttribute(?string $value): void
    {
        if ($value === null) {
            $this->attributes['password_hash'] = null;
            return;
        }

        $this->attributes['password_hash'] = str_starts_with($value, '$2y$') || str_starts_with($value, '$2a$')
            ? $value
            : \Illuminate\Support\Facades\Hash::make($value);
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function answers()
    {
        return $this->hasMany(Answer::class, 'user_id');
    }

    public function xpLogs()
    {
        return $this->hasMany(XpLog::class, 'user_id');
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'user_tenant_roles', 'user_id', 'role_id')
            ->withPivot('tenant_id');
    }

    /** Perfil no formato consumido pelo frontend React. */
    public function toProfileArray(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'avatarUrl' => B2StorageService::resolveStoredUrl($this->avatar_url),
            'role' => $this->role ?: 'student',
            'isAdmin' => false,
            'tenantId' => $this->tenant_id,
            'city' => $this->city,
            'school' => $this->school,
            'gremio' => $this->gremio,
            'xp' => $this->xp,
            'level' => $this->level,
            'streak' => $this->streak,
            'points' => $this->points,
            'rank' => $this->rank,
            'answeredQuestions' => $this->answered_questions,
            'correctAnswers' => $this->correct_answers,
            'flashQuizCompleted' => $this->flash_quiz_completed,
            'showInLeaderboard' => $this->show_in_leaderboard,
            'languagePreference' => $this->language_preference,
            'triTargetScore' => $this->tri_target_score,
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
