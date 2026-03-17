import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Variáveis de ambiente do Supabase não encontradas. Inicializando cliente offline seguro.');
  // Mock client to prevent crashing when calling supabase.from() or .channel()
  supabaseClient = {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: new Error('offline') }) }) }),
      upsert: () => Promise.resolve({ data: null, error: new Error('offline') })
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => ({})
      })
    }),
    removeChannel: () => {}
  };
} else {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = supabaseClient;
