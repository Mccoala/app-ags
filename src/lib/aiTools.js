// Ferramentas que a IA usa para consultar os dados do app com números EXATOS.
// A IA decide qual chamar; o cálculo é feito aqui no navegador (sem estimativa).
import { sameSeller, norm, orderNumber, matchQuery, todayStr, daysBetween } from "./core";
import { clientUF, UF_NAMES } from "./geo";
import { loadCities, locateCity, distanceKm } from "./cities";

const STAGES = [["cutter", "corte"], ["tailor", "costura"], ["prep", "preparacao"], ["assembler", "montagem"]];
const finStage = (f) => f?.stage || (f?.done ? "finalizado" : (f ? "pendente" : ""));
const mon = (d) => (d || "").slice(0, 7);
const prevMonth = (m) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// Uma linha por item de pedido, com tudo que se sabe dele
export function itemRows(data) {
  const clients = data.clients || [];
  const rows = [];
  (data.orders || []).forEach(o => {
    const c = clients.find(x => norm(x.name) === norm(o.clientName)) || {};
    (o.items || []).forEach(it => {
      const p = (data.production || []).find(x => x.itemId === it.itemId) || {};
      const f = (data.finalization || []).find(x => x.itemId === it.itemId);
      const colors = Array.isArray(it.colors) ? it.colors.join(", ") : (it.colors || "");
      rows.push({
        pedido: orderNumber(o.id), cliente: o.clientName, vendedor: o.seller || "", data_venda: o.createdAt || "", mes_venda: mon(o.createdAt),
        prazo: o.deadline || "", status_pedido: o.status, prioridade: !!o.priority, voltagem: o.voltage,
        item: it.toy || "", motor: !!it.isMotor, cores: colors, obs: it.observations || "", valor: Number(it.price) || 0,
        uf: clientUF(c) || "", cidade: c.city || "",
        corte: p.cutter || "", costura: p.tailor || "", preparacao: p.prep || "", montagem: p.assembler || "",
        producao_pct: STAGES.filter(([k]) => p[k]).length * 25,
        finalizador: f?.finalizer || "", finalizacao: it.isMotor ? "" : finStage(f), data_finalizado: f?.finDate || "",
        _hay: norm([it.toy, colors, it.observations, it.isMotor ? "motor" : ""].join(" ")),
      });
    });
  });
  return rows;
}

const pick = (r) => { const { _hay, ...rest } = r; return rest; };

function applyFilters(rows, a) {
  return rows.filter(r => {
    if (!a.incluir_motores && r.motor && !a.somente_motores) return false;
    if (a.somente_motores && !r.motor) return false;
    if (a.texto && !matchQuery(r._hay, "", a.texto)) return false;
    if (a.vendedor && !sameSeller(a._sellers, r.vendedor, a.vendedor)) return false;
    if (a.cliente && !norm(r.cliente).includes(norm(a.cliente))) return false;
    if (a.uf && r.uf !== String(a.uf).toUpperCase()) return false;
    if (a.cidade && !norm(r.cidade).includes(norm(a.cidade))) return false;
    if (a.mes && r.mes_venda !== a.mes) return false;
    if (a.de && r.data_venda < a.de) return false;
    if (a.ate && r.data_venda > a.ate) return false;
    if (a.status && r.status_pedido !== a.status) return false;
    if (a.pedido && r.pedido !== orderNumber(a.pedido)) return false;
    if (a.atrasados && !(r.prazo && r.prazo < todayStr() && r.status_pedido !== "concluido")) return false;
    return true;
  });
}

const GROUP_KEYS = { vendedor: "vendedor", mes: "mes_venda", item: "item", brinquedo: "item", uf: "uf", estado: "uf", cidade: "cidade", cliente: "cliente", status: "status_pedido", pedido: "pedido", costura: "costura", corte: "corte", preparacao: "preparacao", montagem: "montagem", finalizador: "finalizador", finalizacao: "finalizacao", cor: "cores" };

