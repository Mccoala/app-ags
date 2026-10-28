import { aiHeaders } from "./api";
// Funções compartilhadas do Inflatudo (busca, vendedores, IA, formatação)

export const SELLER_PALETTE = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#eab308", "#14b8a6", "#ef4444", "#6366f1", "#84cc16", "#06b6d4", "#f43f5e"];

export const moneyBR = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
export const dateBR = (ds) => {
  if (!ds) return "—";
  const [y, m, d] = String(ds).split("T")[0].split("-").map(Number);
  if (!y) return ds;
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
};
export const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
export const daysBetween = (a, b = todayStr()) => {
  if (!a) return null;
  const p = (s) => { const [y, m, d] = String(s).split("T")[0].split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
  return Math.round((p(b) - p(a)) / 86400000);
};

// Texto "normalizado": minúsculo, sem acento, "10 x 5" -> "10x5", pontuação vira espaço
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1x$2")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9.x]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Número do pedido sem prefixo e sem zeros à esquerda: "PED-01515" -> "1515"
export const orderNumber = (id) => {
  const digits = String(id ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits || String(id ?? "");
};

// Limpa o número que veio do documento: mantém exatamente como está escrito (sem inventar "PED-")
export function cleanOrderNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/\d[\d./-]*/);
  if (!m) return s;
  return m[0].replace(/[./-]+$/, "").replace(/^0+(?=\d)/, "");
}

const STOP = new Set(["ped", "pedido", "pedidos", "n", "no", "num", "numero", "nro", "de", "da", "do", "das", "dos", "e", "o", "a", "com", "para", "pra", "em", "cor", "cores"]);

// Junta tudo que pode ser buscado de um pedido num texto só
export function orderHaystack(o, extra = {}) {
  const items = (o.items || []).map(it => [it.toy, Array.isArray(it.colors) ? it.colors.join(" ") : it.colors, it.observations, it.isMotor ? "motor soprador" : ""].join(" ")).join(" ");
  const fin = extra.finalizer || "";
  const prod = extra.prod ? [extra.prod.cutter, extra.prod.tailor, extra.prod.prep, extra.prod.assembler].join(" ") : "";
  return norm([o.id, orderNumber(o.id), o.clientName, o.seller, o.voltage, o.status === "concluido" ? "concluido" : o.status, o.priority ? "prioridade urgente" : "", extra.city || "", extra.state || "", items, fin, prod].join(" "));
}

// Busca "inteligente": aceita "ped 1505", "n 1505", "fut 10x5", "multi park luan", "escorrega: azul parede: roxo", "com logo"...
export function matchQuery(haystackNorm, idOfOrder, query) {
  const q = norm(query);
  if (!q) return true;
  const numIntent = q.match(/^(?:ped|pedido|n|no|num|numero|nro)\s*(\d+)$/) || q.match(/^(\d{2,})$/);
  if (numIntent) {
    const n = numIntent[1].replace(/^0+(?=\d)/, "");
    if (orderNumber(idOfOrder) === n) return true;
    if (q.match(/^(?:ped|pedido|n|no|num|numero|nro)\s/)) return orderNumber(idOfOrder).includes(n);
  }
  const tokens = q.split(" ").filter(t => t && !STOP.has(t));
  if (!tokens.length) return true;
  const words = haystackNorm.split(" ");
  return tokens.every(t => haystackNorm.includes(t) || words.some(w => w.startsWith(t)));
}

// Encontra o vendedor cadastrado que corresponde a um nome escrito de outro jeito.
// Ex.: "luan", "Luan Oliveira", "LUAN ROSDRIGUES DE SOUSA OLIVEIRA" → mesmo vendedor.
// Só junta quando não há ambiguidade (dois vendedores com o mesmo primeiro nome não são misturados).
export function findSeller(sellers, name) {
  const n = norm(name);
  if (!n) return null;
  const list = (sellers || []).filter(s => s && s.name);
  const exact = list.find(s => norm(s.name) === n);
  if (exact) return exact;
  const toks = n.split(" ").filter(t => t.length > 1);
  if (!toks.length) return null;
  // todas as palavras de um estão no outro (ex.: "joao paulo" x "joao paulo silva")
  const contain = list.filter(s => { const st = norm(s.name).split(" "); return toks.every(t => st.includes(t)) || st.every(t => toks.includes(t)); });
  if (contain.length === 1) return contain[0];
  // mesmo primeiro nome, e só existe um vendedor com esse primeiro nome
  const first = list.filter(s => norm(s.name).split(" ")[0] === toks[0] && toks[0].length > 2);
  if (first.length === 1) return first[0];
  return null;
}

