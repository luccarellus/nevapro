<?php

namespace Tests\Feature;

use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\StudentUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AnswerIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_answer_correctness_is_derived_from_the_stored_answer_key(): void
    {
        $this->seed();
        [$user, $token] = $this->createStudent();
        $question = $this->createQuestion('persisted-question');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/answers', [
                'userId' => $user->id,
                'questionId' => $question->id,
                'selectedOption' => 0,
                'isCorrect' => false,
                'questionData' => ['correctOptionIndex' => 1],
            ])
            ->assertOk()
            ->assertJson(['success' => true]);

        $this->assertDatabaseHas('answers', [
            'user_id' => $user->id,
            'question_id' => $question->id,
            'is_correct' => true,
        ]);
    }

    public function test_answers_cannot_create_unverified_questions(): void
    {
        $this->seed();
        [$user, $token] = $this->createStudent();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/answers', [
                'userId' => $user->id,
                'questionId' => 'client-invented',
                'selectedOption' => 0,
                'isCorrect' => true,
                'questionData' => [
                    'text' => 'Invented question',
                    'options' => ['A', 'B'],
                    'correctOptionIndex' => 0,
                ],
            ])
            ->assertUnprocessable();

        $this->assertDatabaseMissing('questions', ['id' => 'client-invented']);
        $this->assertDatabaseCount('answers', 0);
    }

    public function test_student_cannot_call_the_removed_client_award_xp_endpoint(): void
    {
        $this->seed();
        [, $token] = $this->createStudent();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/user/award-xp', ['amount' => 100, 'reason' => 'forged'])
            ->assertNotFound();
    }

    public function test_tenant_question_list_does_not_disclose_the_answer_key(): void
    {
        $this->seed();
        [, $token] = $this->createStudent();
        $this->createQuestion('hidden-answer-question');

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/questoes/tenant')
            ->assertOk()
            ->assertJsonMissingPath('0.correctOptionIndex')
            ->assertJsonMissingPath('0.explanation');
    }

    /**
     * @return array{0: StudentUser, 1: string}
     */
    private function createStudent(): array
    {
        $user = StudentUser::create([
            'id' => (string) Str::uuid(),
            'email' => 'student-'.Str::uuid().'@example.test',
            'password_hash' => 'unused',
            'name' => 'Student',
            'role' => 'student',
            'tenant_id' => '00000000-0000-0000-0000-000000000001',
            'token_version' => 0,
        ]);
        $token = $user->createToken('auth:student:tv0', ['*'], now()->addDay())->plainTextToken;

        return [$user, $token];
    }

    private function createQuestion(string $id): Question
    {
        $question = Question::create([
            'id' => $id,
            'subject' => 'Matemática',
            'text' => 'Quanto é 1 + 1?',
            'correct_option_index' => 0,
            'explanation' => 'A resposta é 2.',
            'difficulty' => 'fácil',
            'xp_reward' => 10,
            'year' => 2026,
            'tenant_id' => '00000000-0000-0000-0000-000000000001',
            'created_at' => now(),
        ]);

        QuestionOption::create([
            'id' => (string) Str::uuid(),
            'question_id' => $question->id,
            'text' => '2',
            'letter' => 'A',
            'is_correct' => true,
        ]);
        QuestionOption::create([
            'id' => (string) Str::uuid(),
            'question_id' => $question->id,
            'text' => '3',
            'letter' => 'B',
            'is_correct' => false,
        ]);

        return $question;
    }
}
