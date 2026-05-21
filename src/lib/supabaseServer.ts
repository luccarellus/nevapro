import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// No servidor usamos a Service Role Key para bypassar RLS se necessário
// Sanitizar URL (remover barra final e segmentos de API se existirem)
let supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Limpeza agressiva da URL
if (supabaseUrl) {
  // Remove qualquer coisa após o domínio principal se vier colado (ex: /rest/v1, /auth/v1)
  supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, '');
  supabaseUrl = supabaseUrl.replace(/\/auth\/v1\/?$/, '');
  supabaseUrl = supabaseUrl.replace(/\/$/, ''); // Remove barra final
}

const isValidUrl = supabaseUrl.startsWith('http');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[Supabase Server] ERRO: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.');
} else if (!isValidUrl) {
  console.error(`[Supabase Server] ERRO: URL "${supabaseUrl}" não parece correta.`);
} else {
  console.log(`[Supabase Server] Inicializado para: ${supabaseUrl.substring(0, 30)}...`);
}

const finalUrl = isValidUrl ? supabaseUrl : 'https://placeholder.supabase.co';
const finalAdminKey = supabaseServiceKey || 'placeholder_admin_key';
const finalAnonKey = supabaseAnonKey || 'placeholder_anon_key';

// Cliente Admin (para operações de banco com privilégios elevados)
export const supabaseAdmin = createClient(
  finalUrl,
  finalAdminKey
);

// Cliente de validação (usa a anon key para checar credenciais de usuários)
export const supabaseAuthVerifier = createClient(
  finalUrl,
  finalAnonKey
);
