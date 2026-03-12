const fetch = require('node-fetch'); // will use built in if node 18+

async function test() {
  const sys = `Você extrai dados de pedidos de brinquedos infláveis. Retorne APENAS JSON válido sem markdown:
{
"orderNumber":"número do pedido (ex: PED-042) se encontrado",
"clientName":"nome do cliente/empresa",
"voltage":"110V ou 220V",
"deadline":"YYYY-MM-DD",
"seller":"nome do representante/vendedor",
"items":[{"toy":"nome","colors":["cor1"],"price":0,"observations":"obs","isMotor":false}]
}`;
  const content = `Extraia os dados:\n\nVendedor: Luan. Cliente: Festa Max. Prazo: 2026-10-10. Brinquedo: Piscina de Bolinhas, Azul. Preço: 1500`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "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",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 2000,
        system: sys,
        messages: [{ role: "user", content }]
      })
    });
    const d = await res.json();
    console.log(JSON.stringify(d, null, 2));
  } catch(e) {
    console.error(e);
  }
}
test();
