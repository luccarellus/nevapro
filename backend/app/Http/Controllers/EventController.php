<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Services\ApiCache;

/**
 * Events — espelha routes/events.ts da API Express.
 */
class EventController extends CrudController
{
    protected function model(): string
    {
        return Event::class;
    }

    protected function cacheKey(): string
    {
        return 'events';
    }

    protected function orderBy(): array
    {
        return ['date', 'asc'];
    }

    protected function notificationType(): string
    {
        return 'evento';
    }

    protected function extraCacheKeys(): array
    {
        return [ApiCache::ADMIN_ACTIVITIES];
    }

    /** Campos graváveis: id/tenant_id nunca vêm do cliente. */
    protected function writableFields(): array
    {
        return ['title', 'description', 'date', 'time', 'type', 'category', 'observation', 'questionsCount', 'xpReward'];
    }

    /** O frontend envia camelCase; o banco persiste em snake_case. */
    protected function fieldMap(): array
    {
        return ['questionsCount' => 'questions_count', 'xpReward' => 'xp_reward'];
    }

    protected function validationRules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:4000'],
            'date' => ['required', 'date'],
            'time' => ['nullable', 'string', 'max:8'],
            'type' => ['nullable', 'string', 'max:40'],
            'category' => ['nullable', 'string', 'max:80'],
            'observation' => ['nullable', 'string', 'max:2000'],
            'questionsCount' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'xpReward' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ];
    }

    protected function mapRow($row): array
    {
        return [
            'id' => $row->id,
            'title' => $row->title,
            'description' => $row->description,
            'date' => $row->date,
            'time' => $row->time,
            'type' => $row->type,
            'category' => $row->category,
            'questionsCount' => $row->questions_count ?? 0,
            'xpReward' => $row->xp_reward ?? 0,
            'observation' => $row->observation,
        ];
    }
}
