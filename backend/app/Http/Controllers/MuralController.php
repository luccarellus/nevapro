<?php

namespace App\Http\Controllers;

use App\Models\MuralPost;

/**
 * Mural — espelha routes/mural.ts da API Express.
 * O campo "category" do frontend mapeia para a coluna "type" do banco.
 */
class MuralController extends CrudController
{
    protected function model(): string
    {
        return MuralPost::class;
    }

    protected function cacheKey(): string
    {
        return 'mural';
    }

    protected function notificationType(): string
    {
        return 'mural';
    }

    protected function extraCacheKeys(): array
    {
        return [ApiCache::ADMIN_ACTIVITIES];
    }

    protected function mapRow($row): array
    {
        return [
            'id' => $row->id,
            'title' => $row->title,
            'content' => $row->content,
            'date' => $row->created_at?->toISOString(),
            'sender' => $row->sender ?? 'Administração',
            'category' => strtolower($row->type ?? 'geral'),
            'tag' => $row->tag ?? '',
        ];
    }
}
