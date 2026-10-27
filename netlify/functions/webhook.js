import { createClient } from '@supabase/supabase-js';

export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Só aceita avisos de pagamento com a senha combinada (WEBHOOK_SECRET no Netlify).
  // Sem ela o webhook fica desligado — evita alguém liberar plano com um aviso falso.
  const secret = process.env.WEBHOOK_SECRET;
  const given = (event.queryStringParameters || {}).token || (event.headers || {})['x-webhook-token'];
  if (!secret) return { statusCode: 200, body: 'Webhook desligado (configure WEBHOOK_SECRET)' };
  if (given !== secret) return { statusCode: 401, body: 'Unauthorized' };

  try {
    const payload = JSON.parse(event.body);
    
    const companyId = payload.sck || payload.reference || (payload.metadata && payload.metadata.sck);
    const eventType = payload.event || payload.status || 'paid';

    if (!companyId) {
       return { statusCode: 400, body: 'Missing company reference (sck/reference)' };
    }

    if (eventType === 'paid' || eventType === 'pagamento_aprovado' || eventType === 'approved') {
       const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
       // Idealmente VITE_SUPABASE_SERVICE_ROLE_KEY em produção (no Netlify)
       const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY; 
       
       if (!supabaseUrl || !supabaseKey) {
          return { statusCode: 500, body: 'Supabase credentials missing on server' };
       }

       const supabase = createClient(supabaseUrl, supabaseKey);

       // Atualiza empresa liberando o premium temporariamente. Se o plano for variável, checar valor ou product_id da GGCheckout.
       // plano vindo do produto (ex.: metadata.plan = essencial | pro | ultra); a conta do criador nunca muda
       const plan = ['essencial', 'pro', 'ultra'].includes(String(payload.plan || payload.metadata?.plan || '').toLowerCase()) ? String(payload.plan || payload.metadata?.plan).toLowerCase() : null;
       if (!plan) return { statusCode: 200, body: 'Plano não informado — nada alterado' };
       await supabase.from('companies').update({ status: 'active', plan_id: plan }).eq('id', companyId).neq('plan_id', 'creator');

       return { statusCode: 200, body: 'Webhook processed successfully' };
    }

    return { statusCode: 200, body: 'Event ignored' };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
