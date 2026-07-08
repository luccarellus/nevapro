-- Adiciona colunas de XP/progresso à tabela admin_users para permitir
-- que admins também acumulem XP ao testar o sistema

ALTER TABLE public.admin_users 
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS answered_questions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_answers INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flash_quiz_completed BOOLEAN DEFAULT false;
