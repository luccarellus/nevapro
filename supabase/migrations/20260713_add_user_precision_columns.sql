-- Adiciona os campos usados para calcular a precisao dos alunos.
-- A coluna accuracy_percent e gerada automaticamente a partir dos contadores.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS answered_questions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_answers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS accuracy_percent NUMERIC(5,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN answered_questions > 0
        THEN ROUND((correct_answers::numeric / answered_questions::numeric) * 100, 2)
      ELSE 0
    END
  ) STORED;

ALTER TABLE public.admin_users
  DROP COLUMN IF EXISTS accuracy_percent;

-- Conferencia:
SELECT table_name, column_name, data_type, is_generated
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'answered_questions',
    'correct_answers',
    'streak',
    'accuracy_percent'
  )
ORDER BY table_name, column_name;
