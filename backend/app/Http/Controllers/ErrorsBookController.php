<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Errors Book — espelha routes/errorsBook.ts da API Express:
 * caderno de erros do aluno (questões erradas + revisão).
 */
class ErrorsBookController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $rows = DB::select(
            'WITH latest_answers AS (
               SELECT DISTINCT ON (question_id) question_id, is_correct
               FROM answers
               WHERE user_id = ?
               ORDER BY question_id, created_at DESC
             )
             SELECT q.id, q.subject, q.text, q.image_url, q.correct_option_index,
                    q.explanation, q.difficulty, q.xp_reward, q.year,
                    a.is_correct
             FROM latest_answers a
             JOIN questions q ON q.id = a.question_id
             WHERE a.is_correct = false
             ORDER BY q.subject, q.id
             LIMIT 200',
            [$user->id],
        );

        return response()->json(collect($rows)->map(fn ($r) => [
            'id' => $r->id,
            'subject' => $r->subject,
            'text' => $r->text,
            'imageUrl' => $r->image_url,
            'correctOptionIndex' => $r->correct_option_index,
            'explanation' => $r->explanation,
            'difficulty' => $r->difficulty,
            'xpReward' => $r->xp_reward,
            'year' => $r->year,
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        // O caderno de erros deriva das respostas — não há escrita direta
        return response()->json(['success' => true]);
    }
}
