<?php

namespace App\Http\Controllers;

use App\Models\TriScore;
use App\Services\ApiCache;
use App\Services\TriCalculator;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Performance — espelha routes/performance.ts da API Express:
 * histórico TRI, meta e taxa de acerto real (das respostas).
 */
class PerformanceController extends Controller
{
    /** TTL do cache de performance (2 min) — cobre rajadas de navegação sem dados obsoletos. */
    private const CACHE_TTL = 120;

    public function __construct(private readonly ApiCache $cache) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $data = $this->cache->remember("performance:summary:{$user->id}", self::CACHE_TTL, function () use ($user): array {
            $scores = TriScore::where('user_id', $user->id)
                ->orderByDesc('calculated_at')
                ->limit(10)
                ->get();

            $latest = $scores->first();

            // Taxa de acerto real: última resposta por questão (DISTINCT ON)
            $stats = DB::selectOne(
                'WITH latest_answers AS (
                   SELECT DISTINCT ON (question_id) question_id, is_correct
                   FROM answers
                   WHERE user_id = ?
                   ORDER BY question_id, created_at DESC
                 )
                 SELECT COUNT(*) AS answered,
                        COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0) AS correct
                 FROM latest_answers',
                [$user->id],
            );

            $answered = (int) ($stats->answered ?? 0) ?: ($user->answered_questions ?? 0);
            $correct = (int) ($stats->correct ?? 0) ?: ($user->correct_answers ?? 0);
            $hitRate = $answered > 0 ? (int) round(($correct / $answered) * 100) : 0;

