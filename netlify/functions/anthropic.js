import { verifyToken, tokenFromEvent, loadCompany, effective } from "../lib/server.js";
import { planState } from "../../src/lib/plans.js";

export const handler = async function(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AI-Kind",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Try multiple env var names for compatibility
    const apiKey =
      process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_KEY ||
      process.env.VITE_ANTHROPIC_API_KEY ||
      process.env.VITE_ANTHROPIC_KEY ||
      process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      console.error("No API key found. Checked: ANTHROPIC_API_KEY, ANTHROPIC_KEY, VITE_ANTHROPIC_API_KEY, VITE_ANTHROPIC_KEY, CLAUDE_API_KEY");
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: { message: "API key not configured. Configure ANTHROPIC_API_KEY ou ANTHROPIC_KEY no painel do Netlify (Site configuration > Environment variables)." } })
      };
    }

    // Só responde para quem está logado numa empresa com plano ativo
    let session;
    try { session = verifyToken(tokenFromEvent(event)); } catch (e) { return { statusCode: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: { message: e.message } }) }; }
    const company = await loadCompany(session.cid, "id, plan_id, status, trial_ends_at, app_data");
    const ec = effective(company); const st = planState({ ...ec, extras: ec.app_data?._srv?.extras });
    const kind = (event.headers["x-ai-kind"] || event.headers["X-AI-Kind"] || "extract").toLowerCase();
    const deny = (m) => ({ statusCode: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: { message: m } }) });
    if (st.locked) return deny("Seu plano está vencido. Renove para usar a IA.");
    if (kind === "brain" && !st.features.brain) return deny("O Cérebro está disponível no plano Ultra.");
    if (kind === "sales" && !st.features.crm) return deny("A IA de vendas está disponível no plano Ultra.");

    const requestBody = JSON.parse(event.body);

    // Tenta o modelo pedido e, se ele não existir na conta, cai para os próximos
    const wanted = requestBody.model && !/claude-3/.test(requestBody.model) ? requestBody.model : "claude-sonnet-4-6";
    const candidates = [...new Set([wanted, "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"])];
    let response;
    for (const model of candidates) {
      requestBody.model = model;
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(requestBody)
      });
      if (response.status !== 404) break;
    }

    const data = await response.json();

    if (!response.ok) {
        return {
          statusCode: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({ error: { message: `Anthropic API Error (${response.status}): ${JSON.stringify(data.error || data)}` } })
        };
    }

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Anthropic function error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: { message: error.message || "Internal Server Error" } })
    };
  }
};
