-- Sincroniza todos os usuários existentes no auth.users para a tabela admin_users
-- Apenas insere se o email não existir como admin nem como estudante (public.users)

INSERT INTO public.admin_users (id, email, name, role, auth_user_id, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  au.email,
  COALESCE(
    au.raw_user_meta_data->>'name',
    au.raw_user_meta_data->>'full_name',
    split_part(au.email, '@', 1)
  ),
  'admin',
  au.id,
  NOW(),
  NOW()
FROM auth.users au
WHERE au.email NOT IN (SELECT email FROM public.admin_users WHERE email IS NOT NULL)
  AND au.email NOT IN (SELECT email FROM public.users WHERE email IS NOT NULL)
ON CONFLICT (email) DO NOTHING;

-- Também atualiza auth_user_id para admins existentes que ainda não têm o vínculo
UPDATE public.admin_users a
SET auth_user_id = au.id, updated_at = NOW()
FROM auth.users au
WHERE a.email = au.email
  AND a.auth_user_id IS NULL;
