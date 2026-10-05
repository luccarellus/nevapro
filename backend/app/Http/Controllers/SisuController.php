<?php

namespace App\Http\Controllers;

use App\Services\ApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * SISU — espelha routes/sisuCutoffs.ts da API Express.
 * Dados oficiais ingeridos por edição (scripts/ingestSisuCutoffs);
 * SQL 100% parametrizado, filtros via ILIKE com índices em lower().
 */
class SisuController extends Controller
{
    public function __construct(private readonly ApiCache $cache) {}

    public function cutoffs(Request $request): JsonResponse
    {
        $course = substr(trim((string) $request->query('course', '')), 0, 120);
        $university = substr(trim((string) $request->query('university', '')), 0, 160);
        $modality = trim((string) $request->query('modality', 'Ampla Concorrência'));
        $modality = $modality === '' ? 'Ampla Concorrência' : substr($modality, 0, 80);
        $year = filter_var($request->query('year'), FILTER_VALIDATE_INT);
        $year = ($year !== false && $year > 0) ? $year : null;
        $limit = filter_var($request->query('limit'), FILTER_VALIDATE_INT);
        $limit = $limit === false ? 60 : max(1, min(300, $limit));

        $cacheKey = 'sisu:cutoffs:'.base64_encode(json_encode([$course, $university, $modality, $year, $limit]));

        $cached = $this->cache->remember($cacheKey, 60, function () {
            return null;
        });
        if (is_array($cached)) {
            return response()->json($cached);
        }

        try {
            // 1) Edição mais recente com resultados para o filtro aplicado
            $edition = DB::table('sisu_cutoffs')
                ->select('year', 'edition')
                ->where('modality', $modality)
                ->when($course !== '', fn ($q) => $q->whereRaw('lower(course) LIKE lower(?)', ["%{$course}%"]))
                ->when($university !== '', fn ($q) => $q->whereRaw('lower(university) LIKE lower(?)', ["%{$university}%"]))
                ->when($year, fn ($q) => $q->where('year', $year))
                ->orderByDesc('year')
                ->orderByDesc('edition')
                ->first();

            if (! $edition) {
                // Filtro sem resultado: TTL curto (10 min)
                $empty = ['edition' => null, 'source' => 'sisu.mec.gov.br', 'count' => 0, 'cutoffs' => []];
                $this->cache->invalidate($cacheKey);
                $this->cache->remember($cacheKey, 600, fn () => $empty);

                return response()->json($empty);
            }

            // 2) Resultados da edição encontrada (limit é int validado/clamped)
            $rows = DB::table('sisu_cutoffs')
                ->select('course', 'campus', 'university', 'uf', 'degree', 'shift', 'modality', 'modality_category', 'cutoff_score', 'seats', 'year', 'edition')
                ->where('modality', $modality)
                ->where('year', $edition->year)
                ->where('edition', $edition->edition)
                ->when($course !== '', fn ($q) => $q->whereRaw('lower(course) LIKE lower(?)', ["%{$course}%"]))
                ->when($university !== '', fn ($q) => $q->whereRaw('lower(university) LIKE lower(?)', ["%{$university}%"]))
                ->orderByDesc('cutoff_score')
                ->limit($limit)
                ->get();

            $payload = [
                'edition' => ['year' => (int) $edition->year, 'edition' => $edition->edition],
                'source' => 'sisu.mec.gov.br',
                'count' => $rows->count(),
                'cutoffs' => $rows->map(fn ($row) => [
                    'course' => $row->course,
                    'campus' => $row->campus,
                    'university' => $row->university,
                    'uf' => $row->uf,
                    'degree' => $row->degree,
                    'shift' => $row->shift,
                    'modality' => $row->modality,
                    'modalityCategory' => $row->modality_category,
                    'cutoff' => (float) $row->cutoff_score,
                    'seats' => (int) $row->seats,
                    'year' => (int) $row->year,
                    'edition' => $row->edition,
                ])->values()->all(),
            ];

            // Cortes mudam apenas por edição: TTL longo (6h)
            $this->cache->invalidate($cacheKey);
            $this->cache->remember($cacheKey, 6 * 60 * 60, fn () => $payload);

            return response()->json($payload);
        } catch (\Throwable $e) {
            Log::error('[SISU] Falha ao buscar notas de corte: '.$e->getMessage());

            return response()->json(['error' => 'Falha ao buscar notas de corte do SISU.'], 500);
        }
    }
}