export const TOOLS = [
  {
    name: "buscar_itens",
    description: "Conta e lista ITENS vendidos (cada brinquedo de cada pedido é um item; motores ficam de fora a menos que incluir_motores=true). Use para: quantos X foram vendidos, quantos por vendedor/mês/estado, quantos têm logo, faturamento por item, etc. 'texto' faz busca inteligente no nome do item, cores e observações (ex.: 'fut 10x5', 'logo', 'tobogã laranja'). Pedidos com vários itens contam cada item.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Busca no nome/cores/observações do item. Ex.: 'fut 10x5', 'logo', 'escorrega azul'" },
        vendedor: { type: "string" }, cliente: { type: "string" }, uf: { type: "string", description: "Sigla do estado" }, cidade: { type: "string" },
        mes: { type: "string", description: "Mês da venda AAAA-MM" }, de: { type: "string", description: "Data inicial AAAA-MM-DD" }, ate: { type: "string", description: "Data final AAAA-MM-DD" },
        status: { type: "string", enum: ["aguardando", "producao", "concluido"] }, pedido: { type: "string" }, atrasados: { type: "boolean" },
        incluir_motores: { type: "boolean" }, somente_motores: { type: "boolean" },
        agrupar_por: { type: "string", enum: Object.keys(GROUP_KEYS), description: "Agrupa o resultado (conta itens e soma valores por grupo)" },
        limite_lista: { type: "number", description: "Quantos itens listar (padrão 15, máx. 80)" }
      }
    }
  },
  {
    name: "producao_por_pessoa",
    description: "Quantos itens cada pessoa da equipe fez em cada etapa (corte, costura, preparação, montagem, finalização), por mês. Use para 'quantos brinquedos fulano costurou este mês x mês passado' e para avaliar rendimento. As datas das etapas só existem para trabalhos registrados depois da atualização de 26/10/2026; os anteriores aparecem como 'sem_data'.",
    input_schema: {
      type: "object",
      properties: {
        pessoa: { type: "string", description: "Nome (opcional)" },
        etapa: { type: "string", enum: ["corte", "costura", "preparacao", "montagem", "finalizacao"] },
        meses: { type: "array", items: { type: "string" }, description: "Lista de meses AAAA-MM para comparar. Se vazio, usa este mês e o anterior." }
      }
    }
  },
  {
    name: "resumo_pedidos",
    description: "Resumo de PEDIDOS (não itens): quantidade, faturamento, ticket médio, abertos/atrasados/concluídos, opcionalmente filtrado e agrupado. Use para faturamento por mês/vendedor/estado e comparações.",
    input_schema: {
      type: "object",
      properties: {
        vendedor: { type: "string" }, mes: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, uf: { type: "string" }, cliente: { type: "string" },
        agrupar_por: { type: "string", enum: ["vendedor", "mes", "uf", "cidade", "cliente", "status"] }
      }
    }
  },
  {
    name: "detalhe_pedido",
    description: "Mostra tudo de um pedido pelo número: cliente, vendedor, itens, cores, observações, produção por etapa, finalização.",
    input_schema: { type: "object", properties: { numero: { type: "string" } }, required: ["numero"] }
  },
  {
    name: "dados_mapa",
    description: "Dados geográficos: clientes, pedidos, brinquedos e faturamento por estado e cidade; localização da fábrica e distância (em linha reta) de cada cliente até a fábrica.",
    input_schema: { type: "object", properties: { uf: { type: "string" }, vendedor: { type: "string" }, ordenar_por_distancia: { type: "boolean" } } }
  },
  {
    name: "clientes",
    description: "Lista clientes com contato, cidade/UF, vendedor, nº de pedidos, total comprado, última compra e dias sem comprar. Use para CRM, clientes inativos, melhores clientes.",
    input_schema: { type: "object", properties: { vendedor: { type: "string" }, uf: { type: "string" }, sem_comprar_ha_dias: { type: "number", description: "Só clientes que não compram há pelo menos N dias" }, limite: { type: "number" } } }
  },
  {
    name: "salvar_no_cerebro",
    description: "Guarda uma informação/insight importante no Cérebro da empresa (memória permanente que aparece no mapa de conhecimento). Use quando descobrir algo útil para o gerente lembrar depois. Não guarde coisas triviais.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto (até 60 caracteres)" },
        texto: { type: "string", description: "O conhecimento em 1-3 frases, com números" },
        tipo: { type: "string", enum: ["insight", "alerta", "meta", "fato"] },
        ligado_a: { type: "array", items: { type: "string" }, description: "Nomes de vendedores, clientes, brinquedos, pessoas da equipe ou estados relacionados" }
      },
      required: ["titulo", "texto"]
    }
  }
];

function groupRows(rows, key, valueField = "valor") {
  const g = {};
  rows.forEach(r => { const k = r[key] || "(vazio)"; g[k] = g[k] || { quantidade: 0, valor: 0 }; g[k].quantidade++; g[k].valor += Number(r[valueField]) || 0; });
  return Object.entries(g).sort((a, b) => b[1].quantidade - a[1].quantidade).map(([k, v]) => ({ grupo: k, ...v }));
}

