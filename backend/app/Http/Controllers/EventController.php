<?php

namespace App\Http\Controllers;

use App\Models\Event;

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

    /** fieldMap do Express: questionsCount→questions_count, xpReward→xp_reward. */
    protected function writableFields(): array
    {
        return ['title', 'description', 'date', 'time', 'type', 'category', 'observation', 'questions_count', 'xp_reward'];
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
