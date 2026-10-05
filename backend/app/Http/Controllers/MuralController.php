<?php

namespace App\Http\Controllers;

use App\Models\MuralPost;
use App\Services\ApiCache;

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

    /** Campos graváveis: id/tenant_id/type nunca vêm do cliente (type vem de category). */
    protected function writableFields(): array
    {
        return ['title', 'content', 'sender', 'category', 'tag'];
    }

    /** O frontend envia "category"; o banco persiste em "type". */
    protected function fieldMap(): array
    {
        return ['category' => 'type'];
    }

    /** Sem categoria, o recado é da categoria geral. */
    protected function defaults(): array
    {
        return ['type' => 'geral'];
    }

    protected function validationRules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'content' => ['required', 'string', 'max:10000'],
            'sender' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:80'],
            'tag' => ['nullable', 'string', 'max:120'],
        ];
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
