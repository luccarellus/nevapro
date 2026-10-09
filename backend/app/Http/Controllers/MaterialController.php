<?php

namespace App\Http\Controllers;

use App\Models\Material;
use App\Services\ApiCache;
use App\Services\B2StorageService;

/**
 * Materials — espelha routes/materials.ts da API Express.
 * Ao deletar, remove também o arquivo do storage remoto.
 */
class MaterialController extends CrudController
{
    protected function model(): string
    {
        return Material::class;
    }

    protected function cacheKey(): string
    {
        return 'materials';
    }

    protected function orderBy(): array
    {
        return ['uploaded_at', 'desc'];
    }

    protected function notificationType(): string
    {
        return 'material';
    }

    /** Campos graváveis: id/tenant_id/uploaded_at nunca vêm do cliente. */
    protected function writableFields(): array
    {
        return ['title', 'subject', 'foco', 'description', 'url', 'type'];
    }

    protected function validationRules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'subject' => ['nullable', 'string', 'max:120'],
            'foco' => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'type' => ['nullable', 'string', 'max:40'],
            'url' => [
                'required', 'string', 'max:2048',
                function ($attribute, $value, $fail): void {
                    $key = is_string($value) ? B2StorageService::extractObjectKey($value) : null;
                    if ($key === null || ! str_starts_with($key, 'materials/')) {
                        $fail('URL do material inválida.');
                    }
                },
            ],
        ];
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
            'subject' => $row->subject,
            'foco' => $row->foco,
            'description' => $row->description,
            'url' => B2StorageService::resolveStoredUrl($row->url),
            'type' => $row->type,
            'uploadedAt' => $row->uploaded_at?->toISOString() ?? $row->created_at?->toISOString(),
        ];
    }

    protected function onBeforeDelete($row): void
    {
        if (! $row->url) {
            return;
        }
        $key = B2StorageService::extractObjectKey($row->url);
        if ($key) {
            try {
                app(B2StorageService::class)->delete($key);
            } catch (\Throwable $e) {
                logger()->warning('[Materials] Falha ao remover B2: '.$e->getMessage());
            }
        }
    }
}
