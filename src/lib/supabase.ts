import { createClient } from '@supabase/supabase-js';

// Essas variáveis devem ser configuradas no painel de Segredos/Ambiente
let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Limpeza agressiva da URL para evitar erros de "Invalid Path"
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');
  supabaseUrl = supabaseUrl.replace(/\/auth\/v1\/?$/, '');
  supabaseUrl = supabaseUrl.replace(/\/$/, '');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL ou Anon Key não encontrados. Verifique as variáveis de ambiente.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder_anon_key'
);
