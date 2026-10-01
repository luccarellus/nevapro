<?php

namespace App\Http\Controllers;

use App\Services\ApiCache;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * CRUD genérico — espelha lib/createCrudRouter.ts da API Express:
 * list/create/update/delete com scoping por tenant, cache e notificações.
 * Contratos JSON idênticos para o frontend React não mudar.
 */
abstract class CrudController extends Controller
{
    public function __construct(
        protected ApiCache $cache,
        protected NotificationService $notifications,
    ) {}

    // ===== Configuração (equivalente ao options do createCrudRouter) =====
    abstract protected function model(): string;

    protected function cacheKey(): string
    {
        return $this->model()::make()->getTable();
    }

    protected function tenantScoped(): bool
    {
        return true;
    }

    protected function orderBy(): array
    {
        return ['created_at', 'desc'];
    }

    /** Mapeia colunas snake_case → formato consumido pelo frontend. */
    protected function mapRow($row): array
    {
        return $row->toArray();
    }

    /** Campos permitidos no create/update (mass assignment). */
    protected function writableFields(): array
    {
        return $this->model()::make()->getFillable();
    }

    /** Chaves extras de cache a invalidar nas escritas. */
    protected function extraCacheKeys(): array
    {
        return [];
    }

    /** Callback antes de deletar (ex.: remover arquivo do B2). */
    protected function onBeforeDelete($row): void {}

    // ===== Actions =====

    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->tenantScoped() ? $request->attributes->get('tenant_id') : null;
        $key = $this->tenantScoped() && $tenantId ? $this->cacheKey().":{$tenantId}" : $this->cacheKey();

        $data = $this->cache->remember($key, 60, function () use ($tenantId) {
            $query = $this->model()::query();
            if ($tenantId) {
                $query->where('tenant_id', $tenantId);
            }
            [$col, $dir] = $this->orderBy();

            return $query->orderBy($col, $dir)->get()->map(fn ($row) => $this->mapRow($row))->values();
        });

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->only($this->writableFields());
        [$col] = $this->orderBy();

        $row = $this->model()::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenantScoped() ? $request->attributes->get('tenant_id') : null,
        ]));

        $this->invalidateCaches($request);

        $title = $row->title ?? 'Novo item';
        $this->notifications->addAsync(
            $request->attributes->get('tenant_id'),
            'Novo '.$this->notificationType(),
            $title,
            $this->notificationType(),
        );

        return response()->json($this->mapRow($row), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $row = $this->model()::findOrFail($id);
        $row->update($request->only($this->writableFields()));

        $this->invalidateCaches($request);

        return response()->json($this->mapRow($row->fresh()));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $row = $this->model()::findOrFail($id);

        $this->onBeforeDelete($row);
        $row->delete();
        $this->invalidateCaches($request);

        return response()->json(null, 204);
    }

    protected function invalidateCaches(Request $request): void
    {
        $tenantId = $request->attributes->get('tenant_id');
        $keys = [$this->cacheKey(), ...$this->extraCacheKeys()];
        if ($tenantId) {
            $keys[] = $this->cacheKey().":{$tenantId}";
        }
        $this->cache->invalidate(...$keys);
    }

    protected function notificationType(): string
    {
        return 'item';
    }
}
