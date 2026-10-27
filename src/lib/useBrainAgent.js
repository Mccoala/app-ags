import { useEffect, useRef, useState } from "react";
import { callClaude, moneyScope, scrubForUser, redactMoney } from "./core";
import { TOOLS, runTool, brainContext } from "./aiTools";

export const TOOL_LABEL = { buscar_itens: "Contando itens", listar_pedidos: "Listando pedidos", producao_por_pessoa: "Produção por pessoa", resumo_pedidos: "Resumo de pedidos", detalhe_pedido: "Abrindo pedido", dados_mapa: "Dados do mapa", clientes: "Clientes", historico: "Histórico de ações", salvar_no_cerebro: "Guardando no cérebro" };

const BASE = `Você é o CÉREBRO do Inflatudo, o sistema de gestão de uma fábrica de brinquedos infláveis. Responde sobre qualquer informação do app: pedidos, itens, vendedores, clientes, produção (corte, costura, preparação, montagem), finalização, equipe, histórico de ações (quem editou o quê), mapa/estados/cidades/distâncias.

REGRAS:
- Para qualquer número, USE AS FERRAMENTAS. Nunca estime nem conte de cabeça. Chame quantas forem necessárias.
- "Brinquedos" = itens que não são motor. Um pedido pode ter vários itens.
- "Logo", medidas como "10x5", cores → buscar_itens com o campo texto.
- Rendimento de pessoas → producao_por_pessoa. Se houver muitos "sem_data", avise que as datas só passaram a ser gravadas recentemente.
- "Meu", "eu", "editei" referem-se ao USUÁRIO ATUAL (veja abaixo). Para "o que eu editei / último pedido que mexi" use historico com usuario = nome do usuário atual.
- Responda em português do Brasil, direto, com números em **negrito** e listas curtas. Termine com 1 linha prática.`;

function rulesFor(user, scope, allowSave) {
  const who = user?.role === "admin" ? `gerente/dono da empresa (${user?.name || "gerente"})` : `${user?.name || "usuário"}${user?.sellerName ? ` — vendedor ${user.sellerName}` : ""}`;
  const money = scope === "all" ? "Pode falar de valores (R$) normalmente."
    : scope === "own" ? `Você só enxerga os pedidos, brinquedos, clientes, valores, produção e fotos de ${user.sellerName}. É PROIBIDO falar de qualquer pedido, brinquedo, cliente, valor ou venda de OUTRO vendedor — nem confirmar se existem. Se perguntarem sobre outro vendedor, a empresa toda ou rankings entre vendedores, responda que só pode falar dos dados de ${user.sellerName}. "A fábrica", "a produção" = só os pedidos deste vendedor.`
      : "NUNCA fale de valores em dinheiro (R$, faturamento, preço, ticket). Esta pessoa cuida da produção: fale só de quantidades, prazos, etapas e pessoas.";
  const save = allowSave ? "Quando descobrir algo realmente útil, guarde com salvar_no_cerebro (no máximo 2 por resposta)." : "Não guarde nada no cérebro.";
  return `\n\nUSUÁRIO ATUAL: ${who}.\n${money}\n${save}`;
}

// Motor da conversa com a IA (usado no painel do Cérebro e no botão flutuante)
export function useBrainAgent({ data, user, persist, allowSave = false, storageKey = "brain-chat", onNoteSaved }) {
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || "[]"); } catch { return []; } });
  const [busy, setBusy] = useState(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(msgs.slice(-30))); } catch { } }, [msgs, storageKey]);
  const scope = moneyScope(user);

  const saveNote = (note) => {
    if (!allowSave || !persist) return;
    const cur = dataRef.current;
    const nd = { ...cur, brain: { ...(cur.brain || {}), notes: [...(cur.brain?.notes || []), note] } };
    dataRef.current = nd; persist(nd);
    onNoteSaved && onNoteSaved(note);
  };

  const ask = async (question, { noSave = false } = {}) => {
    const q = String(question || "").trim(); if (!q || busy) return;
    const canSave = allowSave && !noSave;
    const tools = TOOLS.filter(t => canSave || t.name !== "salvar_no_cerebro");
    const history = msgs.filter(m => !m.error).slice(-8).map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: q }]);
    const apiMsgs = [...history, { role: "user", content: q }];
    const used = [];
    let model = "claude-sonnet-4-6";
    try {
      for (let step = 0; step < 10; step++) {
        setBusy(step ? `Pensando… (${used.length} consulta${used.length === 1 ? "" : "s"})` : "Pensando…");
        const view = scrubForUser(dataRef.current, user);
        const system = `${BASE}${rulesFor(user, scope, canSave)}${noSave ? "\nEsta é uma análise pontual: NÃO salve nada no cérebro." : ""}\n\nCONTEXTO RÁPIDO (JSON):\n${JSON.stringify(scope === "none" ? redactMoney(brainContext(view)) : brainContext(view))}`;
        let d;
        try { d = await callClaude({ model, system, messages: apiMsgs, tools, max_tokens: 1400 }); }
        catch (e) { if (model !== "claude-haiku-4-5" && /demorou|respondeu/.test(e.message)) { model = "claude-haiku-4-5"; d = await callClaude({ model, system, messages: apiMsgs, tools, max_tokens: 1200 }); } else throw e; }
        apiMsgs.push({ role: "assistant", content: d.content });
        const calls = (d.content || []).filter(c => c.type === "tool_use");
        if (d.stop_reason !== "tool_use" || !calls.length) {
          const text = (d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
          setMsgs(m => [...m, { role: "assistant", content: text || "Pronto.", tools: used }]);
          break;
        }
        const results = [];
        for (const c of calls) {
          setBusy(`${TOOL_LABEL[c.name] || c.name}…`);
          used.push({ name: c.name, input: c.input });
          let r;
          try {
            if (c.name === "salvar_no_cerebro" && !canSave) r = { erro: "Salvar no cérebro não está liberado aqui." };
            else r = await runTool(c.name, c.input, scrubForUser(dataRef.current, user), { onSaveNote: saveNote, user });
            if (scope === "none") r = redactMoney(r);
          } catch (e) { r = { erro: e.message }; }
          let s = JSON.stringify(r); if (s.length > 60000) s = s.slice(0, 60000) + "…(cortado)";
          results.push({ type: "tool_result", tool_use_id: c.id, content: s });
        }
        apiMsgs.push({ role: "user", content: results });
      }
    } catch (e) {
      setMsgs(m => [...m, { role: "assistant", content: `⚠️ Não consegui responder agora: ${e.message}`, error: true }]);
    }
    setBusy(null);
  };

  return { msgs, setMsgs, ask, busy, scope };
}
