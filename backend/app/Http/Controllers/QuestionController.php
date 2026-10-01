<?php

namespace App\Http\Controllers;

use App\Models\Question;
use App\Models\QuestionOption;
use App\Services\ApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Questões — espelha routes/questions.ts da API Express:
 * listagem paginada do tenant (com cache) e criação (professor/admin).
 */
class QuestionController extends Controller
{
    private const PAGE_SIZE = 50;

    public function __construct(private readonly ApiCache $cache) {}

    public function tenant(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenant_id');
        $page = max(1, min(1000, (int) $request->query('page', '1')));
        $cacheKey = 'questions:tenant:'.($tenantId ?? 'platform').":{$page}";

        $data = $this->cache->remember($cacheKey, 60, function () use ($tenantId, $page) {
            $query = Question::query()
                ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->orderByDesc('created_at');

            $rows = $query->offset(($page - 1) * self::PAGE_SIZE)
                ->limit(self::PAGE_SIZE + 1)
                ->get();

            $hasMore = $rows->count() > self::PAGE_SIZE;
            $rows = $hasMore ? $rows->take(self::PAGE_SIZE) : $rows;

            $options = QuestionOption::whereIn('question_id', $rows->pluck('id'))
                ->orderBy('letter')
                ->get()
                ->groupBy('question_id');

            return $rows->map(fn ($q) => [
                'id' => $q->id,
                'subject' => $q->subject,
                'text' => $q->text,
                'imageUrl' => $q->image_url,
                'correctOptionIndex' => $q->correct_option_index,
                'explanation' => $q->explanation,
                'difficulty' => $q->difficulty,
                'xpReward' => $q->xp_reward,
                'year' => $q->year,
                'tenantId' => $q->tenant_id,
                'options' => $options->get($q->id)?->pluck('text')->values()->all() ?? [],
                'optionImages' => $options->get($q->id)?->map(fn ($o) => $o->image_url)->values()->all() ?? [],
            ])->values()->all();
        });

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:120'],
            'text' => ['required', 'string'],
            'options' => ['required', 'array', 'min:2', 'max:10'],
            'correctOptionIndex' => ['required', 'integer', 'min:0'],
            'explanation' => ['nullable', 'string', 'max:10000'],
            'difficulty' => ['nullable', 'string', 'in:fácil,médio,difícil'],
            'xpReward' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'year' => ['nullable', 'integer', 'min:1990', 'max:2100'],
            'imageUrl' => ['nullable', 'string', 'max:2048'],
            'optionImages' => ['nullable', 'array', 'max:10'],
        ]);

        $options = array_values($data['options']);
        if ($data['correctOptionIndex'] >= count($options)) {
            return response()->json(['error' => 'Índice da alternativa correta inválido.'], 400);
        }

        $question = DB::transaction(function () use ($data, $options, $request) {
            $question = Question::create([
                'id' => 'custom-'.Str::uuid(),
                'subject' => strip_tags($data['subject']),
                'text' => $this->sanitizeRichText($data['text']),
                'image_url' => $data['imageUrl'] ?? null,
                'correct_option_index' => $data['correctOptionIndex'],
                'explanation' => $this->sanitizeRichText($data['explanation'] ?? ''),
                'difficulty' => $data['difficulty'] ?? 'médio',
                'xp_reward' => $data['xpReward'] ?? 10,
                'year' => $data['year'] ?? now()->year,
                'tenant_id' => $request->attributes->get('tenant_id'),
            ]);

            foreach ($options as $i => $text) {
                QuestionOption::create([
                    'id' => (string) Str::uuid(),
                    'question_id' => $question->id,
                    'text' => $this->sanitizeRichText($text),
                    'image_url' => $data['optionImages'][$i] ?? null,
                    'letter' => chr(65 + $i),
                    'is_correct' => $i === $data['correctOptionIndex'],
                ]);
            }

            return $question;
        });

        // Invalida as 10 páginas em cache da listagem
        $tenantId = $request->attributes->get('tenant_id');
        $this->cache->invalidate(...array_map(
            fn ($p) => 'questions:tenant:'.($tenantId ?? 'platform').":{$p}",
            range(1, 10),
        ));

        return response()->json(['id' => $question->id], 201);
    }

    /** Sanitização de rich-text (equivalente pragmático do sanitize-html). */
    private function sanitizeRichText(?string $html): string
    {
        if (! $html) {
            return '';
        }
        // Remove scripts/styles/event handlers; mantém texto e tags básicas
        $html = preg_replace('#<(script|style)[^>]*>.*?</\1>#is', '', $html) ?? '';
        $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html) ?? '';
        $html = preg_replace('/javascript\s*:/i', '', $html) ?? '';

        return trim($html);
    }
}