// Próxima cor que ninguém está usando
export function nextSellerColor(sellers) {
  const used = new Set((sellers || []).map(s => (s.color || "").toLowerCase()));
  return SELLER_PALETTE.find(c => !used.has(c.toLowerCase())) || `hsl(${Math.round(Math.random() * 360)} 75% 55%)`;
}

const slug = (s) => norm(s).replace(/[^a-z0-9 ]/g, "").trim().split(" ").filter(Boolean);

// Mantém vendedores organizados:
// 1) todo vendedor que aparece num pedido fica cadastrado;
// 2) o nome do vendedor no pedido é unificado com o cadastro (assim nenhuma venda "some");
// 3) cada vendedor tem uma cor diferente;
// 4) cada vendedor ganha um login próprio (senha 1234) uma única vez.
export function ensureSellers(data, opts = {}) {
  let changed = false;
  const sellers = (data.sellers || []).map(s => ({ ...s }));
  (data.orders || []).forEach(o => {
    if (!o.seller || !String(o.seller).trim()) return;
    if (!findSeller(sellers, o.seller)) {
      sellers.push({ id: Date.now() + sellers.length, name: String(o.seller).trim(), color: nextSellerColor(sellers), auto: true });
      changed = true;
    }
  });
  // cores repetidas → troca pelas livres (mantém a do primeiro)
  const done = [];
  sellers.forEach(s => {
    const c = (s.color || "").toLowerCase();
    if (!c || done.some(x => x.color.toLowerCase() === c)) { s.color = nextSellerColor(sellers.filter(x => x !== s)); changed = true; }
    done.push(s);
  });
  const orders = (data.orders || []).map(o => {
    if (!o.seller) return o;
    const s = findSeller(sellers, o.seller);
    if (s && s.name !== o.seller) { changed = true; return { ...o, seller: s.name }; }
    return o;
  });
  const users = [...(data.users || [])].map((u, i) => u.id ? u : (changed = true, { ...u, id: Date.now() + 1000 + i }));
  let room = opts.room == null ? Infinity : Math.max(0, opts.room); // vagas de usuário que o plano ainda tem
  sellers.forEach(s => {
    if (s.loginCreated || opts.logins === false) return; // login automático do vendedor só nos planos com área de vendedores
    const has = users.find(u => u.sellerName && norm(u.sellerName) === norm(s.name));
    if (!has) {
      if (room <= 0) return; // sem vaga: não cria agora (cria quando sobrar vaga ou subir de plano)
      room--;
      const parts = slug(s.name);
      let login = parts[0] || "vendedor";
      if (users.some(u => (u.email || "").toLowerCase() === login)) login = parts.slice(0, 2).join(".");
      let k = 2; const base = login;
      while (users.some(u => (u.email || "").toLowerCase() === login)) login = `${base}${k++}`;
      users.push({ id: Date.now() + users.length + 7, name: s.name, email: login, password: "1234", role: "user", permissions: { sales: "edit", routes: "view" }, sellerName: s.name, autoLogin: true });
    }
    s.loginCreated = true; changed = true;
  });
  return changed ? { ...data, sellers, orders, users } : data;
}

export function addSeller(data, name, color, extra = {}) {
  const sellers = [...(data.sellers || [])];
  const existing = findSeller(sellers, name);
  if (existing) return { data, seller: existing };
  const seller = { id: Date.now(), name: String(name).trim(), color: color || nextSellerColor(sellers), ...extra };
  return { data: { ...data, sellers: [...sellers, seller] }, seller };
}

// Mesmo vendedor? (usa a mesma regra de cima)
export const sameSeller = (sellers, a, b) => {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  const sa = findSeller(sellers, a), sb = findSeller(sellers, b);
  return !!sa && sa === sb;
};

export const sellerColorOf = (data, name) => findSeller(data?.sellers, name)?.color || "#94a3b8";

// WhatsApp: monta link com número brasileiro e mensagem
export function whatsappLink(phone, text = "") {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ── IA ───────────────────────────────────────────────────────────────────────
export async function askAI({ system, messages, maxTokens = 1500, kind = "sales" }) {
  const res = await fetch("/.netlify/functions/anthropic", {
    method: "POST",
    headers: aiHeaders(kind),
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages })
  });
  const txt = await res.text();
  let d;
  try { d = JSON.parse(txt); } catch { throw new Error("Servidor da IA não respondeu (tente de novo em alguns segundos)."); }
  if (d.error) throw new Error(typeof d.error === "string" ? d.error : (d.error.message || "Erro na IA"));
  return (d.content || []).map(c => c.text || "").join("").trim();
}