            return [
                'latest_score' => $latest ? [
                    'id' => $latest->id,
                    'estimated_score' => $latest->estimated_score,
                    'math_score' => $latest->math_score,
                    'nature_score' => $latest->nature_score,
                    'humanities_score' => $latest->humanities_score,
                    'languages_score' => $latest->languages_score,
                    'calculated_at' => $latest->calculated_at?->toISOString(),
                ] : null,
                'history' => $scores->map(fn ($s) => [
                    'id' => $s->id,
                    'estimated_score' => $s->estimated_score,
                    'calculated_at' => $s->calculated_at?->toISOString(),
                ])->values()->all(),
                'tri_target' => $user->tri_target_score ?? 750,
                'stats' => [
                    'hit_rate' => $hitRate,
                    'answered' => $answered,
                    'correct' => $correct,
                    'xp' => $user->xp ?? 0,
                    'performance_snapshot_mtime' => now()->toIso8601String(),
                ],
            ];
        });

        return response()->json($data);
    }

    public function subjectMastery(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $data = $this->cache->remember("performance:mastery:{$user->id}", self::CACHE_TTL, function () use ($user): array {
            $rows = DB::select(
                'WITH latest_answers AS (
                   SELECT DISTINCT ON (a.question_id) a.question_id, a.is_correct, q.subject
                   FROM answers a
                   JOIN questions q ON q.id = a.question_id
                   WHERE a.user_id = ?
                   ORDER BY a.question_id, a.created_at DESC
                 )
                 SELECT subject,
                        COUNT(*) AS total,
                        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct
                 FROM latest_answers
                 GROUP BY subject
                 ORDER BY total DESC',
                [$user->id],
            );

            $subjects = collect($rows)->map(function ($row) {
                $percentage = $row->total > 0 ? (int) round(($row->correct / $row->total) * 100) : 0;

                return [
                    'name' => $row->subject ?? 'Geral',
                    'category' => $this->subjectCategory((string) ($row->subject ?? '')),
                    'percentage' => $percentage,
                    'level' => $percentage >= 70 ? 'high' : ($percentage >= 50 ? 'medium' : 'critical'),
                    'total' => (int) $row->total,
                    'correct' => (int) $row->correct,
                ];
            })->values();

            $evolutionRows = DB::select(
                'WITH latest_answers AS (
                   SELECT DISTINCT ON (question_id) question_id, is_correct, created_at
                   FROM answers
                   WHERE user_id = ? AND created_at >= NOW() - INTERVAL \'30 days\'
                   ORDER BY question_id, created_at DESC
                 ),
                 day_stats AS (
                   SELECT DATE(created_at) AS day,
                          COUNT(*) AS total,
                          SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct
                   FROM latest_answers
                   GROUP BY DATE(created_at)
                 )
                 SELECT day,
                        ROUND((SUM(correct) OVER (ORDER BY day)::numeric
                            / NULLIF(SUM(total) OVER (ORDER BY day), 0)) * 100, 1) AS running_accuracy
                 FROM day_stats
                 ORDER BY day',
                [$user->id],
            );
            $lastIndex = count($evolutionRows) - 1;
            $evolution = collect($evolutionRows)->values()->map(fn ($row, $index) => [
                'label' => $index === $lastIndex
                    ? 'Hoje'
                    : Carbon::parse($row->day)->locale('pt_BR')->translatedFormat('d M'),
                'precision' => (int) round($row->running_accuracy),
                'day' => (string) $row->day,
            ]);

            return ['subjects' => $subjects, 'evolution' => $evolution];
        });

        return response()->json($data);
    }

    public function calculateTri(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $rows = DB::select(
            'SELECT DISTINCT ON (a.question_id) a.is_correct, q.difficulty, q.subject
             FROM answers a
             JOIN questions q ON q.id = a.question_id
             WHERE a.user_id = ?
             ORDER BY a.question_id, a.created_at DESC',
            [$user->id],
        );

        if (count($rows) < 3) {
            return response()->json([
                'calculated' => false,
                'reason' => 'Poucas questões respondidas. Responda pelo menos 3 para gerar uma estimativa TRI.',
                'overall' => null,
                'by_subject' => null,
                'responses_total' => count($rows),
            ]);
        }

        $result = app(TriCalculator::class)->calculate(array_map(fn ($row) => [
            'is_correct' => (bool) $row->is_correct,
            'difficulty' => $row->difficulty ?? 'médio',
            'subject' => $row->subject ?? 'Geral',
        ], $rows));
        $bySubject = $result['by_subject'];
        $score = TriScore::create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'tenant_id' => $request->attributes->get('tenant_id'),
            'estimated_score' => $result['overall']['estimated_score'],
            'math_score' => $bySubject['mathematics']['estimated_score'] ?? null,
            'nature_score' => $bySubject['nature']['estimated_score'] ?? null,
            'humanities_score' => $bySubject['humanities']['estimated_score'] ?? null,
            'languages_score' => $bySubject['languages']['estimated_score'] ?? null,
            'calculated_at' => now(),
        ]);

        // Invalida o cache de summary após novo cálculo TRI
        $this->cache->invalidate("performance:summary:{$user->id}");

        return response()->json([
            'calculated' => true,
            'overall' => [
                'id' => $score->id,
                'estimated_score' => $score->estimated_score,
                'theta' => $result['overall']['theta'],
                'responses_used' => $result['overall']['responses_used'],
                'calculated_at' => $score->calculated_at?->toISOString(),
            ],
            'by_subject' => [
                'math_score' => $score->math_score,
                'nature_score' => $score->nature_score,
                'humanities_score' => $score->humanities_score,
                'languages_score' => $score->languages_score,
            ],
            'responses_total' => $result['overall']['responses_used'],
        ]);
    }

    private function subjectCategory(string $subject): string
    {
        $subject = mb_strtolower($subject);
        if (str_contains($subject, 'matem') || str_contains($subject, 'tecno')) {
            return 'Matemática e Suas Tecnologias';
        }
        if (str_contains($subject, 'natureza') || str_contains($subject, 'biologia')
            || str_contains($subject, 'física') || str_contains($subject, 'fisica')
            || str_contains($subject, 'química') || str_contains($subject, 'quimica')) {
            return 'Ciências da Natureza';
        }
        if (str_contains($subject, 'humana') || str_contains($subject, 'história') || str_contains($subject, 'historia')
            || str_contains($subject, 'geografia') || str_contains($subject, 'sociologia')
            || str_contains($subject, 'filosofia')) {
            return 'Ciências Humanas';
        }
        if (str_contains($subject, 'linguagen') || str_contains($subject, 'português') || str_contains($subject, 'portugues')
            || str_contains($subject, 'códigos') || str_contains($subject, 'codigo')
            || str_contains($subject, 'inglês') || str_contains($subject, 'ingles')
            || str_contains($subject, 'english') || str_contains($subject, 'espanhol')
            || str_contains($subject, 'spanish')) {
            return 'Linguagens e Códigos';
        }

        return 'Geral';
    }
}
