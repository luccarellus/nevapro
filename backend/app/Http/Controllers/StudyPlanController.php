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
                'title' => $t->title,
                'estimated_time' => $t->estimated_time,
                'target_tab' => $t->target_tab,
                'done' => $t->done,
                'taskDate' => $t->task_date?->toDateString(),
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
            'title' => ['required', 'string', 'max:255'],
            'estimated_time' => ['nullable', 'string', 'max:50'],
            'target_tab' => ['nullable', 'string', 'max:50'],
            'date' => ['nullable', 'date'],
        ]);

        $task = StudyTask::create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'title' => $data['title'],
            'estimated_time' => $data['estimated_time'] ?? null,
            'target_tab' => $data['target_tab'] ?? null,
            'done' => false,
            'task_date' => $data['date'] ?? now()->toDateString(),
            'tenant_id' => $request->attributes->get('tenant_id'),
        ]);

        return response()->json(['id' => $task->id], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        $task = StudyTask::where('user_id', $user->id)->findOrFail($id);
        $data = $request->validate([
            'done' => ['sometimes', 'boolean'],
            'title' => ['sometimes', 'string', 'max:255'],
        ]);

        $task->update($data);

        return response()->json(['success' => true]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->attributes->get('auth_user');

        StudyTask::where('user_id', $user->id)->findOrFail($id)->delete();

        return response()->json(null, 204);
    }
}
