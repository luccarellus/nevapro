<?php

namespace App\Http\Controllers;

use App\Models\Answer;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Services\ApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Respostas — registra apenas respostas de questões e gabaritos já persistidos
 * pelo servidor; suporta lotes de até 200 respostas.
 * Correção da auditoria: o questionId é escopado ao tenant resolvido;
 * questões globais (ENEM, tenant_id NULL) permanecem acessíveis a todos.
 */
class AnswerController extends Controller
{
    public function __construct(private readonly ApiCache $cache) {}
    public function store(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $tenantId = $request->attributes->get('tenant_id');
        $data = $request->validate([
            'userId' => ['required', 'string'],
            'questionId' => ['required', 'string', 'max:64'],
            'selectedOption' => ['required', 'integer', 'min:0', 'max:9'],
        ]);

        // Política: respostas registradas apenas para a própria conta
        if ($user->id !== $data['userId']) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $question = Question::whereKey($data['questionId'])
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId))
            ->first(['id', 'correct_option_index', 'explanation', 'tenant_id']);
        if (! $question) {
            return response()->json(['error' => 'Questão indisponível para correção.'], 422);
        }

        $letter = chr(65 + $data['selectedOption']);
        $selectedAnswer = QuestionOption::where('question_id', $data['questionId'])
            ->where('letter', $letter)
            ->first(['is_correct']);
        if (! $selectedAnswer) {
            return response()->json(['error' => 'Alternativa indisponível para a questão informada.'], 422);
        }
        $isCorrect = (bool) $selectedAnswer->is_correct;

        $tenantId = $request->attributes->get('tenant_id');
        DB::transaction(function () use ($data, $tenantId, $isCorrect) {
            Answer::create([
                'id' => (string) Str::uuid(),
                'user_id' => $data['userId'],
                'question_id' => $data['questionId'],
                'selected_option_index' => $data['selectedOption'],
                'is_correct' => $isCorrect,
                'tenant_id' => $tenantId,
            ]);
        });

        $this->invalidatePerformanceCache($data['userId']);

        return response()->json([
            'success' => true,
            'isCorrect' => $isCorrect,
            'correctOptionIndex' => $question->correct_option_index,
            'explanation' => $question->explanation,
        ]);
    }

    /** Invalida os caches de performance do usuário após registrar respostas. */
    private function invalidatePerformanceCache(string $userId): void
    {
        $this->cache->invalidate(
            "performance:summary:{$userId}",
            "performance:mastery:{$userId}",
        );
    }

    public function batch(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $data = $request->validate([
            'answers' => ['required', 'array', 'min:1', 'max:200'],
            'answers.*.userId' => ['required', 'string'],
            'answers.*.questionId' => ['required', 'string', 'max:64'],
            'answers.*.selectedOption' => ['required', 'integer', 'min:0', 'max:9'],
        ]);
        $answers = $data['answers'];
        $userId = $answers[0]['userId'];
        if (collect($answers)->contains(fn ($answer) => $answer['userId'] !== $userId)) {
            return response()->json(['error' => 'Lote de respostas inválido.'], 400);
        }

        // Política: respostas registradas apenas para a própria conta
        if ($user->id !== $userId) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $tenantId = $request->attributes->get('tenant_id');
        $questionIds = collect($answers)->pluck('questionId')->unique()->values();
        $questionData = Question::whereIn('id', $questionIds)
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId))
            ->get(['id', 'correct_option_index', 'explanation'])
            ->keyBy('id');
        $questionIndexes = $questionData->map(fn ($question) => $question->correct_option_index);
        $knownQuestionIds = $questionIndexes->keys();
        if ($knownQuestionIds->count() !== $questionIds->count()) {
            return response()->json(['error' => 'Uma ou mais questões estão indisponíveis para correção.'], 422);
        }

        $options = QuestionOption::whereIn('question_id', $questionIds)
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('question_id', $tenantId))
            ->get(['question_id', 'letter'])
            ->groupBy('question_id')
            ->map(fn ($options) => $options->pluck('letter')->all());
        foreach ($answers as $answer) {
            $letter = chr(65 + $answer['selectedOption']);
            if (! in_array($letter, $options->get($answer['questionId'], []), true)) {
                return response()->json(['error' => 'Uma ou mais alternativas não existem para as questões informadas.'], 422);
            }
        }
        $correctOptions = QuestionOption::whereIn('question_id', $questionIds)
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('question_id', $tenantId))
            ->where('is_correct', true)
            ->get(['question_id', 'letter'])
            ->groupBy('question_id')
            ->map(fn ($options) => $options->pluck('letter')->all());
        $results = [];

        DB::transaction(function () use ($answers, $tenantId, $correctOptions, $questionIndexes, $questionData, &$results) {
            foreach ($answers as $answer) {
                $letter = chr(65 + $answer['selectedOption']);
                $isCorrect = in_array($letter, $correctOptions->get($answer['questionId'], []), true);

                Answer::create([
                    'id' => (string) Str::uuid(),
                    'user_id' => $answer['userId'],
                    'question_id' => $answer['questionId'],
                    'selected_option_index' => $answer['selectedOption'],
                    'is_correct' => $isCorrect,
                    'tenant_id' => $tenantId,
                ]);
                $results[] = [
                    'questionId' => $answer['questionId'],
                    'selectedOption' => $answer['selectedOption'],
                    'isCorrect' => $isCorrect,
                    'correctOptionIndex' => $questionIndexes->get($answer['questionId']),
                    'explanation' => $questionData->get($answer['questionId'])?->explanation,
                ];
            }
        });

        $this->invalidatePerformanceCache($userId);

        return response()->json(['success' => true, 'count' => count($answers), 'results' => $results]);
    }

}