export async function runTool(name, input, data, { onSaveNote } = {}) {
  const a = input || {};
  const today = todayStr();
  if (name === "buscar_itens") {
    const rows = applyFilters(itemRows(data), { ...a, _sellers: data.sellers });
    const out = { total_itens: rows.length, valor_total: rows.reduce((s, r) => s + r.valor, 0), pedidos_distintos: new Set(rows.map(r => r.pedido)).size };
    if (a.agrupar_por) out.grupos = groupRows(rows, GROUP_KEYS[a.agrupar_por] || a.agrupar_por);
    out.lista = rows.slice(0, Math.min(80, a.limite_lista || 15)).map(pick);
    if (rows.length > out.lista.length) out.obs = `Lista mostra ${out.lista.length} de ${rows.length}.`;
    return out;
  }
  if (name === "producao_por_pessoa") {
    const meses = a.meses?.length ? a.meses : [mon(today), prevMonth(mon(today))];
    const res = {};
    const add = (pessoa, etapa, date) => {
      if (a.pessoa && !norm(pessoa).includes(norm(a.pessoa))) return;
      if (a.etapa && a.etapa !== etapa) return;
      const m = date ? mon(date) : "sem_data";
      res[pessoa] = res[pessoa] || {};
      res[pessoa][etapa] = res[pessoa][etapa] || { total_geral: 0, sem_data: 0 };
      const e = res[pessoa][etapa];
      e.total_geral++;
      if (m === "sem_data") e.sem_data++;
      else if (meses.includes(m)) e[m] = (e[m] || 0) + 1;
    };
    (data.production || []).forEach(p => STAGES.forEach(([k, etapa]) => p[k] && add(p[k], etapa, p[`${k}At`])));
    (data.finalization || []).forEach(f => f.finalizer && finStage(f) === "finalizado" && add(f.finalizer, "finalizacao", f.finDate));
    const team = (data.team || []).map(t => ({ nome: t.name, funcao: t.role, status: t.status }));
    return { meses_comparados: meses, por_pessoa: res, equipe: team, nota: "Cada número é a quantidade de itens (brinquedos) em que a pessoa foi responsável pela etapa naquele mês." };
  }
  if (name === "resumo_pedidos") {
    const clients = data.clients || [];
    let os = (data.orders || []).map(o => { const c = clients.find(x => norm(x.name) === norm(o.clientName)) || {}; return { ...o, _uf: clientUF(c) || "", _cidade: c.city || "" }; });
    if (a.vendedor) os = os.filter(o => sameSeller(data.sellers, o.seller, a.vendedor));
    if (a.mes) os = os.filter(o => mon(o.createdAt) === a.mes);
    if (a.de) os = os.filter(o => (o.createdAt || "") >= a.de);
    if (a.ate) os = os.filter(o => (o.createdAt || "") <= a.ate);
    if (a.uf) os = os.filter(o => o._uf === String(a.uf).toUpperCase());
    if (a.cliente) os = os.filter(o => norm(o.clientName).includes(norm(a.cliente)));
    const sum = (l) => l.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
    const out = { pedidos: os.length, faturamento: sum(os), ticket_medio: os.length ? Math.round(sum(os) / os.length) : 0, abertos: os.filter(o => o.status !== "concluido").length, atrasados: os.filter(o => o.status !== "concluido" && o.deadline && o.deadline < today).length, concluidos: os.filter(o => o.status === "concluido").length };
    if (a.agrupar_por) {
      const key = { vendedor: o => o.seller || "(sem vendedor)", mes: o => mon(o.createdAt), uf: o => o._uf || "(sem UF)", cidade: o => o._cidade || "(sem cidade)", cliente: o => o.clientName, status: o => o.status }[a.agrupar_por];
      const g = {}; os.forEach(o => { const k = key(o); g[k] = g[k] || { pedidos: 0, faturamento: 0 }; g[k].pedidos++; g[k].faturamento += Number(o.totalPrice) || 0; });
      out.grupos = Object.entries(g).sort((x, y) => y[1].faturamento - x[1].faturamento).map(([k, v]) => ({ grupo: k, ...v }));
    }
    return out;
  }
  if (name === "detalhe_pedido") {
    const o = (data.orders || []).find(x => orderNumber(x.id) === orderNumber(a.numero));
    if (!o) return { erro: `Pedido ${a.numero} não encontrado.` };
    return { pedido: orderNumber(o.id), cliente: o.clientName, vendedor: o.seller, criado: o.createdAt, prazo: o.deadline, status: o.status, prioridade: !!o.priority, valor_total: o.totalPrice, itens: itemRows({ ...data, orders: [o] }).map(pick) };
  }
  if (name === "dados_mapa") {
    const clients = data.clients || [];
    const cities = await loadCities().catch(() => null);
    const factory = data.settings?.factory || null;
    const st = {};
    const perClient = [];
    const byClient = {};
    (data.orders || []).filter(o => !a.vendedor || sameSeller(data.sellers, o.seller, a.vendedor)).forEach(o => {
      const k = norm(o.clientName);
      byClient[k] = byClient[k] || { nome: o.clientName, pedidos: 0, brinquedos: 0, faturamento: 0 };
      byClient[k].pedidos++; byClient[k].faturamento += Number(o.totalPrice) || 0; byClient[k].brinquedos += (o.items || []).filter(i => !i.isMotor).length;
    });
    Object.values(byClient).forEach(bc => {
      const c = clients.find(x => norm(x.name) === norm(bc.nome)) || {};
      const uf = clientUF(c) || "";
      if (a.uf && uf !== String(a.uf).toUpperCase()) return;
      const city = cities ? locateCity(cities, c.city, c.state) : null;
      const pos = c.lat ? { lat: c.lat, lng: c.lng } : city;
      const dist = factory && pos ? Math.round(distanceKm(factory, pos)) : null;
      perClient.push({ ...bc, cidade: c.city || "", uf, distancia_fabrica_km: dist });
      const s = st[uf || "(sem UF)"] = st[uf || "(sem UF)"] || { estado: UF_NAMES[uf] || "(sem estado)", clientes: 0, pedidos: 0, brinquedos: 0, faturamento: 0, cidades: {} };
      s.clientes++; s.pedidos += bc.pedidos; s.brinquedos += bc.brinquedos; s.faturamento += bc.faturamento;
      const cn = c.city || "(sem cidade)"; s.cidades[cn] = (s.cidades[cn] || 0) + bc.pedidos;
    });
    if (a.ordenar_por_distancia) perClient.sort((x, y) => (x.distancia_fabrica_km ?? 1e9) - (y.distancia_fabrica_km ?? 1e9));
    else perClient.sort((x, y) => y.faturamento - x.faturamento);
    return { fabrica: factory ? { cidade: factory.city, lat: factory.lat, lng: factory.lng } : "não cadastrada", por_estado: st, clientes: perClient.slice(0, 120), obs: "Distância em linha reta; pela estrada costuma ser 20–30% maior." };
  }
  if (name === "clientes") {
    const map = {};
    (data.orders || []).forEach(o => {
      if (a.vendedor && !sameSeller(data.sellers, o.seller, a.vendedor)) return;
      const k = norm(o.clientName);
      map[k] = map[k] || { nome: o.clientName, pedidos: 0, total: 0, ultima_compra: "", vendedores: new Set() };
      map[k].pedidos++; map[k].total += Number(o.totalPrice) || 0; if ((o.createdAt || "") > map[k].ultima_compra) map[k].ultima_compra = o.createdAt; if (o.seller) map[k].vendedores.add(o.seller);
    });
    let list = Object.values(map).map(x => { const c = (data.clients || []).find(y => norm(y.name) === norm(x.nome)) || {}; return { ...x, vendedores: [...x.vendedores], telefone: c.phone || "", cidade: c.city || "", uf: clientUF(c) || "", dias_sem_comprar: x.ultima_compra ? daysBetween(x.ultima_compra, today) : null, crm: c.crm || undefined }; });
    if (a.uf) list = list.filter(x => x.uf === String(a.uf).toUpperCase());
    if (a.sem_comprar_ha_dias) list = list.filter(x => (x.dias_sem_comprar ?? 0) >= a.sem_comprar_ha_dias);
    list.sort((x, y) => y.total - x.total);
    return { total: list.length, clientes: list.slice(0, Math.min(100, a.limite || 40)) };
  }
  if (name === "salvar_no_cerebro") {
    const note = { id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`, titulo: String(a.titulo || "").slice(0, 80), texto: String(a.texto || ""), tipo: a.tipo || "insight", ligado_a: a.ligado_a || [], criado: new Date().toISOString() };
    onSaveNote && onSaveNote(note);
    return { ok: true, guardado: note.titulo };
  }
  return { erro: `Ferramenta desconhecida: ${name}` };
}

// Contexto curto que vai junto com a pergunta (o resto a IA busca pelas ferramentas)
export function brainContext(data) {
  const orders = data.orders || [];
  const months = [...new Set(orders.map(o => mon(o.createdAt)).filter(Boolean))].sort();
  return {
    hoje: todayStr(),
    mes_atual: mon(todayStr()),
    meses_com_vendas: months,
    total_pedidos: orders.length,
    vendedores: (data.sellers || []).map(s => s.name),
    equipe: (data.team || []).map(t => `${t.name} (${t.role}${t.status !== "ativo" ? ", inativo" : ""})`),
    fabrica: data.settings?.factory?.city || "não cadastrada",
    memorias_do_cerebro: (data.brain?.notes || []).slice(-40).map(n => `[${(n.criado || "").slice(0, 10)}] ${n.titulo}: ${n.texto}`),
  };
}
