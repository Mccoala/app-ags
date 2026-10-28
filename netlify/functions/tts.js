import { verifyToken, tokenFromEvent, loadCompany, effective } from "../lib/server.js";
import { planState } from "../../src/lib/plans.js";

// ── Voz do Cérebro ────────────────────────────────────────────────────────────
// Recebe o texto da resposta e devolve o áudio (mp3) numa voz natural.
// Funciona com a chave que estiver configurada na Netlify:
//   ELEVENLABS_API_KEY  (vozes mais naturais; ELEVENLABS_VOICE_F / ELEVENLABS_VOICE_M opcionais)
//   OPENAI_API_KEY      (bem barato; OPENAI_TTS_VOICE_F / OPENAI_TTS_VOICE_M opcionais)
// Sem nenhuma chave, os botões de voz ficam escondidos (sem voz robótica do aparelho).

const J = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const handler = async (event) => {
  // GET: só diz se a voz natural está ligada (a tela esconde os botões de voz quando não está)
  if (event.httpMethod === "GET") return J(200, { natural: !!(process.env.ELEVENLABS_API_KEY || process.env.OPENAI_API_KEY) });
  if (event.httpMethod !== "POST") return J(405, { error: { message: "Method Not Allowed" } });
  let s;
  try { s = verifyToken(tokenFromEvent(event)); } catch (e) { return J(401, { error: { message: e.message } }); }
  const c = await loadCompany(s.cid, "id, plan_id, status, trial_ends_at, app_data");
  const ec = effective(c); const st = planState({ ...ec, extras: ec.app_data?._srv?.extras, billing: ec.app_data?._srv?.billing });
  if (st.locked) return J(402, { error: { message: "Plano vencido." } });
  if (!st.features.brain) return J(403, { error: { message: "O Cérebro por voz está disponível no plano Ultra." } });

  let body; try { body = JSON.parse(event.body || "{}"); } catch { return J(400, { error: { message: "Pedido inválido." } }); }
  const text = String(body.text || "").slice(0, 1500).trim();
  const male = body.voice === "m";
  if (!text) return J(400, { error: { message: "Sem texto." } });

  const audio = (buf, provider) => ({ statusCode: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voice-Provider": provider }, body: Buffer.from(buf).toString("base64"), isBase64Encoded: true });

  try {
    if (process.env.ELEVENLABS_API_KEY) {
      const voice = male ? (process.env.ELEVENLABS_VOICE_M || "onwK4e9ZLuTAKqWW03F9") : (process.env.ELEVENLABS_VOICE_F || "EXAVITQu4vr4xnSDxMaL");
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5", language_code: "pt", voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.05 } }),
      });
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return audio(await r.arrayBuffer(), "elevenlabs");
    }
    if (process.env.OPENAI_API_KEY) {
      const voice = male ? (process.env.OPENAI_TTS_VOICE_M || "ash") : (process.env.OPENAI_TTS_VOICE_F || "coral");
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts", voice, input: text, response_format: "mp3",
          instructions: "Fale em português do Brasil, com sotaque brasileiro natural, tom simpático e seguro de um assistente de negócios. Ritmo de conversa, sem pressa.",
        }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return audio(await r.arrayBuffer(), "openai");
    }
    return J(501, { error: { message: "Voz natural ainda não configurada.", code: "no_tts" } });
  } catch (e) {
    console.error("tts", e.message);
    return J(502, { error: { message: "A voz falhou agora.", code: "tts_failed" } });
  }
};