// Lista de finalizadores de um item (aceita o formato antigo com um nome só)
export const finalizersOf = (f) => Array.isArray(f?.finalizers) ? f.finalizers.filter(Boolean) : (f?.finalizer ? String(f.finalizer).split(",").map(x => x.trim()).filter(Boolean) : []);

// Chamada "crua" (com ferramentas): devolve a resposta completa da API
export async function callClaude(body, kind = "brain") {
  const res = await fetch("/.netlify/functions/anthropic", {
    method: "POST", headers: aiHeaders(kind),
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, ...body })
  });
  const txt = await res.text();
  let d;
  try { d = JSON.parse(txt); } catch { throw new Error("Servidor da IA demorou ou não respondeu. Tente de novo."); }
  if (d.error) throw new Error(typeof d.error === "string" ? d.error : (d.error.message || "Erro na IA"));
  return d;
}

// Resumo dos dados para a IA (sem fotos, sem senhas)
export function aiSnapshot(data, { sellerName } = {}) {
  const orders = (data.orders || []).filter(o => !sellerName || sameSeller(data.sellers, o.seller, sellerName));
  const clientsByName = Object.fromEntries((data.clients || []).map(c => [c.name, c]));
  return {
    hoje: todayStr(),
    vendedores: sellerName ? [sellerName] : (data.sellers || []).map(s => s.name),
    equipe_producao: (data.team || []).map(t => ({ nome: t.name, funcao: t.role, status: t.status })),
    pedidos: orders.map(o => ({
      numero: orderNumber(o.id), cliente: o.clientName, cidade: clientsByName[o.clientName]?.city, uf: clientsByName[o.clientName]?.state,
      vendedor: o.seller, criado: o.createdAt, prazo: o.deadline, status: o.status, prioridade: !!o.priority, valor: o.totalPrice,
      itens: (o.items || []).map(it => ({ nome: it.toy, motor: !!it.isMotor, cores: it.colors, valor: it.price, obs: it.observations }))
    })),
    producao: (data.production || []).filter(p => !sellerName || orders.some(o => o.id === p.orderId)).map(p => ({ pedido: orderNumber(p.orderId), corte: p.cutter, costura: p.tailor, preparacao: p.prep, montagem: p.assembler, pronto: !!p.done })),
    finalizacao: (data.finalization || []).filter(f => !sellerName || orders.some(o => o.id === f.orderId)).map(f => ({ pedido: orderNumber(f.orderId), finalizador: f.finalizer, etapa: f.stage || (f.done ? "finalizado" : "pendente"), data: f.finDate })),
    clientes: (data.clients || []).filter(c => !sellerName || orders.some(o => o.clientName === c.name)).map(c => ({ nome: c.name, cidade: c.city, uf: c.state, telefone: c.phone, crm: c.crm || undefined }))
  };
}

