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

        // Contrato idêntico ao da API Express (routes/errorsBook.ts): o front
        // (ErrorsBook e Flashcards) depende de options/optionImages,
        // selectedOptionIndex, answeredAt e index — sem eles a tela quebra
        // ao expandir a questão e o flashcard não mostra a alternativa certa.
        $rows = DB::select(
            'WITH latest_answers AS (
               SELECT DISTINCT ON (question_id) question_id, selected_option_index, created_at, is_correct
               FROM answers
               WHERE user_id = ?
               ORDER BY question_id, created_at DESC
             )
             SELECT la.selected_option_index, la.created_at AS answered_at,
                    q.id, q.subject, q.text, q.image_url, q.correct_option_index,
                    q.explanation, q.difficulty, q.xp_reward, q.year, q.index
             FROM latest_answers la
             JOIN questions q ON q.id = la.question_id
             WHERE la.is_correct = false
             ORDER BY la.created_at DESC
             LIMIT 200',
            [$user->id],
        );

        if (count($rows) === 0) {
            return response()->json([]);
        }

        $questionIds = array_map(fn ($r) => $r->id, $rows);

        $optionRows = DB::table('question_options')
            ->select('question_id', 'text', 'image_url')
            ->whereIn('question_id', $questionIds)
            ->orderBy('letter')
            ->get();

        $optionsByQuestion = [];
        foreach ($optionRows as $opt) {
            $optionsByQuestion[$opt->question_id] ??= [];
            $optionsByQuestion[$opt->question_id][] = [
                'text' => $opt->text,
                'image_url' => $opt->image_url,
            ];
        }

        return response()->json(collect($rows)->map(function ($r) use ($optionsByQuestion) {
            $opts = $optionsByQuestion[$r->id] ?? [];

            return [
                'id' => $r->id,
                'subject' => $r->subject,
                'text' => $r->text,
                'imageUrl' => $r->image_url,
                'correctOptionIndex' => $r->correct_option_index,
                'explanation' => $r->explanation,
                'difficulty' => $r->difficulty,
                'xpReward' => $r->xp_reward,
                'year' => $r->year,
                'index' => $r->index,
                'selectedOptionIndex' => $r->selected_option_index,
                'answeredAt' => $r->answered_at,
                'options' => array_map(fn ($o) => $o['text'], $opts),
                'optionImages' => array_map(fn ($o) => $o['image_url'], $opts),
            ];
        }));
    }

    public function store(Request $request): JsonResponse
    {
        // O caderno de erros deriva das respostas — não há escrita direta
        return response()->json(['success' => true]);
    }
}
