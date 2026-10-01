<?php

namespace Tests\Unit;

use App\Services\TriCalculator;
use PHPUnit\Framework\TestCase;

class TriCalculatorTest extends TestCase
{
    public function test_it_requires_at_least_three_answers_for_a_score(): void
    {
        $result = (new TriCalculator)->calculate([
            ['is_correct' => true, 'difficulty' => 'médio', 'subject' => 'Matemática'],
            ['is_correct' => false, 'difficulty' => 'fácil', 'subject' => 'Matemática'],
        ]);

        $this->assertSame(0, $result['overall']['estimated_score']);
        $this->assertSame(2, $result['overall']['responses_used']);
    }

    public function test_it_calculates_overall_and_subject_scores(): void
    {
        $items = [
            ['is_correct' => true, 'difficulty' => 'médio', 'subject' => 'Matemática'],
            ['is_correct' => true, 'difficulty' => 'difícil', 'subject' => 'Matemática'],
            ['is_correct' => true, 'difficulty' => 'fácil', 'subject' => 'Matemática'],
        ];
        $result = (new TriCalculator)->calculate($items);

        $this->assertSame(800, $result['overall']['estimated_score']);
        $this->assertSame(3, $result['overall']['responses_used']);
        $this->assertSame(800, $result['by_subject']['mathematics']['estimated_score']);
    }
}
