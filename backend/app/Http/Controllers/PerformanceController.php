<?php

namespace App\Http\Controllers;

use App\Models\TriScore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Performance — espelha routes/performance.ts da API Express:
 * histórico TRI, meta e taxa de acerto real (das respostas).
 */
class PerformanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

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

        return response()->json([
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
            ]),
            'tri_target' => $user->tri_target_score ?? 750,
            'stats' => [
                'hit_rate' => $hitRate,
                'answered' => $answered,
                'correct' => $correct,
                'xp' => $user->xp ?? 0,
            ],
        ]);
    }

    public function subjectMastery(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

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

        return response()->json(collect($rows)->map(fn ($r) => [
            'subject' => $r->subject ?? 'Geral',
            'total' => (int) $r->total,
            'correct' => (int) $r->correct,
            'mastery' => $r->total > 0 ? round(($r->correct / $r->total) * 100) : 0,
        ]));
    }
}
