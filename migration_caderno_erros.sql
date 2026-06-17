-- Script de migração para o Caderno de Erros
-- Altera a chave primária de public.questions e chaves estrangeiras relacionadas para VARCHAR(255)

BEGIN;

-- 1. Remover chaves estrangeiras existentes temporariamente
ALTER TABLE public.question_options DROP CONSTRAINT IF EXISTS question_options_question_id_fkey;
ALTER TABLE public.simulado_questions DROP CONSTRAINT IF EXISTS simulado_questions_question_id_fkey;
ALTER TABLE public.answers DROP CONSTRAINT IF EXISTS answers_question_id_fkey;

-- 2. Alterar o tipo da coluna 'id' em public.questions para VARCHAR(255)
ALTER TABLE public.questions ALTER COLUMN id TYPE VARCHAR(255);

-- 3. Alterar as chaves estrangeiras correspondentes para VARCHAR(255)
ALTER TABLE public.question_options ALTER COLUMN question_id TYPE VARCHAR(255);
ALTER TABLE public.simulado_questions ALTER COLUMN question_id TYPE VARCHAR(255);
ALTER TABLE public.answers ALTER COLUMN question_id TYPE VARCHAR(255);

-- 4. Garantir que a tabela public.answers tenha a coluna selected_option_index
ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS selected_option_index INTEGER;

-- 5. Recriar as chaves estrangeiras referenciando a tabela questions
ALTER TABLE public.question_options 
  ADD CONSTRAINT question_options_question_id_fkey 
  FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE public.simulado_questions 
  ADD CONSTRAINT simulado_questions_question_id_fkey 
  FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE public.answers 
  ADD CONSTRAINT answers_question_id_fkey 
  FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

COMMIT;
