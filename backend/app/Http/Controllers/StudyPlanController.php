<?php

namespace App\Http\Controllers;

use App\Models\StudyTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Plano de estudos — espelha routes/studyPlan.ts da API Express:
 * tarefas do dia com auto-geração de defaults no primeiro acesso.
 */
class StudyPlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');
        $taskDate = $request->query('date', now()->toDateString());

        $tasks = StudyTask::where('user_id', $user->id)
            ->where('task_date', $taskDate)
            ->orderBy('created_at')
            ->get();

        // Auto-gera as tarefas padrão no primeiro acesso do dia
        if ($tasks->isEmpty() && $taskDate === now()->toDateString()) {
            $defaults = [
                ['title' => 'Matemática e suas Tecnologias - 15 questões estilo ENEM', 'estimated_time' => '45 min', 'target_tab' => 'questions'],
                ['title' => 'Revisar pendências no Caderno de Erros', 'estimated_time' => '20 min', 'target_tab' => 'errors'],
                ['title' => 'Linguagens, Códigos & Humanas - 15 questões de interpretação ENEM', 'estimated_time' => '30 min', 'target_tab' => 'questions'],
            ];

            $tasks = collect($defaults)->map(fn ($t) => StudyTask::create([
                'id' => (string) Str::uuid(),
                'user_id' => $user->id,
                'title' => $t['title'],
                'estimated_time' => $t['estimated_time'],
                'target_tab' => $t['target_tab'],
                'done' => false,
                'task_date' => $taskDate,
                'tenant_id' => $request->attributes->get('tenant_id'),
            ]));
        }

        return response()->json([
            'tasks' => $tasks->map(fn ($t) => [
                'id' => $t->id,
                'user_id' => $t->user_id,
                'title' => $t->title,
                'estimated_time' => $t->estimated_time,
                'target_tab' => $t->target_tab,
                'done' => $t->done,
                'task_date' => $t->task_date?->toDateString(),
                'created_at' => $t->created_at,
            ]),
            'weekly_goal' => [
                'questions_answered' => $user->answered_questions ?? 0,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $data = $request->validate([
            // Título/estimativa são texto puro (sem mark-up).
            'title' => ['required', 'string', 'max:255', 'not_regex:/[<>]/'],
            'estimated_time' => ['nullable', 'string', 'max:50', 'not_regex:/[<>]/'],
            'target_tab' => ['nullable', 'string', 'max:50'],
            'date' => ['nullable', 'date'],
            'task_date' => ['nullable', 'date'],
        ]);

        $task = StudyTask::create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'title' => $data['title'],
            'estimated_time' => $data['estimated_time'] ?? '30 min',
            'target_tab' => $data['target_tab'] ?? 'questions',
            'done' => false,
            'task_date' => $data['task_date'] ?? $data['date'] ?? now()->toDateString(),
            'tenant_id' => $request->attributes->get('tenant_id'),
            'created_at' => now(),
        ]);

        return response()->json($task, 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $task = StudyTask::where('user_id', $user->id)->findOrFail($id);
        $data = $request->validate([
            'done' => ['sometimes', 'boolean'],
            'title' => ['sometimes', 'string', 'max:255', 'not_regex:/[<>]/'],
            'estimated_time' => ['sometimes', 'nullable', 'string', 'max:50', 'not_regex:/[<>]/'],
            'target_tab' => ['sometimes', 'nullable', 'string', 'max:50'],
        ]);

        if ($data === []) {
            return response()->json(['error' => 'Nenhum campo válido para atualizar.'], 400);
        }

        $task->update($data);

        return response()->json($task->fresh());
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        StudyTask::where('user_id', $user->id)->findOrFail($id)->delete();

        return response()->json(['success' => true]);
    }
}
