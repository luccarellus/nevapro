<?php

namespace App\Http\Controllers;

use App\Models\Question;
use App\Models\QuestionOption;
use App\Services\ApiCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Questões — espelha routes/questions.ts da API Express:
 * listagem paginada do tenant (com cache) e criação (professor/admin).
 */
class QuestionController extends Controller
{
    private const PAGE_SIZE = 50;

    private const ENEM_MAX_LIMIT = 200;

    private const ENEM_MAX_OFFSET = 100000;

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

    public function enem(Request $request): JsonResponse
    {
        $year = filter_var($request->query('year'), FILTER_VALIDATE_INT);
        if ($year === false || $year < 2009 || $year > 2100) {
            return response()->json(['error' => 'Year parameter is required'], 400);
        }

        $limit = filter_var($request->query('limit', 50), FILTER_VALIDATE_INT);
        $offset = filter_var($request->query('offset', 0), FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > self::ENEM_MAX_LIMIT
            || $offset === false || $offset < 0 || $offset > self::ENEM_MAX_OFFSET) {
            return response()->json(['error' => 'Parâmetros limit ou offset inválidos.'], 400);
        }
        $cacheKey = "questions:v2:{$year}:{$limit}:{$offset}";
        $payload = $this->cache->remember($cacheKey, 600, function () use ($year, $limit, $offset) {
            $response = Http::timeout(15)->get(
                "https://api.enem.dev/v1/exams/{$year}/questions",
                ['limit' => $limit, 'offset' => $offset],
            );

            if (! $response->successful()) {
                return ['_status' => $response->status(), 'error' => 'ENEM API error: '.$response->reason()];
            }

            $data = $response->json();

            return ['questions' => $data['questions'] ?? $data];
        });

        if (isset($payload['_status'])) {
            $status = $payload['_status'];
            unset($payload['_status']);
            $this->cache->invalidate($cacheKey);

            return response()->json($payload, $status);
        }

        $questions = $payload['questions'] ?? null;
        if (! is_array($questions) || ! array_is_list($questions)) {
            return response()->json(['error' => 'Resposta inválida da API ENEM.'], 502);
        }

        try {
            $this->persistExternalQuestions($questions, 'enem', $year);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Não foi possível validar o gabarito das questões ENEM.'], 502);
        }

        return response()->json([
            'questions' => array_map(fn (array $question) => $this->hideAnswerKey($question), $questions),
        ]);
    }

    public function enemHubSubjects(): JsonResponse
    {
        $key = config('services.enemhub.key');
        if (! $key) {
            return response()->json(['error' => 'EnemHub não configurada (ENEMHUB_API_KEY ausente).'], 503);
        }

        $payload = $this->cache->remember('enemhub:subjects', 3600, function () use ($key) {
            $response = Http::withHeaders(['X-API-Key' => $key])
                ->timeout(15)
                ->get('https://api.enemhub.com.br/v1/enem/subjects');

            if (! $response->successful()) {
                return ['_status' => $response->status(), 'error' => 'EnemHub API error: '.$response->reason()];
            }

            return ['subjects' => $response->json('data') ?? []];
        });

        if (isset($payload['_status'])) {
            $status = $payload['_status'];
            unset($payload['_status']);
            $this->cache->invalidate('enemhub:subjects');

            return response()->json($payload, $status);
        }

        return response()->json($payload);
    }

    public function enemHub(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', 0);
        if ($year < 2009 || $year > 2025) {
            return response()->json(['error' => 'Parâmetro year inválido (2009-2025).'], 400);
        }

        $key = config('services.enemhub.key');
        if (! $key) {
            return response()->json(['error' => 'EnemHub não configurada (ENEMHUB_API_KEY ausente).'], 503);
        }

        $limit = filter_var($request->query('limit', 50), FILTER_VALIDATE_INT);
        $page = filter_var($request->query('page', 1), FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > self::ENEM_MAX_LIMIT
            || $page === false || $page < 1 || $page > intdiv(self::ENEM_MAX_OFFSET, self::ENEM_MAX_LIMIT)) {
            return response()->json(['error' => 'Parâmetros limit ou page inválidos.'], 400);
        }
        $cacheKey = "enemhub:questions:v2:{$year}:{$limit}:{$page}";
        $payload = $this->cache->remember($cacheKey, 600, function () use ($key, $year, $limit, $page) {
            $url = 'https://api.enemhub.com.br/v1/enem/questions';
            $response = Http::withHeaders(['X-API-Key' => $key])
                ->timeout(20)
                ->get($url, ['year' => $year, 'limit' => $limit, 'page' => $page]);

            if ($response->status() === 429) {
                usleep(2_500_000);
                $response = Http::withHeaders(['X-API-Key' => $key])
                    ->timeout(20)
                    ->get($url, ['year' => $year, 'limit' => $limit, 'page' => $page]);
            }

            if (! $response->successful()) {
                return ['_status' => $response->status(), 'error' => 'EnemHub API error: '.$response->reason()];
            }

            return [
                'questions' => $response->json('data') ?? [],
                'meta' => $response->json('meta'),
            ];
        });

        if (isset($payload['_status'])) {
            $status = $payload['_status'];
            unset($payload['_status']);
            $this->cache->invalidate($cacheKey);

            return response()->json($payload, $status);
        }

        $questions = $payload['questions'] ?? null;
        if (! is_array($questions) || ! array_is_list($questions)) {
            return response()->json(['error' => 'Resposta inválida da EnemHub.'], 502);
        }

        try {
            $this->persistExternalQuestions($questions, 'enemhub', $year);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['error' => 'Não foi possível validar o gabarito da EnemHub.'], 502);
        }

