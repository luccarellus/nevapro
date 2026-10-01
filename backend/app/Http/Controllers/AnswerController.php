<?php

namespace App\Http\Controllers;

use App\Models\Answer;
use App\Models\Question;
use App\Models\QuestionOption;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Respostas — espelha routes/answers.ts da API Express:
 * registra a resposta do aluno, faz upsert da questão quando inédita
 * (fluxo ENEM externo) e suporta lote de até 200 respostas.
 */
class AnswerController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $data = $request->validate([
            'userId' => ['required', 'string'],
            'questionId' => ['required', 'string', 'max:64'],
            'selectedOption' => ['nullable', 'integer', 'min:0', 'max:9'],
            'isCorrect' => ['required', 'boolean'],
            'questionData' => ['nullable', 'array'],
        ]);

        // Política: respostas registradas apenas para a própria conta
        if ($user->id !== $data['userId']) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $tenantId = $request->attributes->get('tenant_id');

        DB::transaction(function () use ($data, $tenantId) {
            $this->upsertQuestion($data['questionId'], $data['questionData'] ?? null);

            Answer::create([
                'id' => (string) Str::uuid(),
                'user_id' => $data['userId'],
                'question_id' => $data['questionId'],
                'selected_option_index' => $data['selectedOption'] ?? null,
                'is_correct' => $data['isCorrect'],
                'tenant_id' => $tenantId,
            ]);
        });

        return response()->json(['success' => true]);
    }

    public function batch(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $answers = $request->input('answers');

        if (! is_array($answers) || count($answers) === 0 || count($answers) > 200) {
            return response()->json(['error' => 'Envie entre 1 e 200 respostas.'], 400);
        }

        $userId = $answers[0]['userId'] ?? null;
        if (! $userId || collect($answers)->contains(fn ($a) => ($a['userId'] ?? null) !== $userId || empty($a['questionId']))) {
            return response()->json(['error' => 'Lote de respostas inválido.'], 400);
        }

        // Política: respostas registradas apenas para a própria conta
        if ($user->id !== $userId) {
            return response()->json(['error' => 'Acesso negado.'], 403);
        }

        $tenantId = $request->attributes->get('tenant_id');

        DB::transaction(function () use ($answers, $tenantId) {
            foreach ($answers as $answer) {
                $this->upsertQuestion($answer['questionId'], $answer['questionData'] ?? null);

                Answer::create([
                    'id' => (string) Str::uuid(),
                    'user_id' => $answer['userId'],
                    'question_id' => $answer['questionId'],
                    'selected_option_index' => $answer['selectedOption'] ?? null,
                    'is_correct' => (bool) ($answer['isCorrect'] ?? false),
                    'tenant_id' => $tenantId,
                ]);
            }
        });

        return response()->json(['success' => true, 'count' => count($answers)]);
    }

    /**
     * Upsert da questão quando ela ainda não existe no banco
     * (questões vindas de fontes externas — api.enem.dev — são persistidas
     * no primeiro registro de resposta). Sanitização idêntica ao Express.
     */
    private function upsertQuestion(string $questionId, ?array $raw): void
    {
        if (Question::where('id', $questionId)->exists()) {
            return;
        }
        if (! $raw || empty($raw['text'])) {
            return;
        }

        $options = array_slice(array_values($raw['options'] ?? []), 0, 10);
        $optionImages = array_slice(array_values($raw['optionImages'] ?? []), 0, 10);
        $correctIndex = is_int($raw['correctOptionIndex'] ?? null) && ($raw['correctOptionIndex'] ?? -1) >= 0
            ? min($raw['correctOptionIndex'], 9) : null;

        Question::create([
            'id' => $questionId,
            'subject' => mb_substr(strip_tags($raw['subject'] ?? 'Geral'), 0, 120) ?: 'Geral',
            'text' => $this->sanitizeRichText($raw['text']),
            'image_url' => $raw['imageUrl'] ?? null,
            'correct_option_index' => $correctIndex,
            'explanation' => $this->sanitizeRichText(mb_substr($raw['explanation'] ?? '', 0, 10000)),
            'difficulty' => in_array($raw['difficulty'] ?? '', ['fácil', 'médio', 'difícil']) ? $raw['difficulty'] : 'médio',
            'xp_reward' => ($raw['xpReward'] ?? 50) >= 0 && ($raw['xpReward'] ?? 50) <= 1000 ? (int) ($raw['xpReward'] ?? 50) : 50,
            'year' => ($raw['year'] ?? now()->year) >= 1990 && ($raw['year'] ?? 0) <= 2100 ? (int) $raw['year'] : now()->year,
            'index' => (int) ($raw['index'] ?? 0),
        ]);

        foreach ($options as $i => $text) {
            $clean = $this->sanitizeRichText(mb_substr((string) $text, 0, 2000));
            if (! $clean) {
                continue;
            }
            QuestionOption::create([
                'id' => (string) Str::uuid(),
                'question_id' => $questionId,
                'text' => $clean,
                'image_url' => $optionImages[$i] ?? null,
                'letter' => chr(65 + $i),
                'is_correct' => $i === $correctIndex,
            ]);
        }
    }

    private function sanitizeRichText(?string $html): string
    {
        if (! $html) {
            return '';
        }
        $html = preg_replace('#<(script|style)[^>]*>.*?</\1>#is', '', $html) ?? '';
        $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? '';
        $html = preg_replace('/javascript\s*:/i', '', $html) ?? '';

        return trim($html);
    }
}