// ── Períodos (filtro de datas usado no Dashboard e na Área do Vendedor) ──────
export const PERIOD_PRESETS = [
  ["max", "Máximo"], ["ytd", "No ano"], ["1y", "1 ano"], ["6m", "6 meses"], ["mes", "Este mês"],
  ["15d", "15 dias"], ["7d", "7 dias"], ["3d", "3 dias"], ["ontem", "Ontem"], ["hoje", "Hoje"],
];
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymdOf(new Date(y, m - 1, d + n)); };
// Devolve { from, to, label, prevFrom, prevTo, bucket } — bucket = "day" (até ~2 meses) ou "month"
export function periodRange(key, custom = {}, earliest) {
  const t = todayStr(), now = new Date();
  let from = t, to = t;
  if (key === "max") from = earliest || `${now.getFullYear() - 2}-01-01`;
  else if (key === "ytd") from = `${now.getFullYear()}-01-01`;
  else if (key === "1y") from = addDays(t, -364);
  else if (key === "6m") from = ymdOf(new Date(now.getFullYear(), now.getMonth() - 6, now.getDate() + 1));
  else if (key === "mes") from = `${t.slice(0, 7)}-01`;
  else if (/^\d+d$/.test(key)) from = addDays(t, -(parseInt(key) - 1));
  else if (key === "ontem") { from = addDays(t, -1); to = from; }
  else if (key === "custom") { from = custom.from || earliest || t; to = custom.to || t; }
  if (from > to) [from, to] = [to, from];
  const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  let prevTo = addDays(from, -1), prevFrom = addDays(from, -days);
  // "Este mês" compara com os mesmos dias do mês passado; "No ano" com o mesmo trecho do ano passado
  if (key === "mes") { const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1); prevFrom = ymdOf(pm); prevTo = ymdOf(new Date(pm.getFullYear(), pm.getMonth(), Math.min(now.getDate(), new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate()))); }
  if (key === "ytd") { prevFrom = `${now.getFullYear() - 1}-01-01`; prevTo = `${now.getFullYear() - 1}${t.slice(4)}`; }
  const label = key === "custom" ? `${dateBR(from)} → ${dateBR(to)}` : (PERIOD_PRESETS.find(p => p[0] === key)?.[1] || "");
  return { key, from, to, days, label, prevFrom: key === "max" ? null : prevFrom, prevTo: key === "max" ? null : prevTo, bucket: days <= 62 ? "day" : "month" };
}
export const inRange = (dateStr, from, to) => { const d = (dateStr || "").slice(0, 10); return !!d && d >= from && d <= to; };
// Lista de "baldes" (dias ou meses) do período, para gráficos
export function periodBuckets(r) {
  const out = [];
  const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  if (r.bucket === "day") {
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push({ key: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, from: d, to: d });
  } else {
    let [y, m] = r.from.split("-").map(Number);
    const [ty, tm] = r.to.split("-").map(Number);
    let guard = 0;
    while ((y < ty || (y === ty && m <= tm)) && guard++ < 240) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      out.push({ key: k, label: `${MON[m - 1]}/${String(y).slice(2)}`, from: `${k}-01`, to: `${k}-31` });
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  return out;
}

// ── Quem pode ver valores (R$) ───────────────────────────────────────────────
// gerente/dono e quem tem acesso ao Dashboard: tudo · vendedor: só os pedidos dele · produção/finalização: nenhum valor
export function moneyScope(user) {
  if (!user) return "none";
  if (user.role === "admin") return "all";
  if (user.sellerName) return "own";
  const p = user.permissions;
  if (p && !Array.isArray(p) && p.dashboard) return "all";
  if (Array.isArray(p) && p.includes("dashboard")) return "all";
  return "none";
}
// Cópia dos dados com só o que a pessoa pode ver:
// - produção: tudo, mas sem nenhum valor (R$)
// - vendedor: SÓ os pedidos, brinquedos, clientes, valores, produção, fotos e histórico DELE.
//   Nada de outro vendedor (nem o nome dos outros vendedores).
export function scrubForUser(data, user) {
  const scope = moneyScope(user);
  if (scope === "all") return data;
  const strip = (o) => ({ ...o, totalPrice: undefined, items: (o.items || []).map(it => ({ ...it, price: undefined })) });
  if (scope === "none") return { ...data, orders: (data.orders || []).map(strip), brain: { notes: [] }, users: [] };
  const mine = (data.orders || []).filter(o => sameSeller(data.sellers, o.seller, user.sellerName));
  const ids = new Set(mine.map(o => o.id));
  const nums = new Set(mine.map(o => String(orderNumber(o.id))));
  const clientNames = new Set(mine.map(o => norm(o.clientName)));
  const me = (data.sellers || []).filter(x => sameSeller(data.sellers, x.name, user.sellerName));
  return {
    ...data,
    orders: mine,
    production: (data.production || []).filter(p => ids.has(p.orderId)),
    finalization: (data.finalization || []).filter(f => ids.has(f.orderId)),
    clients: (data.clients || []).filter(c => clientNames.has(norm(c.name))),
    sellers: me.length ? me : [{ name: user.sellerName }],
    photos: (data.photos || []).filter(p => nums.has(String(p.pedido))),
    notifications: (data.notifications || []).filter(n => sameSeller(data.sellers, n.para, user.sellerName)),
    log: (data.log || []).filter(e => e.pedido && nums.has(String(e.pedido))),
    brain: { notes: [] },
    users: [],
  };
}
// Remove campos de dinheiro de um resultado (para a IA de quem não pode ver valores)
const MONEY_KEY = /^(valor|valor_total|faturamento|ticket|ticket_medio|total|preco|price|totalPrice|revenue)$/i;
export function redactMoney(x) {
  if (Array.isArray(x)) return x.map(redactMoney);
  if (x && typeof x === "object") { const o = {}; Object.entries(x).forEach(([k, v]) => { if (!MONEY_KEY.test(k)) o[k] = redactMoney(v); }); return o; }
  return x;
}
