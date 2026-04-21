const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

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
       const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY; 
       
       if (!supabaseUrl || !supabaseKey) {
          return { statusCode: 500, body: 'Supabase credentials missing on server' };
       }

       const supabase = createClient(supabaseUrl, supabaseKey);

       // Atualiza empresa liberando o premium temporariamente. Se o plano for variável, checar valor ou product_id da GGCheckout.
       await supabase.from('companies').update({
          status: 'active',
          plan_id: 'premium'
       }).eq('id', companyId);

       return { statusCode: 200, body: 'Webhook processed successfully' };
    }

    return { statusCode: 200, body: 'Event ignored' };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
