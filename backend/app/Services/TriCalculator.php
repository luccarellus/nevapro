<?php

namespace App\Services;

class TriCalculator
{
    private const ITEM_PARAMS = [
        'fácil' => ['a' => 1.0, 'b' => -1.5, 'c' => 0.2],
        'médio' => ['a' => 1.5, 'b' => 0.0, 'c' => 0.2],
        'difícil' => ['a' => 1.2, 'b' => 1.5, 'c' => 0.2],
    ];

    public function calculate(array $items): array
    {
        $overall = $this->score($items);
        $groups = [];
        foreach ($items as $item) {
            $category = $this->category((string) ($item['subject'] ?? '')) ?? 'general';
            $groups[$category][] = $item;
        }

        $bySubject = [];
        foreach ($groups as $category => $responses) {
            $bySubject[$category] = $this->score($responses);
        }

        return ['overall' => $overall, 'by_subject' => $bySubject];
    }

    private function score(array $items): array
    {
        if (count($items) < 3) {
            return ['estimated_score' => 0, 'theta' => 0, 'responses_used' => count($items)];
        }

        $correct = array_column($items, 'is_correct');
        if (count(array_unique($correct)) === 1) {
            $theta = $correct[0] ? 3.0 : -3.0;
        } else {
            $theta = 0.0;
            for ($iteration = 0; $iteration < 100; $iteration++) {
                $firstDerivative = 0.0;
                $secondDerivative = 0.0;
                foreach ($items as $item) {
                    $params = self::ITEM_PARAMS[$item['difficulty'] ?? ''] ?? ['a' => 1.5, 'b' => 0.0, 'c' => 0.2];
                    $a = $params['a'];
                    $b = $params['b'];
                    $c = $params['c'];
                    $exponent = max(-700, min(700, -$a * ($theta - $b)));
                    $probability = $c + (1 - $c) / (1 + exp($exponent));
                    $safeProbability = max(1e-10, min(1 - 1e-10, $probability));
                    $pMinusC = $safeProbability - $c;
                    $response = (bool) $item['is_correct'] ? 1 : 0;
                    $firstDerivative += $a * $pMinusC * ($response - $safeProbability) / ($safeProbability * (1 - $c));
                    $secondDerivative -= $a * $a * $pMinusC * $pMinusC * (1 - $safeProbability)
                        / ($safeProbability * (1 - $c) * (1 - $c));
                }

                if (abs($secondDerivative) < 1e-15) {
                    break;
                }
                $delta = $firstDerivative / $secondDerivative;
                $theta = max(-4, min(4, $theta - $delta));
                if (abs($delta) < 1e-6) {
                    break;
                }
            }
        }

        return [
            'estimated_score' => max(0, min(1000, (int) round(500 + 100 * $theta))),
            'theta' => round($theta, 2),
            'responses_used' => count($items),
        ];
    }

    private function category(string $subject): ?string
    {
        $subject = mb_strtolower($subject);
        $keywords = [
            'mathematics' => ['matemática', 'matematica', 'tecnologia'],
            'nature' => ['natureza', 'biologia', 'física', 'fisica', 'química', 'quimica'],
            'humanities' => ['humanas', 'história', 'historia', 'geografia', 'sociologia', 'filosofia'],
            'languages' => ['linguagens', 'linguagen', 'português', 'portugues', 'códigos', 'codigos', 'inglês', 'ingles', 'english', 'espanhol', 'spanish'],
        ];
        foreach ($keywords as $category => $terms) {
            foreach ($terms as $term) {
                if (str_contains($subject, $term)) {
                    return $category;
                }
            }
        }

        return null;
    }
}