        return response()->json([
            'questions' => array_map(fn (array $question) => $this->hideAnswerKey($question), $questions),
            'meta' => $payload['meta'] ?? null,
        ]);
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

    /**
     * Persists the provider's answer key before removing it from client output.
     * IDs intentionally match the React ENEM and EnemHub question IDs.
     */
    private function persistExternalQuestions(array $questions, string $source, int $year): void
    {
        DB::transaction(function () use ($questions, $source, $year): void {
            foreach ($questions as $raw) {
                if (! is_array($raw)) {
                    throw new RuntimeException('External question payload must be an object.');
                }

                $alternatives = $raw['alternatives'] ?? null;
                if (! is_array($alternatives) || count($alternatives) < 2 || count($alternatives) > 10) {
                    throw new RuntimeException('External question has an invalid alternatives list.');
                }

                $questionIndex = null;
                if ($source === 'enem') {
                    $discipline = is_string($raw['discipline'] ?? null) ? $raw['discipline'] : 'geral';
                    $index = filter_var($raw['index'] ?? null, FILTER_VALIDATE_INT);
                    if ($index === false || $index < 0) {
                        throw new RuntimeException('External ENEM question has an invalid index.');
                    }
                    $questionIndex = $index;
                    $normalizedDiscipline = strtolower(Str::ascii($discipline));
                    $id = "{$year}-{$index}-{$normalizedDiscipline}";
                    $subject = $discipline;
                    $context = is_string($raw['context'] ?? null) ? $raw['context'] : '';
                    $introduction = is_string($raw['alternativesIntroduction'] ?? null)
                        ? $raw['alternativesIntroduction'] : '';
                    $text = trim($context."\n\n".$introduction);
                    $files = is_array($raw['files'] ?? null) ? $raw['files'] : [];
                    $imageUrl = is_string($files[0] ?? null) ? $files[0] : null;
                    $difficulty = 'médio';
                    $xpReward = 15;
                } else {
                    $externalId = $raw['externalId'] ?? null;
                    $providerId = $raw['id'] ?? null;
                    $suffix = is_string($externalId) && $externalId !== ''
                        ? $externalId
                        : (is_string($providerId) ? substr($providerId, 0, 8) : '');
                    $subjectName = $raw['subject']['name'] ?? null;
                    $subject = is_string($subjectName) ? $subjectName : 'Geral';
                    $id = "ehub-{$year}-{$suffix}";
                    $text = is_string($raw['statement'] ?? null) ? $raw['statement'] : '';
                    $imageUrl = null;
                    $difficulty = in_array($raw['difficulty'] ?? null, ['fácil', 'médio', 'difícil'], true)
                        ? $raw['difficulty'] : 'médio';
                    $xpReward = 15;
                }

                if ($id === '' || strlen($id) > 64 || ! is_string($text) || trim($text) === '') {
                    throw new RuntimeException('External question has invalid identifying or text fields.');
                }

                $correctIndex = null;
                foreach (array_values($alternatives) as $index => $alternative) {
                    if (! is_array($alternative)) {
                        continue;
                    }
                    $isCorrect = $source === 'enem'
                        ? (($alternative['isCorrect'] ?? false) === true
                            || (($alternative['letter'] ?? null) === ($raw['correctAlternative'] ?? null)))
                        : (($alternative['isCorrect'] ?? false) === true
                            || (($alternative['letter'] ?? null) === ($raw['correctAlternative'] ?? null)));
                    if ($isCorrect) {
                        if ($correctIndex !== null) {
                            throw new RuntimeException('External question has multiple correct alternatives.');
                        }
                        $correctIndex = $index;
                    }
                }
                if ($correctIndex === null) {
                    throw new RuntimeException('External question has no verifiable correct alternative.');
                }

                $inserted = DB::table('questions')->insertOrIgnore([
                    'id' => $id,
                    'subject' => mb_substr(strip_tags((string) $subject), 0, 255),
                    'text' => $text,
                    'image_url' => $imageUrl,
                    'correct_option_index' => $correctIndex,
                    'explanation' => is_string($raw['explanation'] ?? null) ? $raw['explanation'] : '',
                    'difficulty' => $difficulty,
                    'xp_reward' => $xpReward,
                    'year' => $year,
                    'index' => $questionIndex,
                    'tenant_id' => null,
                    'created_at' => now(),
                ]);
                if ($inserted === 0) {
                    continue;
                }

                foreach (array_values($alternatives) as $optionIndex => $alternative) {
                    if (! is_array($alternative) || ! is_string($alternative['text'] ?? null)) {
                        throw new RuntimeException('External question has an invalid alternative.');
                    }
                    $optionImage = $source === 'enem'
                        ? ($alternative['file'] ?? null)
                        : ($alternative['image'] ?? null);
                    DB::table('question_options')->insert([
                        'id' => (string) Str::uuid(),
                        'question_id' => $id,
                        'text' => $alternative['text'],
                        'image_url' => is_string($optionImage) ? $optionImage : null,
                        'letter' => chr(65 + $optionIndex),
                        'is_correct' => $optionIndex === $correctIndex,
                    ]);
                }
            }
        });
    }

    private function hideAnswerKey(array $question): array
    {
        foreach (['correctAlternative', 'correctOptionIndex', 'correct_option_index', 'answer', 'gabarito', 'explanation'] as $key) {
            unset($question[$key]);
        }
        if (is_array($question['alternatives'] ?? null)) {
            $question['alternatives'] = array_map(function ($alternative) {
                if (! is_array($alternative)) {
                    return $alternative;
                }
                foreach (['isCorrect', 'is_correct', 'correct'] as $key) {
                    unset($alternative[$key]);
                }

                return $alternative;
            }, $question['alternatives']);
        }

        return $question;
    }
}
