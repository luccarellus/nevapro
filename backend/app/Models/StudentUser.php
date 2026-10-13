<?php

namespace App\Models;

use App\Services\B2StorageService;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use App\Services\ApiCache;

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

    /**
     * Reconstrói uma instância do StudentUser a partir de um array RAW (snapshot
     * cacheado no AuthService). Usado pelo AuthService para reutilizar o snapshot
     * sem fazer uma nova query ao banco.
     *
     * Atenção: o retorno é somente leitura para fins de autenticação (o AuthService
     * compara apenas o token_version).
     *
     * @phpstan-static-call false
     */
    public static function createFromArray(array $attributes): ?self
    {
        if (! isset($attributes['id'], $attributes['email'])) {
            return null;
        }

        $attrs = $attributes;
        foreach (['created_at', 'updated_at'] as $field) {
            if (isset($attrs[$field]) && is_string($attrs[$field])) {
                $attrs[$field] = \Illuminate\Support\Carbon::parse($attrs[$field]);
            }
        }

        $model = new static();
        $model->exists = false;
        $model->setRawAttributes($attrs, true);

        return $model;
    }

    /**
     * Retorno rápido a partir de um array RAW (caminho alternativo ao
     * createFromArray, utilizado pelo AuthService).
     *
     * @phpstan-static-call false
     */
    public static function makeFromRaw(array $attributes): self
    {
        return static::createFromArray($attributes) ?? new static();
    }

    /** Força invalidação do cache de snapshot do usuário e seus tokens relacionados. */
    public function invalidateUserSnapshot(ApiCache $cache, ?int $tenantId = null): void
    {
        $cache->invalidateUserSnapshot($this->id, $this instanceof AdminUser ? 'admin' : 'student', $tenantId);

        // Invalida também o cache de resolução de todos os tokens do usuário.
        $cache->forgetUserTokenRelation($this->id, $this instanceof AdminUser ? 'admin' : 'student', $tenantId);
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
