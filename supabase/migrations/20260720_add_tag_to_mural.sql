ALTER TABLE public.mural
ADD COLUMN IF NOT EXISTS tag VARCHAR(100);

NOTIFY pgrst, 'reload schema';
