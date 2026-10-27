// Inflatudo — Gestão para fabricantes de infláveis - Last Update: 2026-10-26
import React, { useState, useRef, useEffect, useCallback, Component } from "react";
import { supabase } from "./lib/supabase";
import { STATE_COORDS, UF_MAP, UF_NAMES, normalizeState, clientUF } from "./lib/geo";
import MapTab from "./tabs/MapTab";
import DashboardTab from "./tabs/DashboardTab";
import SalesTab from "./tabs/SalesTab";
import { sameSeller, whatsappLink, norm, orderNumber, cleanOrderNumber, orderHaystack, matchQuery, findSeller, addSeller, ensureSellers, sellerColorOf, SELLER_PALETTE } from "./lib/core";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", color: "red", background: "#111", minHeight: "100vh" }}>
          <h2>Oops, a tela quebrou!</h2>
          <details style={{ whiteSpace: "pre-wrap" }}>
            <summary>Clique aqui para ver o erro (tire print disso):</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.info && this.state.info.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Package, Factory, BarChart3, Users, UserCircle, Moon, Sun, LogOut, Plus, Edit3, Check, X, ChevronDown,
  AlertTriangle, CheckCircle, Menu, Lock, Eye, EyeOff, Search, Trash2, Save, Zap, FileText, Image, ChevronUp, ChevronLeft,
  ChevronRight, Star, Flag, Layers, Settings, Shield, Scissors, Shirt, Wrench, Hammer, Sparkles, TrendingUp, TrendingDown,
  DollarSign, Calendar, RefreshCw, ZoomIn, UserPlus, CreditCard
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ComposedChart, Area,
  AreaChart, PieChart, Pie
} from "recharts";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import logoMark from "./assets/logo-mark.svg";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// Mapa do Brasil salvo dentro do próprio site (antes vinha do GitHub e às vezes não carregava)
const GEO_URL = "/brazil-states.json";
const STATUS_LABEL = { aguardando: "Aguardando", producao: "Em produção", concluido: "Concluído" };

const TAB_META = {
  dashboard: { label: "Dashboard", Icon: BarChart3 },
  orders: { label: "Pedidos", Icon: Package },
  production: { label: "Produção", Icon: Factory },
  finalization: { label: "Finalização", Icon: CheckCircle },
  routes: { label: "Mapa", Icon: Flag },
  clients: { label: "Clientes", Icon: Users },
  sales: { label: "Vendedores", Icon: TrendingUp },
  team: { label: "Equipe", Icon: Settings }
};

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────
// tabs each role can see: "orders","production","finalization","dashboard","clients","team"
const ROLE_PERMISSIONS = {
  admin: ["orders", "production", "finalization", "dashboard", "clients", "team"],
  miriane: ["orders", "production", "finalization", "clients"],
  producao: ["production", "finalization"],
  finalizacao: ["finalization"],
  user: ["orders", "production", "finalization"],
};
// Permissões por aba: o gerente (dono da conta) define em Equipe > Logins se o funcionário
// não vê a aba, só visualiza ("view") ou pode editar ("edit"). O dono pode tudo.
// Compatível com o formato antigo (lista de abas = pode editar).
function permLevel(user, tab) {
  if (!user) return null;
  if (user.role === "admin") return "edit";
  const p = user.permissions;
  if (Array.isArray(p)) return p.includes(tab) ? "edit" : null;
  return (p && (p[tab] === "view" || p[tab] === "edit")) ? p[tab] : null;
}
const canEdit = (user, tab) => permLevel(user, tab) === "edit";
const canEditProd = (user) => canEdit(user, "production");
const canEditFin = (user) => canEdit(user, "finalization");
const EMPLOYEE_TABS = ["dashboard", "orders", "production", "finalization", "routes", "clients", "sales"];

// Conta nova sempre começa zerada. É uma função (e não um objeto fixo) para que
// nenhuma lista seja compartilhada entre contas diferentes no mesmo navegador.
const emptyData = () => ({ users: [], clients: [], team: [], sellers: [], orders: [], production: [], finalization: [] });
const INITIAL_DATA = emptyData();

let CURRENT_COMPANY_ID = null;
async function saveToSupabase(d) {
  if (!CURRENT_COMPANY_ID) return;
  try { await supabase.from('companies').update({ app_data: d }).eq('id', CURRENT_COMPANY_ID); } catch (err) { console.error("Supabase save error", err); }
}
function saveData(d) {
  if (!CURRENT_COMPANY_ID) return; // nunca grava sem saber de qual empresa é
  try { localStorage.setItem(`ags_v3_${CURRENT_COMPANY_ID}`, JSON.stringify(d)); } catch { }
  saveToSupabase(d);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const parseLocal = (ds) => {
  if (!ds) return new Date();
  const [y, m, d] = (ds.split("T")[0]).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0);
};
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_STR = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-${String(TODAY.getDate()).padStart(2, "0")}`; // data local (evita virar o dia às 21h)
const fmt = (d) => { try { return parseLocal(d).toLocaleDateString("pt-BR"); } catch { return d; } };
const daysLeft = (dl) => {
  const target = parseLocal(dl);
  // Compare milliseconds then convert to days to avoid daylight savings jumps
  return Math.round((target.getTime() - TODAY.getTime()) / 86400000);
};
const statusBadge = (deadline, done) => {
  if (done) return { label: "Concluído", color: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" };
  const d = daysLeft(deadline);
  if (d < 0) return { label: `Atrasado ${Math.abs(d)}d`, color: "bg-red-500/20 text-red-400 border border-red-500/30" }; if
    (d <= 3) return { label: `No Prazo (${d}d)`, color: "bg-amber-500/20 text-amber-400 border border-amber-500/30" };
  return { label: `No Prazo (${d}d)`, color: "bg-sky-500/20 text-sky-400 border border-sky-500/30" };
}; const
  COLOR_MAP = {
    "Azul"
      : "#3b82f6", "Amarelo": "#eab308", "Vermelho": "#ef4444", "Rosa": "#ec4899", "Verde": "#22c55e", "Roxo": "#a855f7", "Dourado": "#f59e0b", "Branco": "#f0f4f8", "Laranja": "#f97316", "Preto": "#1e293b"
  }; const SELLER_COLORS = { "Luan": "#f97316", "Emerson": "#3b82f6", "Sidnei": "#22c55e" }; // Sort production rows: priority first → then by deadline (atrasados first, then ascending) 
function sortProdRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
}

// Lista de vendedores cadastrados (aba Equipe > Vendedores). Mantém o valor atual mesmo se o vendedor foi removido.
function sellerNames(data, current) {
  const names = (data?.sellers || []).map(s => s.name).filter(Boolean);
  if (current && !names.includes(current)) names.push(current);
  return names;
}
const sellerColor = (data, name) => sellerColorOf(data, name);
// Próximo número de pedido sem repetir (mesmo após excluir pedidos)
function nextOrderId(orders) {
  // Próximo número livre, sem prefixo (ex.: 1515 -> 1516)
  const nums = (orders || []).map(o => parseInt(orderNumber(o.id), 10)).filter(n => !isNaN(n));
  let n = (nums.length ? Math.max(...nums) : 0) + 1;
  while ((orders || []).some(o => orderNumber(o.id) === String(n))) n++;
  return String(n);
}
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const CUR_MONTH = monthKey(TODAY);
const NEXT_MONTH = monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1));
const PREV_MONTH = monthKey(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1));
const money = (v) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR")}`;

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function AppLogo({ collapsed = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logoMark} alt="Inflatudo" className={`flex-shrink-0 transition-all duration-300 ${collapsed ? "h-10 w-10" : "h-12 w-12"}`} />
      {!collapsed && <span className="font-black tracking-tight leading-none" style={{ fontSize: "1.6rem", letterSpacing: "-0.03em" }}>Infla<span className="text-orange-500">tudo</span></span>}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, dark, data: propsData }) {
  const params = new URLSearchParams(window.location.search);
  const qsCompanyId = params.get('empresa');
  
  const [data] = useState(propsData || emptyData());
  const [mode, setMode] = useState(qsCompanyId ? "employee" : "admin_login"); 
  // modes: "admin_login", "admin_register", "employee"
  
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminAuth = async () => {
    setLoading(true); setErr("");
    try {
      if (mode === "admin_register") {
        if (!companyName || !email || !pw) throw new Error("Preencha todos os campos.");
        // Set trial to 7 days
        const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate() + 7);
        // Default init data without users (team will handle employee accounts)
        const defData = emptyData(); // empresa nova: nenhum dado de outra conta
        
        const { data: res, error } = await supabase.from('companies').insert([{
           company_name: companyName,
           admin_email: email.toLowerCase(),
           admin_password: pw,
           trial_ends_at: trialEnd.toISOString(),
           status: 'trial',
           plan_id: 'free',
           app_data: defData
        }]).select().single();
        if (error) throw new Error(error.message.includes("unique") ? "E-mail já está em uso." : error.message);
        onLogin({ id: res.id, name: res.company_name, email: res.admin_email, role: "admin", company_id: res.id, plan: res.plan_id, status: res.status, trial_ends_at: res.trial_ends_at });
      } else {
        if (!email || !pw) throw new Error("Preencha todos os campos.");
        const { data: res, error } = await supabase.from('companies')
           .select('*').eq('admin_email', email.toLowerCase()).eq('admin_password', pw).single();
        if (error || !res) throw new Error("E-mail ou senha incorretos.");
        onLogin({ id: res.id, name: res.company_name, email: res.admin_email, role: "admin", company_id: res.id, plan: res.plan_id, status: res.status, trial_ends_at: res.trial_ends_at });
      }
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const handleEmployeeAuth = async () => {
    setLoading(true); setErr("");
    try {
      if (!qsCompanyId) throw new Error("Link de empresa inválido. Peça o link correto ao seu administrador.");
      if (!email || !pw) throw new Error("Preencha usuário e senha.");
      const { data: cData, error } = await supabase.from('companies').select('id, company_name, app_data').eq('id', qsCompanyId).single();
      if (error || !cData) throw new Error("Empresa não encontrada.");
      
      // Look for employee in app_data.users
      const users = cData.app_data?.users || [];
      const login = email.trim().toLowerCase();
      const emp = users.find(u => (u.email || "").trim().toLowerCase() === login && u.password === pw);
      if (!emp) throw new Error("Usuário ou senha incorretos.");
      
      onLogin({ id: emp.id, name: emp.name, role: "employee", permissions: emp.permissions || [], sellerName: emp.sellerName || "", company_id: cData.id, company_name: cData.company_name });
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const handleSubmit = () => mode === "employee" ? handleEmployeeAuth() : handleAdminAuth();

  return (
    <div className="min-h-screen flex items-center justify-center login-bg" style={{ fontFamily: "'Inter','DM Sans',system-ui,sans-serif" }}>
      <div style={{ position:"absolute",top:"15%",left:"10%",width:320,height:320,borderRadius:"50%",background:"radial-gradient(circle,rgba(249,115,22,0.18) 0%,transparent 70%)",filter:"blur(40px)",pointerEvents:"none" }} />
      <div style={{ position:"absolute",bottom:"20%",right:"12%",width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(14,165,233,0.14) 0%,transparent 70%)",filter:"blur(40px)",pointerEvents:"none" }} />

      <div className="w-full max-w-md mx-4 animate-slide-up">
        {mode === "employee" ? (
          <div className="text-center mb-6">
             <div className="px-4 py-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full inline-flex font-bold text-xs uppercase mb-4 tracking-widest">Acesso da Equipe</div>
             <h2 className={`text-2xl font-black ${dark ? "text-white" : "text-gray-900"}`}>Área Restrita</h2>
             <p className={`text-sm mt-1 ${dark ? "text-gray-400" : "text-gray-600"}`}>Use suas credenciais para entrar</p>
          </div>
        ) : (
          <div className="flex bg-black/40 p-1.5 rounded-xl backdrop-blur-md border border-white/10 mb-6">
            <button onClick={() => {setMode("admin_login"); setErr("");}} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "admin_login" ? "bg-white/10 text-white shadow" : "text-gray-400 hover:text-white"}`}>Entrar</button>
            <button onClick={() => {setMode("admin_register"); setErr("");}} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "admin_register" ? "bg-white/10 text-white shadow" : "text-gray-400 hover:text-white"}`}>Criar Conta</button>
          </div>
        )}

        <div className="glass-card rounded-2xl p-8" style={{ border:"1px solid rgba(255,255,255,0.09)" }}>
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5"><div className="relative"><div style={{ position:"absolute",inset:-8,borderRadius:"50%",background:"radial-gradient(circle,rgba(249,115,22,0.2) 0%,transparent 70%)",filter:"blur(12px)" }} /><AppLogo collapsed={false} className={dark === false ? "text-gray-900" : "text-white"} /></div></div>
            <div className="divider-gradient mx-auto mb-4" style={{ maxWidth:120 }} />
            <p style={{ fontSize:"0.78rem",letterSpacing:"0.12em",textTransform:"uppercase",color:"#64748b",fontWeight:700 }}>Sistema de Gestão Industrial</p>
          </div>

          {err && <div className="mb-4 p-3 rounded-xl flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-semibold"><AlertTriangle size={15} />{err}</div>}

          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
            {mode === "admin_register" && (
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${dark ? "text-gray-400" : "text-gray-600"}`}>Nome da Empresa</label>
                <div className="relative">
                  <Factory size={14} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#475569",pointerEvents:"none" }} />
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Nome da empresa" className="input-dark w-full" style={{ paddingLeft:40 }} />
                </div>
              </div>
            )}
            
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${dark ? "text-gray-400" : "text-gray-600"}`}>{mode === "employee" ? "Login do Funcionário" : "Seu E-mail"}</label>
              <div className="relative">
                {mode === "employee" ? <UserCircle size={14} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#475569",pointerEvents:"none" }} /> : <Lock size={14} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#475569",pointerEvents:"none" }} />}
                <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder={mode === "employee" ? "joao.costura" : "admin@empresa.com"} autoComplete="off" className="input-dark w-full" style={{ paddingLeft:40 }} />
              </div>
            </div>
            
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${dark ? "text-gray-400" : "text-gray-600"}`}>Senha</label>
              <div className="relative">
                <Lock size={14} style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#475569",pointerEvents:"none" }} />
                <input type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="••••••" autoComplete="new-password" className="input-dark w-full" style={{ paddingLeft:40, paddingRight:44 }} />
                <button onClick={() => setShow(!show)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#475569",background:"none",border:"none",cursor:"pointer",padding:4,borderRadius:6,transition:"color 0.15s" }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={loading} className="btn-brand press-scale w-full mt-2 justify-center py-3 text-sm">
              {loading ? <><RefreshCw size={16} className="animate-spin" /> Aguarde...</> : mode === "admin_register" ? "Criar Conta & Iniciar Trial" : "Entrar"}
            </button>
          </div>
        </div>
        
        {mode === "employee" && (
           <div className="text-center mt-6">
             <button onClick={() => window.location.href = '/'} className={`text-xs font-bold underline ${dark ? "text-gray-500" : "text-gray-400"}`}>Sou proprietário / Dono</button>
           </div>
        )}
      </div>
    </div>
  );
}

// ─── IMAGE LIGHTBOX ───────────────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
        onClick={onClose}>
        <X size={20} />
      </button>
      <img src={src} alt="" className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
        onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ─── EDIT ORDER MODAL ────────────────────────────────────────────────────────
function EditOrderModal({ order, data, setData, dark, onClose }) {
  const emptyItem = { itemId: "", toy: "", colors: "", price: "", observations: "", images: [], isMotor: false };
  const [form, setForm] = useState({
    clientName: order.clientName || "", voltage: order.voltage || "110V",
    deadline: order.deadline || "", seller: order.seller || "", status: order.status || "aguardando", priority: !!order.priority,
    items: order.items ? order.items.map(it => ({ ...it, images: it.images || [], colors: Array.isArray(it.colors) ? it.colors.join(",") : it.colors })) : [{ ...emptyItem }]
  });
  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white focus:border-orange-500" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400"}`;
  const lc = `block text-xs font-semibold uppercase tracking-wide mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`;
  const upd = (idx, f, v) => { const a = [...form.items]; a[idx] = { ...a[idx], [f]: v }; setForm({ ...form, items: a }); };
  const
    addIt = () => setForm({ ...form, items: [...form.items, { itemId: `${order.id}-${form.items.length + 1}`, toy: "", colors: "", price: "", observations: "", images: [], isMotor: false }] });
  const remIt = (idx) => { if (form.items.length === 1) return; setForm({ ...form, items: form.items.filter((_, i) => i !== idx) }); };
  const hImg = (idx, e) => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => {
      const a = [...form.items];
      a[idx].images = [...(a[idx].images || []), r.result];
      setForm({ ...form, items: a });
    };
    r.readAsDataURL(f);
  };
  const remImg = (idx, imgIdx) => {
    const a = [...form.items];
    a[idx].images = a[idx].images.filter((_, i) => i !== imgIdx);
    setForm({ ...form, items: a });
  };
  const save = () => {
    let nd = { ...data }; if (form.seller?.trim()) nd = addSeller(nd, form.seller).data; const oi = nd.orders.findIndex(o => o.id === order.id); if (oi < 0) return; const
      si = form.items.map((it, i) => ({
        ...it, itemId: it.itemId || `${order.id}-${i + 1}`, colors: typeof
          it.colors === "string" ? it.colors.split(",").map(c => c.trim()).filter(Boolean) : it.colors, price: Number(it.price), isMotor: !!it.isMotor
      }));
    nd.orders[oi] = { ...nd.orders[oi], ...form, items: si, totalPrice: si.reduce((a, b) => a + b.price, 0) };
    const sIds = si.map(it => it.itemId);
    const ex = nd.production.filter(p => p.orderId === order.id).map(p => p.itemId);
    si.filter(it => !it.isMotor).forEach(it => {
      if (!ex.includes(it.itemId))
        nd.production.push({ itemId: it.itemId, orderId: order.id, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false });
    });
    nd.production = nd.production.filter(p => p.orderId !== order.id || sIds.includes(p.itemId));
    setData(nd); saveData(nd); onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh]
                ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className={`flex items-center justify-between p-5 border-b flex-shrink-0
                    ${dark ? "border-gray-700" : "border-gray-200"}`}>
          <div>
            <h3 className={`font-black text-lg ${dark ? "text-white" : "text-gray-900"}`}>Editar Pedido</h3>
            <span className="font-mono text-sm font-bold text-orange-400">{order.id}</span>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lc}>Cliente</label><input value={form.clientName}
              onChange={e => setForm({ ...form, clientName: e.target.value })} className={ic} /></div>
            <div><label className={lc}>Vendedor</label><SellerPicker data={data} setData={setData} dark={dark} className={ic} value={form.seller} onChange={v => setForm({ ...form, seller: v })} /></div>
            <div><label className={lc}>Prazo</label><input type="date" value={form.deadline}
              onChange={e => setForm({ ...form, deadline: e.target.value })} className={ic} /></div>
            <div><label className={lc}>Voltagem</label><select value={form.voltage}
              onChange={e => setForm({ ...form, voltage: e.target.value })} className={ic}><option>110V
              </option>
              <option>220V</option>
            </select></div>
            <div><label className={lc}>Status</label><select value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })} className={ic}><option
                value="aguardando">Aguardando</option>
              <option value="producao">Em Produção</option>
              <option value="concluido">Concluído</option>
            </select></div>
            <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer pb-2"><input type="checkbox" checked={!!form.priority} onChange={e => setForm({ ...form, priority: e.target.checked })} /><span className={`text-sm font-bold ${dark ? "text-red-400" : "text-red-600"}`}>🚨 Prioridade</span></label></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className={`text-sm font-black ${dark ? "text-white" : "text-gray-900"}`}>Itens
                ({form.items.length})</label>
              <button onClick={addIt}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>
                <Plus size={13} />Adicionar
              </button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div key={idx} className={`rounded-xl p-4 border ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                                            ${item.isMotor ? "bg-blue-500/20 text-blue-400" : dark ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"}`}>{item.isMotor ? "Motor" : "Brinquedo"} {idx + 1}</span>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox"
                        checked={!!item.isMotor}
                        onChange={e => upd(idx, "isMotor", e.target.checked)} /><span
                          className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>É
                          motor</span></label>
                    </div>
                    {form.items.length > 1 && <button onClick={() => remIt(idx)} className="text-red-400">
                      <X size={14} />
                    </button>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className={lc}>Nome</label><input
                      value={item.toy} onChange={e => upd(idx, "toy", e.target.value)} className={ic}
                      placeholder={item.isMotor ? "Ex: Motor 1/4 HP" : "Ex: Castelo Inflável"} /></div>
                    {!item.isMotor && <div><label className={lc}>Cores</label><input value={item.colors}
                      onChange={e => upd(idx, "colors", e.target.value)} className={ic}
                      placeholder="Azul, Verde..." /></div>}
                    <div><label className={lc}>Valor R$</label><input type="number" value={item.price}
                      onChange={e => upd(idx, "price", e.target.value)} className={ic} /></div>
                    <div className="col-span-2"><label className={lc}>Observações</label><input
                      value={item.observations}
                      onChange={e => upd(idx, "observations", e.target.value)} className={ic} /></div>
                    {!item.isMotor && (
                      <div className="col-span-2"><label className={lc}>Imagens</label>
                        <div className="flex flex-wrap items-center gap-3">
                          {(item.images || []).map((imgUrl, imgIdx) => (
                            <div key={imgIdx} className="relative group">
                              <img src={imgUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-600" />
                              <button onClick={() => remImg(idx, imgIdx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"><X size={12} /></button>
                            </div>
                          ))}
                          <label className={`flex flex-col items-center justify-center w-16 h-16 cursor-pointer rounded-lg border-2 border-dashed ${dark ? "border-gray-600 text-gray-400 hover:border-orange-500" : "border-gray-300 text-gray-500 hover:border-orange-400"}`}>
                            <Plus size={16} /><span className="text-[10px] font-bold mt-1">Add</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => hImg(idx, e)} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`flex gap-3 p-5 border-t flex-shrink-0 ${dark ? "border-gray-700" : "border-gray-200"}`}>
          <button onClick={save}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>
            <Save size={15} />Salvar
          </button>
          <button onClick={onClose} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm
                        font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
            <X size={15} />Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VENDEDOR: seleção + cadastro rápido (popup) ───────────────────────────────
function SellerModal({ initialName = "", dark, onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(SELLER_PALETTE[Math.floor(Math.random() * SELLER_PALETTE.length)]);
  const [phone, setPhone] = useState("");
  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-3 animate-slide-up ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`}>
        <div className="flex items-center justify-between"><h3 className="font-black text-lg">Novo representante</h3><button onClick={onClose} className="p-1.5 rounded-lg opacity-60 hover:opacity-100"><X size={16} /></button></div>
        <div><label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-gray-500">Nome</label><input autoFocus value={name} onChange={e => setName(e.target.value)} className={ic} placeholder="Ex.: Fernanda Rocha" /></div>
        <div><label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-gray-500">WhatsApp (opcional)</label><input value={phone} onChange={e => setPhone(e.target.value)} className={ic} placeholder="(11) 99999-0000" /></div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-gray-500">Cor no sistema</label>
          <div className="flex flex-wrap gap-2">{SELLER_PALETTE.map(c => <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-white scale-110" : ""}`} style={{ background: c }} />)}</div>
        </div>
        <button onClick={() => name.trim() && onSave({ name: name.trim(), color, phone })} disabled={!name.trim()} className="w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Cadastrar e usar</button>
      </div>
    </div>
  );
}

function SellerPicker({ data, setData, value, onChange, dark, className, isNew }) {
  const [modal, setModal] = useState(false);
  const known = findSeller(data.sellers, value);
  const names = sellerNames(data, value);
  const color = known?.color || "#94a3b8";
  const save = ({ name, color, phone }) => {
    const { data: nd, seller } = addSeller(data, name, color, phone ? { phone } : {});
    setData(nd); saveData(nd); onChange(seller.name); setModal(false);
  };
  return (
    <div>
      <div className="flex gap-1.5 items-stretch">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none" style={{ background: value ? color : "transparent" }} />
          <select value={value || ""} onChange={e => onChange(e.target.value)} className={className} style={{ paddingLeft: 24 }}>
            <option value="">— selecione —</option>
            {names.map(n => <option key={n} value={n}>{n}{!findSeller(data.sellers, n) ? " (novo)" : ""}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setModal(true)} title="Cadastrar novo representante" className={`px-2.5 rounded-lg border text-xs font-black flex items-center gap-1 ${dark ? "border-gray-700 text-orange-400 hover:bg-gray-800" : "border-gray-200 text-orange-600 hover:bg-orange-50"}`}><Plus size={13} />Novo</button>
      </div>
      {value && !known && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] font-bold text-amber-500">
          <span>"{value}" ainda não está cadastrado{isNew ? " (lido do pedido)" : ""}.</span>
          <button type="button" onClick={() => setModal(true)} className="underline">Cadastrar agora</button>
          <span className="text-gray-500 font-medium">ou será cadastrado ao salvar</span>
        </div>
      )}
      {modal && <SellerModal initialName={known ? "" : (value || "")} dark={dark} onSave={save} onClose={() => setModal(false)} />}
    </div>
  );
}

// ─── ORDERS TAB ───────────────────────────────────────────────────────────────
const ORDERS_PER_PAGE = 10;
function OrdersTab({ data, setData, dark, user }) {
  const canWrite = canEdit(user, "orders");
  const [view, setView] = useState("list"); const [inputMode, setInputMode] = useState("text");
  const [text, setText] = useState(""); const [pdfData, setPdfData] = useState(null); const
    [pdfName, setPdfName] = useState(""); const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(null); const [extHeader, setExtHeader] = useState({}); const
    [extItems, setExtItems] = useState([]); const [extImages, setExtImages] = useState({});
  const [search, setSearch] = useState(""); const [showForm, setShowForm] = useState(false);
  const
    [manualItems, setManualItems] = useState([{ toy: "", colors: "", price: "", observations: "", images: [], isMotor: false }]);
  const [manualHeader, setManualHeader] = useState({ clientName: "", voltage: "110V", deadline: "", seller: "" });
  const [selectMode, setSelectMode] = useState(false); const [selected, setSelected] = useState(new Set()); const
    [editingOrder, setEditingOrder] = useState(null); const [confirmDelete, setConfirmDelete] = useState(false);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("todos");
  const [openOrderIds, setOpenOrderIds] = useState(new Set());
  const togOrderOpen = (id) => { const s = new Set(openOrderIds); s.has(id)? s.delete(id) : s.add(id); setOpenOrderIds(s); };
  const pdfRef = useRef(null);

  const orders = data.orders;
  const thisMonth = orders.filter(o => o.createdAt?.startsWith(CUR_MONTH));
  const totalItems = orders.reduce((a, o) => a + (o.items?.filter(it => !it.isMotor).length || 0), 0);
  const done = orders.filter(o => o.status === "concluido").length;
  const delayed = orders.filter(o => o.status !== "concluido" && daysLeft(o.deadline) < 0).length;
  
  let baseFiltered = orders;
  if (filterType === "mes") baseFiltered = thisMonth;
  else if (filterType === "concluidos") baseFiltered = orders.filter(o => o.status === "concluido");
  else if (filterType === "atrasados") baseFiltered = orders.filter(o => o.status !== "concluido" && daysLeft(o.deadline) < 0);
  
  // Busca inteligente: número, cliente, vendedor, brinquedo, medidas, cores, observações, cidade…
  const clientMap = Object.fromEntries((data.clients || []).map(c => [c.name, c]));
  const filtered = baseFiltered.filter(o => matchQuery(orderHaystack(o, { city: clientMap[o.clientName]?.city, state: clientMap[o.clientName]?.state }), o.id, search));
  const totalPages = Math.ceil(filtered.length / ORDERS_PER_PAGE);
  const pagedOrders = filtered.slice((page - 1) * ORDERS_PER_PAGE, page * ORDERS_PER_PAGE);

  const togSel = (id) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const togAll = () => selected.size === filtered.length ? setSelected(new Set()) : setSelected(new
    Set(filtered.map(o => o.id)));
  const delSel = () => {
    const nd = { ...data };
    const delIds = [...selected];
    nd.orders = nd.orders.filter(o => !selected.has(o.id));
    nd.production = nd.production.filter(p => !selected.has(p.orderId));
    nd.finalization = nd.finalization.filter(f => !selected.has(f.orderId));
    // update client totals
    delIds.forEach(oid => {
      const o = orders.find(x => x.id === oid); if (o) {
        const
          ci = nd.clients.findIndex(c => c.name === o.clientName);
        if (ci >= 0 && o.totalPrice) {
          nd.clients[ci].totalSpent = Math.max(0, (nd.clients[ci].totalSpent || 0) - (o.totalPrice || 0));
          nd.clients[ci].totalOrders = Math.max(0, (nd.clients[ci].totalOrders || 0) - 1);
          if (nd.clients[ci].totalOrders === 0) {
            nd.clients = nd.clients.filter((_, idx) => idx !== ci);
          }
        }
      }
    });
    setData(nd); saveData(nd); setSelected(new Set()); setSelectMode(false); setConfirmDelete(false);
  };

  const handlePdf = (e) => {
    const f = e.target.files[0]; if (!f) return; setPdfName(f.name); const r = new
      FileReader(); r.onload = () => setPdfData(r.result.split(",")[1]); r.readAsDataURL(f);
  };
  const setExtImagesUpload = (idx, e) => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => setExtImages(p => ({ ...p, [idx]: r.result })); r.readAsDataURL(f);
  };

  const callAI = async () => {
    if (!text.trim() && !pdfData) return;
    setLoading(true); setExtracted(null);
    const sys = `Você extrai dados de pedidos de brinquedos infláveis. Retorne APENAS JSON válido, sem markdown, neste formato:
{
 "orderNumber": "número do pedido EXATAMENTE como está escrito no documento, só os dígitos (ex.: se está escrito 'Pedido 1515' devolva '1515'; NUNCA acrescente prefixo como PED- e NUNCA acrescente zeros à esquerda)",
 "clientName": "nome do cliente/empresa",
 "city": "cidade do cliente", "state": "UF do cliente (sigla, ex.: SP, MG)",
 "phone": "telefone/WhatsApp do cliente", "email": "e-mail do cliente",
 "voltage": "110V ou 220V",
 "deadline": "YYYY-MM-DD — prazo de FABRICAÇÃO/CONFECÇÃO (aparece como 'PRAZO' nas observações). NÃO é a data de emissão. Se houver dois prazos, use o ÚLTIMO.",
 "seller": "nome do REPRESENTANTE/vendedor exatamente como aparece (campos REPRESENTANTE, Vendedor, Rep., Atendente, Vendido por, Agente). Vendedores já cadastrados: ${sellerNames(data).join(", ") || "nenhum"} — se for um deles, use a grafia cadastrada; se for outro, devolva o nome como está no documento.",
 "items": [{"toy": "nome completo do item como no pedido (inclua medidas)", "quantity": 1, "colors": ["cor1"], "price": 0, "observations": "detalhes de cores por parte, logo, faixas, medidas, etc.", "isMotor": false}]
}
Regras: motores/sopradores/bombas têm isMotor=true e observations vazio. "quantity" é a QUANTIDADE daquele item no pedido (se o pedido tem 2 motores, quantity=2). "price" é o valor UNITÁRIO. Coloque todas as observações de fabricação no item do brinquedo correspondente. Não invente dados.`;
    try {
      const content = pdfData
        ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfData } }, { type: "text", text: "Extraia os dados deste pedido. Atenção às QUANTIDADES de cada item (principalmente motores) e ao número do pedido exatamente como está escrito." }]
        : `Extraia os dados deste pedido. Atenção às QUANTIDADES de cada item (principalmente motores):\n\n${text}`;
      const res = await fetch("/.netlify/functions/anthropic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: sys,
          messages: [{ role: "user", content }]
        })
      });
      let d;
      const textResponse = await res.text();
      try {
        d = JSON.parse(textResponse);
      } catch (e) {
        throw new Error(`Erro de resposta do servidor: Resposta não é JSON válido.`);
      }
      if (d.error) {
        let errMsg = d.error.message || d.error;
        if (typeof errMsg === 'string' && errMsg.includes("invalid x-api-key")) {
            errMsg = "Chave de API Inválida/Expirada. Por favor, configure a variável VITE_ANTHROPIC_API_KEY no painel do Netlify com sua chave pessoal do Claude.";
        }
        throw new Error(errMsg);
      }
      const raw = (d.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      setExtracted(p);
      const known = findSeller(data.sellers, p.seller);
      setExtHeader({ orderNumber: cleanOrderNumber(p.orderNumber), sellerIsNew: !!(p.seller && !known), clientName: p.clientName || "", city: p.city || "", state: p.state || "", phone: p.phone || "", email: p.email || "", voltage: p.voltage || "110V", deadline: p.deadline || "", seller: known ? known.name : (p.seller || "").trim() });
      // Um item por unidade (ex.: 2 motores viram 2 itens); limite de 50 por linha por segurança
      const expanded = [];
      (p.items || []).forEach(it => {
        const q = Math.max(1, Math.min(50, parseInt(it.quantity, 10) || 1));
        for (let k = 0; k < q; k++) expanded.push({ ...it, quantity: undefined, images: [], colors: Array.isArray(it.colors) ? it.colors.join(", ") : (it.colors || "") });
      });
      setExtItems(expanded);
    } catch (err) { console.error("Extraction error:", err); setExtracted({ error: err.message || "Não foi possível extrair os dados." }); }
    setLoading(false);
  };

  const saveExt = () => {
    const rawNum = cleanOrderNumber(extHeader.orderNumber);
    if (rawNum && data.orders.some(o => orderNumber(o.id) === orderNumber(rawNum))) { alert(`Já existe um pedido nº ${orderNumber(rawNum)}. Altere o número antes de salvar.`); return; }
    if (!extHeader.clientName?.trim()) { alert("Informe o cliente."); return; }
    let nd = { ...data, orders: [...data.orders], production: [...data.production] }; const newId = rawNum || nextOrderId(nd.orders);
    if (extHeader.seller?.trim()) nd = addSeller(nd, extHeader.seller).data;
    const items = extItems.map((it, i) => ({
      itemId: `${newId}-${i + 1}`, toy: it.toy, colors: typeof
        it.colors === "string" ? it.colors.split(",").map(c => c.trim()).filter(Boolean) : it.colors, price: Number(it.price) || 0, observations: it.observations || "", images: it.images || [], isMotor: !!it.isMotor
    }));
    const total = items.reduce((a, b) => a + b.price, 0);
    nd.orders.push({ id: newId, clientName: extHeader.clientName, voltage: extHeader.voltage, deadline: extHeader.deadline, seller: extHeader.seller, totalPrice: total, status: "aguardando", createdAt: TODAY_STR, priority: false, items });
    items.filter(it => !it.isMotor).forEach(it => nd.production.push({ itemId: it.itemId, orderId: newId, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false }));
    nd.clients = [...nd.clients];
    const ci = nd.clients.findIndex(c => norm(c.name) === norm(extHeader.clientName));
    if (ci >= 0) { nd.clients[ci] = { ...nd.clients[ci] };
        nd.clients[ci].totalOrders = (nd.clients[ci].totalOrders || 0) + 1; 
        nd.clients[ci].totalSpent = (nd.clients[ci].totalSpent || 0) + total; 
        // dados do cliente revisados na tela atualizam o cadastro
        ["city", "phone", "email"].forEach(k => { if (extHeader[k]?.trim()) nd.clients[ci][k] = extHeader[k].trim(); });
        if (normalizeState(extHeader.state)) nd.clients[ci].state = normalizeState(extHeader.state);
    }
    else {
      nd.clients.push({ id: Date.now(), name: extHeader.clientName, city: extHeader.city || "", state: normalizeState(extHeader.state) || extHeader.state || "", phone: extHeader.phone || "", email: extHeader.email || "", totalOrders: 1, totalSpent: total });
    }
    setData(nd); saveData(nd); setSearch(""); setFilterType("todos"); setPage(1); setText(""); setPdfData(null); setPdfName(""); setExtracted(null); setExtItems([]); setExtHeader({}); setView("list");
  };

  const addManual = () => {
    if (!manualHeader.clientName?.trim()) { alert("Informe o cliente."); return; }
    if (!manualItems.some(it => it.toy?.trim())) { alert("Informe ao menos um item."); return; }
    let nd = { ...data }; const newId = nextOrderId(nd.orders);
    if (manualHeader.seller?.trim()) nd = addSeller(nd, manualHeader.seller).data;
    const
      items = manualItems.map((it, i) => ({ itemId: `${newId}-${i + 1}`, toy: it.toy, colors: it.colors.split(",").map(c => c.trim()).filter(Boolean), price: Number(it.price) || 0, observations: it.observations, images: it.images || [], isMotor: !!it.isMotor }));
    const total = items.reduce((a, b) => a + b.price, 0);
    nd.orders.push({ id: newId, ...manualHeader, totalPrice: total, status: "aguardando", createdAt: TODAY_STR, priority: false, items });
    items.filter(it => !it.isMotor).forEach(it => nd.production.push({ itemId: it.itemId, orderId: newId, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false }));
    const ci = nd.clients.findIndex(c => c.name.toLowerCase() === manualHeader.clientName?.toLowerCase());
    if (ci >= 0) { nd.clients[ci].totalOrders = (nd.clients[ci].totalOrders || 0) + 1; nd.clients[ci].totalSpent = (nd.clients[ci].totalSpent || 0) + total; }
    else
      if (manualHeader.clientName) nd.clients.push({ id: Date.now(), name: manualHeader.clientName, city: manualHeader.city || "", state: manualHeader.state || "", phone: "", email: "", totalOrders: 1, totalSpent: total });
    setData(nd); saveData(nd); setShowForm(false); setManualItems([{ toy: "", colors: "", price: "", observations: "", images: [], isMotor: false }]); setManualHeader({ clientName: "", voltage: "110V", deadline: "", seller: "" });
  };

  const updExt = (idx, f, v) => { const a = [...extItems]; a[idx] = { ...a[idx], [f]: v }; setExtItems(a); };
  const updMan = (idx, f, v) => { const a = [...manualItems]; a[idx] = { ...a[idx], [f]: v }; setManualItems(a); };

  const hManImg = (idx, e) => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => {
      const a = [...manualItems];
      a[idx].images = [...(a[idx].images || []), r.result];
      setManualItems(a);
    };
    r.readAsDataURL(f);
  };
  const remManImg = (idx, imgIdx) => {
    const a = [...manualItems];
    a[idx].images = a[idx].images.filter((_, i) => i !== imgIdx);
    setManualItems(a);
  };

  const hExtImg = (idx, e) => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => {
      const a = [...extItems];
      a[idx].images = [...(a[idx].images || []), r.result];
      setExtItems(a);
    };
    r.readAsDataURL(f);
  };
  const remExtImg = (idx, imgIdx) => {
    const a = [...extItems];
    a[idx].images = a[idx].images.filter((_, i) => i !== imgIdx);
    setExtItems(a);
  };

  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-orange-500" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400"}`;
  const lc = `block text-xs font-semibold uppercase tracking-wide mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`;

  return (
    <div className="space-y-6">
      {editingOrder && <EditOrderModal order={editingOrder} data={data} setData={setData} dark={dark}
        onClose={() => setEditingOrder(null)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto bg-red-500/20">
              <Trash2 size={22} className="text-red-400" />
            </div>
            <h3 className={`text-lg font-black text-center mb-2 ${dark ? "text-white" : "text-gray-900"}`}>
              Confirmar Exclusão</h3>
            <p className={`text-sm text-center mb-5 ${dark ? "text-gray-400" : "text-gray-500"}`}>Excluir
              <strong>{selected.size} pedido{selected.size > 1 ? "s" : ""}</strong>? Todos os dados serão
              removidos.
            </p>
            <div className="flex gap-3"><button onClick={delSel}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500">Excluir</button><button
                onClick={() => setConfirmDelete(false)} className={`flex-1 py-2.5 rounded-xl text-sm
                                    font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>Cancelar</button></div>
          </div>
        </div>
      )}
      {/* ── HEADER ── */}
      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16,marginBottom:4 }}>
        <div>
          <h2 style={{ fontSize:"1.6rem",fontWeight:800,letterSpacing:"-0.03em",lineHeight:1.2,color:dark?"#f8fafc":"#0f172a",fontFamily:"'Inter',system-ui,sans-serif" }}>Pedidos</h2>
          <p style={{ fontSize:"0.8rem",color:"#64748b",marginTop:2,fontWeight:500 }}>Gerencie todos os pedidos da empresa</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!canWrite ? <span className={`text-xs font-bold px-3 py-2 rounded-xl border ${dark ? "border-gray-800 text-gray-500" : "border-gray-200 text-gray-500"}`}>👁️ Somente visualização</span> : !selectMode ? (<>
            <button onClick={() => { setSelectMode(true); setView("list") }} className={`flex
                                    items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border
                                    ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
              <Check size={15} />Selecionar
            </button>
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4
                                    py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>
              <Plus size={16} />Novo Manual
            </button>
            <button onClick={() => setView(view === "list" ? "ai" : "list")} className={`flex items-center
                                    gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${dark ? "border-orange-500/50 text-orange-400" : "border-orange-400 text-orange-600"}`}>
              <Zap size={16} />{view === "list" ? "Extrair com IA" : "Ver Pedidos"}
            </button>
          </>) : (<>
            <button onClick={togAll} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl
                                    text-sm font-bold border ${dark ? "border-gray-700 text-gray-300" : "border-gray-300 text-gray-700"}`}>{selected.size === filtered.length ?
                <X size={15} /> :
                <Check size={15} />}{selected.size === filtered.length ? "Desmarcar" : "Marcar Todos"}
            </button>
            {selected.size > 0 && <button onClick={() => setConfirmDelete(true)} className="flex
                                    items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-white bg-red-500">
              <Trash2 size={15} />Excluir ({selected.size})
            </button>}
            <button onClick={() => { setSelectMode(false); setSelected(new Set()) }} className={`flex
                                    items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border
                                    ${dark ? "border-gray-700 text-gray-400" : "border-gray-300 text-gray-500"}`}>
              <X size={15} />Cancelar
            </button>
          </>)}
        </div>
      </div>
      {/* ── STAT CARDS ── */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12 }}>
        {[
          { id:"todos", label:"Total (Peds/Brinq)", value:`${orders.length} / ${totalItems}`, colorVar:"stat-card-blue", icon:<Layers size={18} style={{ color:"#3b82f6" }} />, color:"#3b82f6" },
          { id:"mes", label:"Pedidos no Mês", value:thisMonth.length, colorVar:"stat-card-orange", icon:<TrendingUp size={18} style={{ color:"#f97316" }} />, color:"#f97316" },
          { id:"concluidos", label:"Concluídos",     value:done,            colorVar:"stat-card-green",  icon:<CheckCircle size={18} style={{ color:"#22c55e" }} />, color:"#22c55e" },
          { id:"atrasados", label:"Atrasados",      value:delayed,         colorVar:"stat-card-red",    icon:<AlertTriangle size={18} style={{ color:"#ef4444" }} />, color:"#ef4444" },
        ].map(k => (
          <div key={k.id} onClick={() => { setFilterType(k.id); setPage(1); }} className={`stat-card cursor-pointer transition-all ${k.colorVar} ${filterType === k.id ? "ring-2 ring-offset-2 ring-" + k.color.replace("#","") : "opacity-80 hover:opacity-100"}`} style={{ padding:"16px", ...(filterType === k.id ? { transform: "translateY(-2px)", borderColor: k.color } : {}) }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:"0.7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#64748b" }}>{k.label}</span>
              <div style={{ width:32,height:32,borderRadius:8,background:`${k.color}18`,display:"flex",alignItems:"center",justifyContent:"center" }}>{k.icon}</div>
            </div>
            <div style={{ fontSize:"2rem",fontWeight:900,lineHeight:1,color:k.color,fontFamily:"'Inter',system-ui,sans-serif" }}>{k.value}</div>
          </div>
        ))}
      </div>
      {showForm && canWrite && (
        <div className={`rounded-xl p-5 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>Novo Pedido Manual</h3>
            <button onClick={() => setShowForm(false)} className={`p-1.5 rounded-lg
                                ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div><label className={lc}>Cliente</label><input value={manualHeader.clientName}
              onChange={e => setManualHeader({ ...manualHeader, clientName: e.target.value })}
              className={ic} /></div>
            <div><label className={lc}>Vendedor</label><SellerPicker data={data} setData={setData} dark={dark} className={ic} value={manualHeader.seller} onChange={v => setManualHeader({ ...manualHeader, seller: v })} /></div>
            <div><label className={lc}>Prazo</label><input type="date" value={manualHeader.deadline}
              onChange={e => setManualHeader({ ...manualHeader, deadline: e.target.value })}
              className={ic} /></div>
            <div><label className={lc}>Voltagem</label><select value={manualHeader.voltage}
              onChange={e => setManualHeader({ ...manualHeader, voltage: e.target.value })}
              className={ic}><option>110V</option>
              <option>220V</option>
            </select></div>
          </div>
          <div className="flex items-center justify-between mb-3"><span className={`text-sm font-black
                                ${dark ? "text-white" : "text-gray-900"}`}>Itens</span><button
              onClick={() => setManualItems([...manualItems, { toy: "", colors: "", price: "", observations: "", images: [], isMotor: false }])}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>
              <Plus size={13} />Adicionar
            </button></div>
          <div className="space-y-3">
            {manualItems.map((item, idx) => (
              <div key={idx} className={`rounded-xl p-4 border ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                                            ${item.isMotor ? "bg-blue-500/20 text-blue-400" : dark ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"}`}>{item.isMotor ? "Motor" : "Brinquedo"} {idx + 1}</span>
                    <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox"
                      checked={!!item.isMotor}
                      onChange={e => updMan(idx, "isMotor", e.target.checked)} /><span
                        className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>É
                        motor</span></label>
                  </div>
                  {manualItems.length > 1 && <button
                    onClick={() => setManualItems(manualItems.filter((_, i) => i !== idx))}
                    className="text-red-400">
                    <X size={14} />
                  </button>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2"><label className={lc}>Nome</label><input
                    value={item.toy} onChange={e => updMan(idx, "toy", e.target.value)}
                    className={ic} /></div>
                  {!item.isMotor && <div><label className={lc}>Cores</label><input value={item.colors}
                    onChange={e => updMan(idx, "colors", e.target.value)} className={ic}
                    placeholder="Azul, Verde..." /></div>}
                  <div><label className={lc}>Valor R$</label><input type="number" value={item.price}
                    onChange={e => updMan(idx, "price", e.target.value)} className={ic} /></div>
                  <div className="md:col-span-4"><label className={lc}>Observações</label><input
                    value={item.observations}
                    onChange={e => updMan(idx, "observations", e.target.value)} className={ic} />
                  </div>
                  {!item.isMotor && (<div className="md:col-span-4"><label className={lc}>Imagens</label>
                    <div className="flex flex-wrap items-center gap-3">
                      {(item.images || []).map((imgUrl, imgIdx) => (
                        <div key={imgIdx} className="relative group">
                          <img src={imgUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-600" />
                          <button onClick={() => remManImg(idx, imgIdx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"><X size={12} /></button>
                        </div>
                      ))}
                      <label className={`flex flex-col items-center justify-center w-16 h-16 cursor-pointer rounded-lg border-2 border-dashed ${dark ? "border-gray-600 text-gray-400 hover:border-orange-500" : "border-gray-300 text-gray-500 hover:border-orange-400"}`}>
                        <Plus size={16} /><span className="text-[10px] font-bold mt-1">Add</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => hManImg(idx, e)} />
                      </label>
                    </div>
                  </div>)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addManual} className="px-4 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Salvar Pedido</button>
            <button onClick={() => setShowForm(false)} className={`px-4 py-2 rounded-xl text-sm font-bold
                                ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}
      {view === "ai" && canWrite && (
        <div className={`rounded-xl p-5 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
          <h3 className={`font-bold mb-1 ${dark ? "text-white" : "text-gray-900"}`}>Extração com IA</h3>
          <p className={`text-xs mb-4 ${dark ? "text-gray-400" : "text-gray-500"}`}>A IA busca o campo
            <strong>REPRESENTANTE</strong> para o vendedor, e o campo <strong>PRAZO</strong> nas
            observações para o prazo de fabricação.
          </p>
          <div className="flex gap-2 mb-4">
            {[["text", "✏️ Texto"], ["pdf", "📄 PDF"]].map(([m, l]) => (<button key={m}
              onClick={() => setInputMode(m)} className={`px-4 py-2 rounded-xl text-sm font-bold
                                ${inputMode === m ? "text-white" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"}`}
              style={inputMode === m ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>{l}</button>))}
          </div>
          {inputMode === "text" ? (<textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder="Cole o texto do pedido..." className={`w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900"}`} />) : (
            <label className={`flex items-center gap-3 cursor-pointer px-4 py-4 rounded-xl border-2 border-dashed ${dark ? "border-gray-600 text-gray-400 hover:border-orange-500/60" : "border-gray-300 text-gray-500 hover:border-orange-400"}`}>
              <FileText size={20} /><div><div className="font-semibold text-sm">{pdfName || "Selecionar PDF"}</div><div className="text-xs">{pdfData ? "✅ PDF carregado" : "Formatos: .pdf"}</div></div><input type="file" accept=".pdf" className="hidden" onChange={handlePdf} />
            </label>
          )}
          <button onClick={callAI} disabled={loading || (!text.trim() && !pdfData)} className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analisando...</> : <><Zap size={16} />Extrair com IA</>}
          </button>
          {extracted && !extracted.error && (
            <div className={`mt-5 p-4 rounded-xl border ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
              <h4 className={`font-bold mb-3 ${dark ? "text-white" : "text-gray-900"}`}>Dados Extraídos — <span className="text-orange-400">editável</span></h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div className="col-span-2 md:col-span-3 text-[11px] font-black uppercase tracking-widest text-orange-500">Pedido</div>
                {[["orderNumber", "Nº Pedido"], ["deadline", "Prazo de fabricação", "date"]].map(([k, l, t]) => (
                  <div key={k}><label className={lc}>{l}</label><input type={t || "text"} value={extHeader[k] || ""} onChange={e => setExtHeader({ ...extHeader, [k]: e.target.value })} className={ic} /></div>
                ))}
                <div><label className={lc}>Voltagem</label><select value={extHeader.voltage || "110V"} onChange={e => setExtHeader({ ...extHeader, voltage: e.target.value })} className={ic}><option>110V</option><option>220V</option></select></div>
                <div className="col-span-2 md:col-span-3"><label className={lc}>Vendedor (REPRESENTANTE)</label>
                  <SellerPicker data={data} setData={setData} dark={dark} className={ic} value={extHeader.seller || ""} isNew={extHeader.sellerIsNew} onChange={v => setExtHeader({ ...extHeader, seller: v })} /></div>
                <div className="col-span-2 md:col-span-3 text-[11px] font-black uppercase tracking-widest text-orange-500 mt-2 flex items-center gap-2">Cliente
                  {(data.clients || []).some(c => norm(c.name) === norm(extHeader.clientName)) && <span className="normal-case tracking-normal font-bold text-emerald-500">· já cadastrado — o que você mudar aqui atualiza o cadastro</span>}</div>
                <div className="col-span-2"><label className={lc}>Nome do cliente</label><input value={extHeader.clientName || ""} onChange={e => setExtHeader({ ...extHeader, clientName: e.target.value })} className={ic} /></div>
                <div><label className={lc}>Telefone / WhatsApp</label><input value={extHeader.phone || ""} onChange={e => setExtHeader({ ...extHeader, phone: e.target.value })} className={ic} placeholder="(00) 00000-0000" /></div>
                <div><label className={lc}>Cidade</label><input value={extHeader.city || ""} onChange={e => setExtHeader({ ...extHeader, city: e.target.value })} className={ic} /></div>
                <div><label className={lc}>Estado</label><select value={normalizeState(extHeader.state) || ""} onChange={e => setExtHeader({ ...extHeader, state: e.target.value })} className={ic}><option value="">—</option>{Object.entries(UF_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([uf, n]) => <option key={uf} value={uf}>{uf} — {n}</option>)}</select></div>
                <div><label className={lc}>E-mail</label><input value={extHeader.email || ""} onChange={e => setExtHeader({ ...extHeader, email: e.target.value })} className={ic} /></div>
              </div>
              <div className="space-y-2 mb-4">
                {extItems.map((it, idx) => (
                  <div key={idx} className={`rounded-xl p-3 border ${dark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-200"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${it.isMotor ? "bg-blue-500/20 text-blue-400" : dark ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"}`}>{it.isMotor ? "Motor" : "Brinquedo"} {idx + 1}</span>
                        <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={!!it.isMotor} onChange={e => updExt(idx, "isMotor", e.target.checked)} /><span className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>É motor</span></label>
                      </div>
                      {extItems.length > 1 && <button onClick={() => setExtItems(extItems.filter((_, i) => i !== idx))} className="text-red-400"><X size={13} /></button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><label className={lc}>Nome</label><input value={it.toy} onChange={e => updExt(idx, "toy", e.target.value)} className={ic} /></div>
                      {!it.isMotor && <div><label className={lc}>Cores</label><input value={it.colors} onChange={e => updExt(idx, "colors", e.target.value)} className={ic} /></div>}
                      <div><label className={lc}>Valor R$</label><input type="number" value={it.price} onChange={e => updExt(idx, "price", e.target.value)} className={ic} /></div>
                      <div className="col-span-2"><label className={lc}>Observações</label><input value={it.observations} onChange={e => updExt(idx, "observations", e.target.value)} className={ic} /></div>
                      {!it.isMotor && (<div className="col-span-2"><label className={lc}>Imagens</label>
                        <div className="flex flex-wrap items-center gap-3">
                          {(it.images || []).map((imgUrl, imgIdx) => (
                            <div key={imgIdx} className="relative group">
                              <img src={imgUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-600" />
                              <button onClick={() => remExtImg(idx, imgIdx)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"><X size={10} /></button>
                            </div>
                          ))}
                          <label className={`flex flex-col items-center justify-center w-14 h-14 cursor-pointer rounded-lg border-2 border-dashed ${dark ? "border-gray-600 text-gray-400 hover:border-orange-500" : "border-gray-300 text-gray-500 hover:border-orange-400"}`}>
                            <Plus size={14} /><span className="text-[9px] font-bold mt-1">Add</span>
                            <input type="file" accept="image/*" className="hidden" onChange={e => hExtImg(idx, e)} />
                          </label>
                        </div>
                      </div>)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={saveExt} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}><Check size={14} />Confirmar e Salvar</button>
                <button onClick={() => { setExtracted(null); setExtItems([]); setExtHeader({}) }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${dark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-700"}`}><X size={14} />Cancelar</button>
              </div>
            </div>
          )}
          {extracted?.error && <div className="mt-3 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{extracted.error}</div>}
        </div>
      )}
      {view === "list" && (<>
        <div className="relative"><Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${dark ? "text-gray-400" : "text-gray-400"}`} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder='Busque qualquer coisa: "ped 1505", "fut 10x5", "tobogã lateral laranja", "multi park luan", "com logo"…' className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-200 text-gray-900"}`} /></div>
        <div className="space-y-4">
          {pagedOrders.map(o => {
            const s = statusBadge(o.deadline, o.status === "concluido"); const isSel = selected.has(o.id); const sc = sellerColor(data, o.seller); const ni = (o.items || []).filter(it => !it.isMotor).length; const mi = (o.items || []).filter(it => it.isMotor).length;
            return (
              <div key={o.id} onClick={() => selectMode && togSel(o.id)} className={`rounded-xl border ${selectMode ? "cursor-pointer" : ""} ${isSel ? "border-orange-500 bg-orange-500/5" : dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${o.priority ? "ring-2 ring-red-500/50" : ""}`}>
                <div className="flex items-center justify-between p-4 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {selectMode ? <div onClick={e => { e.stopPropagation(); togSel(o.id) }} className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border-2 cursor-pointer ${isSel ? "border-orange-500 bg-orange-500" : "border-gray-600 bg-gray-800"}`}>{isSel && <Check size={16} className="text-white" />}</div>
                      : <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}><Package size={16} className="text-white" /></div>}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono text-sm font-bold ${dark ? "text-orange-400" : "text-orange-600"}`}>{o.id}</span>
                        {o.priority && <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30">🚨 Prioridade</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{ni} brinquedo{ni !== 1 ? "s" : ""}{mi > 0 ? ` + ${mi} motor` : ""}</span>
                      </div>
                      <div className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>{o.clientName}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${sc}22`, color: sc }}>{o.seller || "—"}</span>
                        <span className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>{o.voltage} · Prazo: {fmt(o.deadline)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right"><div className={`text-lg font-black ${dark ? "text-white" : "text-gray-900"}`}>R$ {(o.totalPrice || 0).toLocaleString("pt-BR")}</div></div>
                    {!selectMode && canWrite && <button onClick={e => { e.stopPropagation(); setEditingOrder(o) }} className={`p-2 rounded-xl border ${dark ? "border-gray-700 text-gray-400 hover:border-orange-500/50 hover:text-orange-400" : "border-gray-200 text-gray-400 hover:border-orange-300"}`}><Edit3 size={15} /></button>}
                    {!selectMode && <button onClick={e => { e.stopPropagation(); togOrderOpen(o.id); }} className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-all ${openOrderIds.has(o.id) ? (dark ? "bg-orange-500/10 text-orange-400 border-orange-500/30" : "bg-orange-50 text-orange-600 border-orange-200") : (dark ? "bg-gray-800 text-gray-300 border-gray-700" : "bg-gray-100 text-gray-700 border-gray-200")}`}>{openOrderIds.has(o.id) ? "Ocultar Itens" : "Ver Itens"}</button>}
                  </div>
                </div>
                {openOrderIds.has(o.id) && (
                <div className={`border-t ${dark ? "border-gray-800" : "border-gray-100"}`}>
                  {(o.items || []).map((item, idx) => (
                    <div key={item.itemId} className={`flex items-start justify-between px-4 py-2.5 gap-3 ${idx < (o.items.length - 1) ? `border-b ${dark ? "border-gray-800" : "border-gray-100"}` : ""}`}>
                      <div className="flex items-start gap-2">
                        {item.images && item.images.length > 0 && (
                          <div className="flex gap-1 overflow-x-auto max-w-32 snap-x hide-scrollbar">
                            {item.images.map((img, i) => <img key={i} src={img} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-gray-600 snap-center" />)}
                          </div>
                        )}
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-black ${item.isMotor ? "bg-blue-500/20 text-blue-400" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}>{item.isMotor ? "M" : idx + 1}</div>
                        <div>
                          <div className="flex items-center gap-1.5"><span className={`text-sm font-semibold ${dark ? "text-gray-200" : "text-gray-800"}`}>{item.toy}</span>{item.isMotor && <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-400">{o.voltage}</span>}</div>
                          {item.observations && <div className={`text-xs mt-0.5 ${dark ? "text-gray-500" : "text-gray-400"}`}>💬 {item.observations}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!item.isMotor && <div className="flex gap-1">{(item.colors || []).map(c => <span key={c} className="w-3.5 h-3.5 rounded-full" style={{ background: COLOR_MAP[c] || "#888" }} title={c} />)}</div>}
                        <span className={`text-xs font-bold ${dark ? "text-gray-300" : "text-gray-700"}`}>R$ {(item.price || 0).toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            );
          })}
          {pagedOrders.length === 0 && <div className={`text-center py-12 ${dark ? "text-gray-500" : "text-gray-400"}`}><Package size={32} className="mx-auto mb-3 opacity-40" /><p className="text-sm">Nenhum pedido encontrado</p></div>}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={`p-2 rounded-lg border disabled:opacity-30 ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}><ChevronLeft size={16} /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`w-9 h-9 rounded-lg text-sm font-bold border ${page === n ? "text-white border-transparent" : ""} ${dark && page !== n ? "border-gray-700 text-gray-400" : ""} ${!dark && page !== n ? "border-gray-300 text-gray-600" : ""}`} style={page === n ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>{n}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={`p-2 rounded-lg border disabled:opacity-30 ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}><ChevronRight size={16} /></button>
            <span className={`text-xs ml-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>{page}/{totalPages} · {filtered.length} pedidos</span>
          </div>
        )}
      </>)}
    </div>
  );
}

// ─── PRODUÇÃO / FINALIZAÇÃO: regras ──────────────────────────────────────────
// Cada etapa com responsável escolhido = 25%. As 4 etapas = 100% e o item vai para a Finalização.
// Na Finalização: pendente 0%, "Finalizando" 50%, "Finalizado" 100%.
const STAGES = [
  { key: "cutter", done: "cutDone", label: "Corte" },
  { key: "tailor", done: "tailorDone", label: "Costura" },
  { key: "prep", done: "prepDone", label: "Preparação" },
  { key: "assembler", done: "assembleDone", label: "Montagem" },
];
const prodPct = (p) => STAGES.filter(st => p && p[st.key]).length * 25;
const finStage = (f) => f?.stage || (f?.done ? "finalizado" : "");
const finPct = (f) => ({ finalizando: 50, finalizado: 100 }[finStage(f)] || 0);

// Recalcula status do pedido a partir da produção e finalização
function syncOrderStatus(nd, orderId) {
  const oi = nd.orders.findIndex(o => o.id === orderId);
  if (oi < 0) return;
  const toys = (nd.orders[oi].items || []).filter(it => !it.isMotor);
  const prods = nd.production.filter(p => p.orderId === orderId);
  const fins = nd.finalization.filter(f => f.orderId === orderId);
  const allFinal = toys.length > 0 && toys.every(it => finStage(fins.find(f => f.itemId === it.itemId)) === "finalizado");
  const started = prods.some(p => prodPct(p) > 0) || fins.length > 0;
  const status = allFinal ? "concluido" : started ? "producao" : "aguardando";
  nd.orders = nd.orders.map((o, i) => i === oi ? { ...o, status } : o);
}

function useSearchRows(rows, data, search) {
  const clientsByName = Object.fromEntries((data.clients || []).map(c => [c.name, c]));
  return rows.filter(r => {
    if (!search.trim()) return true;
    const order = data.orders.find(o => o.id === r._orderId) || r;
    const one = { ...order, items: (order.items || []).filter(it => it.itemId === r._itemId) };
    const hay = orderHaystack(one, { city: clientsByName[order.clientName]?.city, state: clientsByName[order.clientName]?.state, prod: data.production.find(p => p.itemId === r._itemId), finalizer: r.finalizer });
    return matchQuery(hay, r._orderId, search);
  });
}

// Cabeçalho do card: número enorme, vendedor com a cor dele, cliente e brinquedo
function OrderCardHead({ row, data, dark, extra }) {
  const sc = sellerColor(data, row.seller);
  const s = statusBadge(row.deadline, row.done);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        <div className="leading-none">
          <div className="font-black tabular-nums tracking-tight flex items-baseline gap-1" style={{ fontSize: "1.55rem", lineHeight: 1.05, color: dark ? "#fff" : "#0f172a" }}>
            <span className="text-orange-500 text-sm font-black">PEDIDO</span>{orderNumber(row._orderId)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {row.seller && <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: `${sc}22`, color: sc, border: `1px solid ${sc}55` }}>● {row.seller}</span>}
          {row.priority && <span className="text-xs px-2 py-1 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30">🚨 Prioridade</span>}
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>
          {row._isMulti && <span className={`text-xs px-2 py-1 rounded-full font-bold ${dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}>item {row._itemId?.split("-").pop()}</span>}
          {extra}
        </div>
      </div>
      <div className={`font-bold text-base mt-2 ${dark ? "text-gray-200" : "text-gray-800"}`}>{row.toy}</div>
      <div className={`text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>{row.clientName} · {row.voltage} · prazo {fmt(row.deadline)}</div>
      {(row.colors || []).length > 0 && (
        <div className="flex gap-1.5 mt-1.5 flex-wrap">{(row.colors || []).map(c => <span key={c} className={`flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600"}`}><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR_MAP[c] || "#888" }} />{c}</span>)}</div>
      )}
    </div>
  );
}

function ObsAndPhotos({ row, dark, setLightbox }) {
  const [open, setOpen] = useState(false);
  const hasObs = row.observations && row.observations.trim().length > 0;
  const hasImg = row.images && row.images.length > 0;
  if (!hasObs && !hasImg) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl ${open ? dark ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-orange-100 text-orange-700 border border-orange-300" : dark ? "bg-gray-800 text-gray-300 border border-gray-700" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{hasObs && hasImg ? "📋 Obs + Foto" : hasObs ? "📋 Ver Observações" : "🖼️ Ver Foto"}
      </button>
      {open && (
        <div className={`mt-3 p-4 rounded-xl border flex flex-col sm:flex-row gap-4 ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
          {hasObs && <p className={`flex-1 text-sm leading-relaxed whitespace-pre-wrap ${dark ? "text-gray-200" : "text-gray-700"}`}>{row.observations}</p>}
          {hasImg && <div className="flex flex-wrap gap-2">{row.images.map((u, i) => (
            <div key={i} className="relative group cursor-pointer" onClick={() => setLightbox(u)}>
              <img src={u} alt="" className="w-24 h-24 rounded-xl object-cover border-2 border-gray-600" />
              <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><ZoomIn size={22} className="text-white" /></div>
            </div>))}</div>}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ pct, color, dark, size = 64 }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 block">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={dark ? "#1f2937" : "#e5e7eb"} strokeWidth="5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1), stroke .3s" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className={`text-xs font-black ${pct === 100 ? "text-emerald-500" : dark ? "text-white" : "text-gray-800"}`}>{pct}%</span></div>
    </div>
  );
}

// ─── SHARED PROD CARD ─────────────────────────────────────────────────────────
function ProdCard({ row, data, dark, workers, onAssign, onTogglePriority, canEdit, setLightbox }) {
  const pct = prodPct(row);
  const color = pct === 100 ? "#10b981" : pct >= 75 ? "#84cc16" : pct >= 50 ? "#eab308" : "#f97316";
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${row.priority ? "ring-2 ring-red-500/40" : ""}`}>
      <div className="flex items-start justify-between p-4 gap-3">
        <div className="min-w-0 flex-1">
          <OrderCardHead row={row} data={data} dark={dark} />
          <ObsAndPhotos row={row} dark={dark} setLightbox={setLightbox} />
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <ProgressRing pct={pct} color={color} dark={dark} size={56} />
          {canEdit && (
            <button onClick={() => onTogglePriority(row._orderId)} title={row.priority ? "Remover prioridade" : "Marcar como prioridade"}
              className={`p-2 rounded-lg border transition-all ${row.priority ? "bg-red-500/20 border-red-500/40 text-red-400" : dark ? "border-gray-700 text-gray-500 hover:border-red-400 hover:text-red-400" : "border-gray-300 text-gray-400 hover:text-red-500"}`}><Flag size={14} /></button>
          )}
          {pct === 100 && <span className="text-[11px] font-black text-emerald-500 whitespace-nowrap">✓ Na finalização</span>}
        </div>
      </div>
      <div className={`p-4 border-t ${dark ? "border-gray-800 bg-gray-900/60" : "border-gray-100 bg-gray-50/60"}`}>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {STAGES.map(st => {
            const worker = row[st.key];
            const list = workers[st.key] || [];
            return (
              <div key={st.key} className={`p-3 rounded-xl border transition-all ${worker ? (dark ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200") : (dark ? "bg-gray-800/40 border-gray-700/60" : "bg-white border-gray-200")}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-black uppercase tracking-widest ${worker ? "text-emerald-500" : dark ? "text-gray-400" : "text-gray-500"}`}>{st.label}</span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${worker ? "bg-emerald-500 text-white" : dark ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"}`}>{worker ? "✓ 25%" : "0%"}</span>
                </div>
                <select value={worker || ""} disabled={!canEdit} onChange={e => onAssign(row._itemId, st.key, e.target.value)}
                  className={`w-full px-2 py-2 rounded-lg text-sm font-semibold outline-none border ${worker ? (dark ? "bg-gray-950 border-emerald-500/30 text-emerald-300" : "bg-white border-emerald-300 text-emerald-700") : (dark ? "bg-gray-950 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900")} ${!canEdit ? "opacity-60 cursor-not-allowed" : "cursor-pointer focus:border-orange-500"}`}>
                  <option value="">👤 Escolher responsável…</option>
                  {list.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                  {worker && !list.some(w => w.name === worker) && <option value={worker}>{worker}</option>}
                </select>
              </div>
            );
          })}
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: dark ? "#1f2937" : "#e5e7eb" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
        </div>
      </div>
    </div>
  );
}

function StatChips({ items, dark }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
      {items.map(s => (
        <div key={s.label} className={`rounded-lg px-2.5 py-1.5 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} flex items-center gap-2`}>
          <span className="text-xl font-black leading-none tabular-nums" style={{ color: s.color }}>{s.value}</span>
          <span className={`text-xs font-medium leading-tight ${dark ? "text-gray-400" : "text-gray-500"}`}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, dark }) {
  return (
    <div className="relative mb-2">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder='Busque qualquer coisa: "ped 1505", "fut 10x5", "tobogã laranja", "luan", "com logo"…' className={`w-full pl-9 pr-9 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-200 text-gray-900"} focus:border-orange-500`} />
      {value && <button onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-orange-500"><X size={14} /></button>}
    </div>
  );
}

// ─── PRODUCTION TAB ───────────────────────────────────────────────────────────
function ProductionTab({ data, setData, dark, user }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [lightbox, setLightbox] = useState(null);
  const [form, setForm] = useState({ toy: "", clientName: "", deadline: "", seller: "", colors: "", voltage: "110V", observations: "" });
  const canEdit = canEditProd(user);

  const allRows = [];
  data.orders.forEach(order => {
    const orderItems = (order.items || []).filter(it => !it.isMotor);
    orderItems.forEach(item => {
      const prod = data.production.find(p => p.itemId === item.itemId) || {};
      allRows.push({ ...order, ...item, ...prod, done: prodPct(prod) === 100, _orderId: order.id, _itemId: item.itemId, _isMulti: orderItems.length > 1, priority: order.priority || false });
    });
  });
  const sortedRows = sortProdRows(allRows);
  const found = useSearchRows(sortedRows, data, search);
  const activeRows = found.filter(r => !r.done);
  const doneRows = found.filter(r => r.done);
  const delayedRows = activeRows.filter(r => daysLeft(r.deadline) < 0);
  const urgentRows = activeRows.filter(r => { const d = daysLeft(r.deadline); return r.priority || (d >= 0 && d <= 3); });
  const thisMon = sortedRows.filter(r => !r.done && (r.deadline || "").startsWith(CUR_MONTH));
  const nextMon = sortedRows.filter(r => !r.done && (r.deadline || "").startsWith(NEXT_MONTH));

  const active = (role) => data.team.filter(t => t.status === "ativo" && (Array.isArray(role) ? role.includes(t.role) : t.role === role));
  const workers = { cutter: active("Corte"), tailor: active("Costura"), prep: active("Preparação"), assembler: active(["Montagem", "Preparação"]) };

  const filteredRows = filterStatus === "todos" ? [...activeRows, ...doneRows]
    : filterStatus === "atrasados" ? delayedRows
      : filterStatus === "concluidos" ? doneRows
        : filterStatus === "urgente" ? urgentRows
          : activeRows.filter(r => !r.priority && daysLeft(r.deadline) > 3);

  const persist = (nd) => { setData(nd); saveData(nd); };

  // Escolher responsável = etapa concluída (25%). 4 etapas = vai direto para a Finalização.
  const assign = (itemId, field, value) => {
    const nd = { ...data, production: [...data.production], finalization: [...data.finalization] };
    let idx = nd.production.findIndex(p => p.itemId === itemId);
    const row = allRows.find(r => r._itemId === itemId);
    if (idx < 0) { nd.production.push({ itemId, orderId: row?._orderId, cutter: "", tailor: "", prep: "", assembler: "" }); idx = nd.production.length - 1; }
    const st = STAGES.find(x => x.key === field);
    const prev = nd.production[idx];
    // Guarda a DATA em que cada pessoa fez cada etapa (base para "quanto fulano costurou no mês")
    const p = { ...prev, [field]: value, [st.done]: !!value, [`${field}At`]: value ? (prev[field] === value && prev[`${field}At`] ? prev[`${field}At`] : TODAY_STR) : "" };
    p.done = prodPct(p) === 100;
    nd.production[idx] = p;
    const finIdx = nd.finalization.findIndex(f => f.itemId === itemId);
    if (p.done && finIdx < 0) nd.finalization.push({ itemId, orderId: p.orderId, finalizer: "", stage: "", done: false, finDate: null });
    if (!p.done && finIdx >= 0 && finStage(nd.finalization[finIdx]) !== "finalizado") nd.finalization.splice(finIdx, 1);
    syncOrderStatus(nd, p.orderId);
    persist(nd);
  };

  const togglePriority = (orderId) => {
    const nd = { ...data, orders: data.orders.map(o => o.id === orderId ? { ...o, priority: !o.priority } : o) };
    persist(nd);
  };

  const addOrder = () => {
    if (!form.toy?.trim() || !form.clientName?.trim()) { alert("Informe o brinquedo e o cliente."); return; }
    let nd = { ...data }; const newId = nextOrderId(nd.orders); const itemId = `${newId}-1`;
    if (form.seller?.trim()) nd = addSeller(nd, form.seller).data;
    nd.orders = [...nd.orders, { id: newId, clientName: form.clientName, voltage: form.voltage, deadline: form.deadline, seller: form.seller, totalPrice: 0, status: "aguardando", createdAt: TODAY_STR, priority: false, items: [{ itemId, toy: form.toy, colors: form.colors.split(",").map(c => c.trim()).filter(Boolean), price: 0, observations: form.observations, images: [], isMotor: false }] }];
    nd.production = [...nd.production, { itemId, orderId: newId, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false }];
    persist(nd); setShowAdd(false); setForm({ toy: "", clientName: "", deadline: "", seller: "", colors: "", voltage: "110V", observations: "" });
  };

  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`;
  const filterOpts = [["todos", "Todos", activeRows.length + doneRows.length], ["urgente", "Urgente", urgentRows.length], ["atrasados", "Atrasados", delayedRows.length], ["ok", "No prazo", null], ["concluidos", "Concluídos", doneRows.length]];

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className={`flex-shrink-0 pb-3 pt-1 border-b ${dark ? "border-gray-800" : "border-gray-200"}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className={`text-xl font-black leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Produção</h2>
            <p className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>Escolha o responsável de cada etapa — cada uma vale 25%. Ao completar 100% o item vai para a Finalização.</p>
          </div>
          {canEdit && <button onClick={() => setShowAdd(!showAdd)} className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border flex-shrink-0 ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}><Plus size={13} />Adicionar</button>}
        </div>
        <StatChips dark={dark} items={[{ label: "Atrasados", value: delayedRows.length, color: "#ef4444" }, { label: "Prazo no mês", value: thisMon.length, color: "#f97316" }, { label: "Próx. mês", value: nextMon.length, color: "#3b82f6" }, { label: "Prontos", value: doneRows.length, color: "#22c55e" }]} />
        <SearchBox value={search} onChange={setSearch} dark={dark} />
        <div className="flex gap-1.5 flex-wrap">
          {filterOpts.map(([v, l, n]) => (
            <button key={v} onClick={() => setFilterStatus(v)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${filterStatus === v ? "text-white" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"}`} style={filterStatus === v ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>
              {l}{n !== null && <span className="opacity-70"> ({n})</span>}
            </button>
          ))}
        </div>
        {!canEdit && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border ${dark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"}`}>👁️ Somente visualização.</div>}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-3" style={{ minHeight: 0 }}>
        {showAdd && (
          <div className={`rounded-xl p-4 border ${dark ? "bg-gray-900 border-orange-500/30" : "bg-orange-50 border-orange-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>Adicionar à Produção</h4>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg opacity-60 hover:opacity-100"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[["toy", "Brinquedo"], ["clientName", "Cliente"], ["deadline", "Prazo", "date"], ["colors", "Cores"], ["observations", "Observações"]].map(([k, l, t]) => (
                <div key={k}><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>{l}</label><input type={t || "text"} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className={ic} /></div>
              ))}
              <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Vendedor</label><SellerPicker data={data} setData={setData} dark={dark} className={ic} value={form.seller} onChange={v => setForm({ ...form, seller: v })} /></div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addOrder} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Adicionar</button>
              <button onClick={() => setShowAdd(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>Cancelar</button>
            </div>
          </div>
        )}
        {filteredRows.map((row, i) => (
          <ProdCard key={`${row._itemId}-${i}`} row={row} data={data} dark={dark} workers={workers} onAssign={assign} onTogglePriority={togglePriority} canEdit={canEdit} setLightbox={setLightbox} />
        ))}
        {filteredRows.length === 0 && <div className={`text-center py-16 ${dark ? "text-gray-500" : "text-gray-400"}`}><Factory size={36} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">{search ? `Nada encontrado para "${search}"` : "Nenhum item nesta categoria"}</p></div>}
      </div>
    </div>
  );
}

// ─── FINALIZATION TAB ─────────────────────────────────────────────────────────
function FinalizationTab({ data, setData, dark, user }) {
  const [lightbox, setLightbox] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const canEdit = canEditFin(user);

  const finRows = [];
  data.finalization.forEach(fin => {
    const order = data.orders.find(o => o.id === fin.orderId);
    const item = order?.items?.find(it => it.itemId === fin.itemId);
    const prod = data.production.find(p => p.itemId === fin.itemId);
    if (order && item && (prodPct(prod) === 100 || prod?.done)) {
      const toys = (order.items || []).filter(it => !it.isMotor);
      finRows.push({ ...order, ...item, ...fin, stage: finStage(fin), done: finStage(fin) === "finalizado", _orderId: order.id, _itemId: fin.itemId, _isMulti: toys.length > 1, priority: order.priority || false });
    }
  });
  const sorted = sortProdRows(finRows);
  const found = useSearchRows(sorted, data, search);
  const pending = found.filter(r => r.stage === "");
  const doing = found.filter(r => r.stage === "finalizando");
  const doneF = found.filter(r => r.stage === "finalizado");
  const delayed = found.filter(r => !r.done && r.deadline && daysLeft(r.deadline) < 0);
  const finWorkers = data.team.filter(t => t.role === "Finalizador" && t.status === "ativo");

  const filteredRows = filterStatus === "todos" ? [...pending, ...doing, ...doneF]
    : filterStatus === "pendentes" ? pending
      : filterStatus === "finalizando" ? doing
        : filterStatus === "atrasados" ? delayed
          : doneF;

  const persist = (nd) => { setData(nd); saveData(nd); };
  const update = (itemId, patch) => {
    const nd = { ...data, finalization: data.finalization.map(f => f.itemId === itemId ? { ...f, ...patch } : f) };
    const f = nd.finalization.find(x => x.itemId === itemId);
    if (f) syncOrderStatus(nd, f.orderId);
    persist(nd);
  };
  const setStage = (row, stage) => {
    if (stage === "finalizado" && !row.finalizer) { alert("Escolha quem finalizou antes de marcar como Finalizado."); return; }
    const next = row.stage === stage ? "" : stage;
    update(row._itemId, { stage: next, done: next === "finalizado", finDate: next === "finalizado" ? TODAY_STR : null, finalizingAt: next === "finalizando" ? TODAY_STR : (row.finalizingAt || null) });
  };

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className={`flex-shrink-0 pb-3 pt-1 border-b ${dark ? "border-gray-800" : "border-gray-200"}`}>
        <div className="mb-3">
          <h2 className={`text-xl font-black leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Finalização</h2>
          <p className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>Itens que saíram da produção. Pendente 0% · Finalizando 50% · Finalizado 100%</p>
        </div>
        <StatChips dark={dark} items={[{ label: "Pendentes", value: pending.length, color: "#f97316" }, { label: "Finalizando", value: doing.length, color: "#eab308" }, { label: "Atrasados", value: delayed.length, color: "#ef4444" }, { label: "Finalizados", value: doneF.length, color: "#22c55e" }]} />
        <SearchBox value={search} onChange={setSearch} dark={dark} />
        <div className="flex gap-1.5 flex-wrap">
          {[["todos", "Todos", found.length], ["pendentes", "Pendentes", pending.length], ["finalizando", "Finalizando", doing.length], ["atrasados", "Atrasados", delayed.length], ["finalizados", "Finalizados", doneF.length]].map(([v, l, n]) => (
            <button key={v} onClick={() => setFilterStatus(v)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${filterStatus === v ? "text-white" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"}`} style={filterStatus === v ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>{l} <span className="opacity-70">({n})</span></button>
          ))}
        </div>
        {!canEdit && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border ${dark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"}`}>👁️ Somente visualização.</div>}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-3" style={{ minHeight: 0 }}>
        {filteredRows.map((row, i) => {
          const pct = finPct(row);
          const color = pct === 100 ? "#10b981" : pct === 50 ? "#eab308" : "#f97316";
          return (
            <div key={`${row._itemId}-${i}`} className={`rounded-2xl border overflow-hidden ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${row.priority ? "ring-2 ring-red-500/40" : ""}`}>
              <div className="flex items-start justify-between p-4 gap-3">
                <div className="min-w-0 flex-1">
                  <OrderCardHead row={row} data={data} dark={dark} extra={row.done && row.finDate ? <span className="text-xs font-bold text-emerald-500">✓ {fmt(row.finDate)}</span> : null} />
                  <ObsAndPhotos row={row} dark={dark} setLightbox={setLightbox} />
                </div>
                <ProgressRing pct={pct} color={color} dark={dark} size={56} />
              </div>
              <div className={`p-4 border-t flex flex-col md:flex-row md:items-end gap-3 ${dark ? "border-gray-800 bg-gray-900/60" : "border-gray-100 bg-gray-50/60"}`}>
                <div className="flex-1 max-w-xs">
                  <div className={`text-xs font-black uppercase tracking-widest mb-1.5 ${row.finalizer ? "text-emerald-500" : dark ? "text-gray-400" : "text-gray-500"}`}>Finalizador</div>
                  <select value={row.finalizer || ""} disabled={!canEdit} onChange={e => update(row._itemId, { finalizer: e.target.value })}
                    className={`w-full px-2 py-2 rounded-lg text-sm font-semibold border outline-none ${dark ? "bg-gray-950 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"} ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <option value="">👤 Escolher…</option>
                    {finWorkers.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    {row.finalizer && !finWorkers.some(w => w.name === row.finalizer) && <option value={row.finalizer}>{row.finalizer}</option>}
                  </select>
                </div>
                <div className={`flex rounded-xl p-1 gap-1 ${dark ? "bg-gray-950 border border-gray-800" : "bg-white border border-gray-200"}`}>
                  {[["finalizando", "Finalizando · 50%", "#eab308"], ["finalizado", "Finalizado · 100%", "#10b981"]].map(([st, label, c]) => {
                    const on = row.stage === st;
                    return <button key={st} disabled={!canEdit} onClick={() => setStage(row, st)} className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`} style={on ? { background: c, color: "#fff", boxShadow: `0 6px 20px ${c}55` } : { color: dark ? "#9ca3af" : "#6b7280" }}>{on && "✓ "}{label}</button>;
                  })}
                </div>
              </div>
              <div className="h-1.5" style={{ background: dark ? "#1f2937" : "#e5e7eb" }}><div className="h-full" style={{ width: `${pct}%`, background: color, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} /></div>
            </div>
          );
        })}
        {filteredRows.length === 0 && (
          <div className={`text-center py-16 ${dark ? "text-gray-500" : "text-gray-400"}`}>
            <Sparkles size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">{search ? `Nada encontrado para "${search}"` : "Nenhum brinquedo aguardando finalização"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Dashboard: ver src/tabs/DashboardTab.jsx

function ClientsTab({ data, setData, dark, user }) {
  const canWrite = canEdit(user, "clients");
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [openClient, setOpenClient] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [activeOrderDetails, setActiveOrderDetails] = useState(null);
  const [editingClient, setEditingClient] = useState(null);

  const saveClientEdit = (e) => {
    e.preventDefault();
    const nd = { ...data };
    const ci = nd.clients.findIndex(c => c.id === editingClient.id);
    if (ci >= 0) {
      const oldName = nd.clients[ci].name;
      const newName = (editingClient.name || "").trim() || oldName;
      nd.clients[ci] = { ...editingClient, name: newName };
      if (newName !== oldName) nd.orders = nd.orders.map(o => o.clientName === oldName ? { ...o, clientName: newName } : o);
      setData(nd);
      saveData(nd);
    }
    setEditingClient(null);
  };

  const getSellerForClient = (n) => { const o = data.orders.filter(x => x.clientName === n); return o.length ? o[o.length - 1].seller : null; };
  const clientOrders = (n) => data.orders.filter(o => o.clientName === n);

  const filtered = data.clients.filter(c => {
    const q = search.toLowerCase();
    const hay = norm([c.name, c.city, c.state, clientUF(c), c.phone, c.email, ...clientOrders(c.name).map(o => orderHaystack(o))].join(" "));
    const matchName = matchQuery(hay, "", search);
    const lastSeller = getSellerForClient(c.name);
    const matchSeller = !sellerFilter || clientOrders(c.name).some(o => sameSeller(data.sellers, o.seller, sellerFilter));
    const matchSearch = !q || matchName;
    return matchSearch && matchSeller;
  });

  return (
    <div className="space-y-5">
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div><h2 className={`text-2xl font-black ${dark ? "text-white" : "text-gray-900"}`}>Clientes</h2><p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Histórico de pedidos e dados de contato</p></div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${dark ? "text-gray-400" : "text-gray-400"}`} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou cidade..." className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-200 text-gray-900"}`} /></div>
        <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} className={`px-3 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`}>
          <option value="">Todos os vendedores</option>
          {(data.sellers || []).map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {filtered.map(c => {
          const orders = clientOrders(c.name); const total = orders.reduce((a, b) => a + (b.totalPrice || 0), 0); const lastSeller = getSellerForClient(c.name); const sc = sellerColor(data, lastSeller); const isOpen = openClient === c.id;
          return (
            <div key={c.id} className={`rounded-xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${isOpen ? "border-orange-500/40" : ""}`}>
              <div className="flex items-center justify-between p-4 gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-base flex-shrink-0" style={{ background: `linear-gradient(135deg,${sc}88,${sc})` }}>{(c.name || "?").slice(0, 2).toUpperCase()}</div>
                  <div className="flex flex-col gap-0.5">
                    <div className={`font-bold text-lg ${dark ? "text-white" : "text-gray-900"}`}>{c.name}</div>
                    <div className={`text-xs font-medium ${dark ? "text-gray-300" : "text-gray-600"}`}>
                      {c.city || "S/ Cidade"} {clientUF(c) ? (normalizeState((c.city || "").split(/[-\/,]/).pop()) === clientUF(c) && /[-\/,]/.test(c.city || "") ? "" : `- ${clientUF(c)}`) : <span className="text-amber-500 font-bold">· sem estado</span>}
                      {c.phone && <span className="ml-2 border-l border-gray-300 pl-2 dark:border-gray-700">📞 {c.phone}</span>}
                      {whatsappLink(c.phone) && <a href={whatsappLink(c.phone, `Olá ${c.name}! 👋🎈`)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="ml-2 px-2 py-0.5 rounded-full bg-[#25D366] text-white text-[10px] font-black">💬 WhatsApp</a>}
                      {c.email && <span className="ml-2 border-l border-gray-300 pl-2 dark:border-gray-700">✉️ {c.email}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {lastSeller && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm" style={{ background: `${sc}22`, color: sc }}>👤 {lastSeller}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <div className="text-xl font-black" style={{ color: "#f97316" }}>{orders.length}</div>
                    <div className={`text-[10px] uppercase font-bold tracking-wider ${dark ? "text-gray-500" : "text-gray-400"}`}>pedidos</div>
                  </div>
                  <div className="text-right hidden md:block">
                    <div className={`text-lg font-black ${dark ? "text-white" : "text-gray-900"}`}>R$ {total.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {canWrite && <button onClick={(e) => { e.stopPropagation(); setEditingClient(c); }} className={`p-2 rounded-xl border transition-all ${dark ? "border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-500/50" : "border-gray-200 text-gray-500 hover:text-orange-500 hover:bg-orange-50"} `}>
                      <Edit3 size={18} />
                    </button>}
                    <button onClick={() => setOpenClient(isOpen ? null : c.id)} className={`p-2 rounded-xl border transition-all ${dark ? "border-gray-700 text-gray-400 hover:bg-gray-800" : "border-gray-200 text-gray-500 hover:bg-gray-50"} ${isOpen ? (dark ? "bg-gray-800" : "bg-gray-100") : ""}`}>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className={`border-t ${dark ? "border-gray-800" : "border-gray-100"}`}>
                  <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wide border-t ${dark ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-500"}`}>Histórico de Pedidos</div>
                  {orders.length === 0 ? <div className={`px-4 pb-4 text-sm ${dark ? "text-gray-500" : "text-gray-400"}`}>Nenhum pedido.</div> : orders.map(o => {
                    const s = statusBadge(o.deadline, o.status === "concluido");
                    return (
                      <div key={o.id} className={`border-t ${dark ? "border-gray-800" : "border-gray-100"}`}>
                        <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2"><span className={`font-mono text-sm font-bold ${dark ? "text-orange-400" : "text-orange-600"}`}>{o.id}</span><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span></div>
                            <div className={`text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>{fmt(o.deadline)} · {o.voltage} · {o.items?.length || 0} itens</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold text-sm ${dark ? "text-white" : "text-gray-900"}`}>R$ {(o.totalPrice || 0).toLocaleString("pt-BR")}</span>
                            <button onClick={(e) => { e.stopPropagation(); setActiveOrderDetails(o); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-md transition-all hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>
                              <FileText size={14} /> Detalhes do Pedido
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className={`text-center py-12 ${dark ? "text-gray-500" : "text-gray-400"}`}><Users size={32} className="mx-auto mb-3 opacity-40" /><p className="text-sm">Nenhum cliente encontrado</p></div>}
      </div>

      {editingClient && (
        <div className="fixed inset-0 z-[60] p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setEditingClient(null)}>
          <form onSubmit={saveClientEdit} onClick={e => e.stopPropagation()} className={`w-full max-w-lg rounded-3xl border shadow-2xl p-6 space-y-4 ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-black text-xl ${dark ? "text-white" : "text-gray-900"}`}>Editar Cliente</h3>
              <button type="button" onClick={() => setEditingClient(null)} className={`p-2 rounded-xl ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}><X size={18} /></button>
            </div>
            {[["name", "Nome"], ["city", "Cidade"], ["phone", "Telefone"], ["email", "E-mail"]].map(([k, l]) => (
              <div key={k}>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>{l}</label>
                <input value={editingClient[k] || ""} onChange={e => setEditingClient({ ...editingClient, [k]: e.target.value })} className={`w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`} />
              </div>
            ))}
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Estado (usado no Mapa)</label>
              <select value={normalizeState(editingClient.state) || ""} onChange={e => setEditingClient({ ...editingClient, state: e.target.value })} className={`w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`}>
                <option value="">— selecione —</option>
                {Object.entries(UF_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([uf, n]) => <option key={uf} value={uf}>{n} ({uf})</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 py-2.5 rounded-xl text-sm font-black text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Salvar</button>
              <button type="button" onClick={() => setEditingClient(null)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {activeOrderDetails && (
        <div className="fixed inset-0 z-[60] p-4 bg-black/80 backdrop-blur-sm" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }} onClick={() => setActiveOrderDetails(null)}>
          <div className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border shadow-2xl transition-all ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`} onClick={e => e.stopPropagation()}>
            <div className={`sticky top-0 px-6 py-4 flex items-center justify-between border-b z-10 ${dark ? "bg-gray-900/90 border-gray-800" : "bg-white/90 border-gray-100"} backdrop-blur-md`}>
              <div>
                <h3 className={`font-black text-xl flex items-center gap-2 ${dark ? "text-white" : "text-gray-900"}`}><Package size={20} className="text-orange-500"/> Pedido {activeOrderDetails.id}</h3>
                <span className={`text-xs font-bold ${dark ? "text-gray-400" : "text-gray-500"}`}>{activeOrderDetails.clientName} · Voltagem {activeOrderDetails.voltage}</span>
              </div>
              <button onClick={() => setActiveOrderDetails(null)} className={`p-2 rounded-xl transition-all ${dark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}><X size={18} /></button>
            </div>
            
            <div className="p-6 space-y-4">
              {(activeOrderDetails.items || []).map((it, i) => (
                <div key={i} className={`rounded-2xl p-4 border ${dark ? "bg-gray-800/40 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex items-start justify-between mb-3 border-b pb-3 border-dashed" style={{ borderColor: dark ? "#374151" : "#e5e7eb" }}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-black ${dark ? "text-white" : "text-gray-900"}`}>{it.toy}</span>
                        {it.isMotor && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-400">Motor</span>}
                      </div>
                      {!it.isMotor && <div className="flex gap-1">{(it.colors || []).map(cc => <span key={cc} title={cc} className="w-3.5 h-3.5 rounded-full border shadow-sm" style={{ background: COLOR_MAP[cc] || "#888", borderColor: dark ? "#374151" : "#e5e7eb" }} />)}</div>}
                    </div>
                    <span className={`text-sm font-black ${dark ? "text-green-400" : "text-green-600"}`}>R$ {(it.price || 0).toLocaleString("pt-BR")}</span>
                  </div>
                  
                  {it.observations && (
                    <div className="mb-3">
                      <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${dark ? "text-gray-500" : "text-gray-400"}`}><FileText size={10} className="inline mr-1"/> Observações</div>
                      <p className={`text-sm leading-relaxed p-3 rounded-xl ${dark ? "bg-gray-900 border border-gray-700 text-gray-300" : "bg-white border border-gray-200 text-gray-700"}`}>{it.observations}</p>
                    </div>
                  )}

                  {it.images && it.images.length > 0 && (
                     <div>
                       <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 mt-2 ${dark ? "text-gray-500" : "text-gray-400"}`}><Image size={10} className="inline mr-1"/> Referências visuais</div>
                       <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                         {it.images.map((img, idx) => (
                           <div key={idx} className="relative group cursor-pointer flex-shrink-0" onClick={() => setLightbox(img)}>
                             <img src={img} alt="" className="w-20 h-20 rounded-xl object-cover border-2 shadow-sm transition-transform hover:scale-105" style={{ borderColor: dark ? "#4b5563" : "#d1d5db" }} />
                             <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><ZoomIn size={16} className="text-white"/></div>
                           </div>
                         ))}
                       </div>
                     </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TEAM TAB ─────────────────────────────────────────────────────────────────
// Converte o formato antigo (lista) para { aba: "view" | "edit" }
function toPermObj(p) {
  if (Array.isArray(p)) return Object.fromEntries(p.filter(k => EMPLOYEE_TABS.includes(k)).map(k => [k, "edit"]));
  return { ...(p || {}) };
}
const PERM_TAB_LABELS = { dashboard: 'Dashboard', orders: 'Pedidos', production: 'Produção', finalization: 'Finalização', routes: 'Mapa', clients: 'Clientes', sales: 'Área dos Vendedores' };
const PERM_TAB_HINT = { dashboard: 'números da empresa e IA do gerente', orders: 'criar, editar e excluir pedidos', production: 'escolher responsáveis das etapas', finalization: 'finalizando / finalizado', routes: 'mapa, filtros, rotas e fábrica', clients: 'dados e estado dos clientes', sales: 'clientes, vendas, CRM e IA de vendas' };
function PermissionGrid({ value, onChange, dark }) {
  const perms = toPermObj(value);
  const opts = [["", "Sem acesso", "#64748b"], ["view", "Só visualizar", "#0ea5e9"], ["edit", "Visualizar e editar", "#10b981"]];
  const set = (tab, lvl) => { const n = { ...perms }; if (lvl) n[tab] = lvl; else delete n[tab]; onChange(n); };
  const all = (lvl) => onChange(lvl ? Object.fromEntries(EMPLOYEE_TABS.map(t => [t, lvl])) : {});
  return (
    <div className={`rounded-xl border overflow-hidden ${dark ? 'border-gray-800' : 'border-gray-200'}`}>
      <div className={`flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold ${dark ? 'bg-gray-800/60 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
        <span>Aplicar a todas:</span>
        <div className='flex gap-1'>{opts.map(([lvl, label, c]) => <button type='button' key={lvl || 'none'} onClick={() => all(lvl)} className='px-2 py-0.5 rounded-md border' style={{ borderColor: `${c}66`, color: c }}>{label}</button>)}</div>
      </div>
      {EMPLOYEE_TABS.map((tab, i) => (
        <div key={tab} className={`flex flex-col md:flex-row md:items-center justify-between gap-2 px-3 py-2.5 ${i ? (dark ? 'border-t border-gray-800' : 'border-t border-gray-100') : ''}`}>
          <div className='min-w-0'>
            <div className='text-sm font-black'>{PERM_TAB_LABELS[tab]}</div>
            <div className='text-[11px] text-slate-500'>{PERM_TAB_HINT[tab]}</div>
          </div>
          <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl flex-shrink-0 md:w-[380px] ${dark ? 'bg-gray-950' : 'bg-gray-100'}`}>
            {opts.map(([lvl, label, c]) => {
              const on = (perms[tab] || "") === lvl;
              return <button type='button' key={lvl || 'none'} onClick={() => set(tab, lvl)} className={`px-2 py-2 rounded-lg text-xs font-black transition-all ${on ? 'text-white shadow' : dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-800'}`} style={on ? { background: c } : {}}>{on && '✓ '}{label}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamTab({ data, setData, dark, user }) {
  const [activeSubTab, setActiveSubTab] = useState('members'); 
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'Corte', status: 'ativo' });
  const EMPTY_USER = { name: '', email: '', password: '', permissions: { production: 'edit' } };
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [openUser, setOpenUser] = useState(null);
  const [showPw, setShowPw] = useState({});
  const [showUserForm, setShowUserForm] = useState(false);
  const [sellerForm, setSellerForm] = useState({ name: '', color: '' });
  const [showSellerForm, setShowSellerForm] = useState(false);
  const [pwEdit, setPwEdit] = useState(null);      // { id, value }
  const [confirmDel, setConfirmDel] = useState(null); // id do login a excluir
  const [sellerEdit, setSellerEdit] = useState(null); // { id, name, color }
  const [sellerMsg, setSellerMsg] = useState('');

  const ALL_TABS = ['orders', 'production', 'finalization', 'dashboard', 'routes', 'clients', 'team'];
  const TAB_LABELS = { 'orders': 'Pedidos', 'production': 'Produção', 'finalization': 'Finalização', 'dashboard': 'Dashboard', 'routes': 'MAPA', 'clients': 'Clientes', 'team': 'Equipe' };

  const addMember = () => { if (!form.name) return; const nd = { ...data }; nd.team.push({ id: Date.now(), ...form }); setData(nd); saveData(nd); setForm({ name: '', role: 'Corte', status: 'ativo' }); setShowForm(false); };
  const persistTeam = (nd) => { const fixed = ensureSellers(nd); setData(fixed); saveData(fixed); };
  const addSellerT = () => { if (!sellerForm.name.trim()) return; const { data: nd } = addSeller(data, sellerForm.name, sellerForm.color || undefined); persistTeam(nd); setSellerForm({ name: '', color: '' }); setShowSellerForm(false); };
  const removeSeller = (sv) => {
    const n = (data.orders || []).filter(o => sameSeller(data.sellers, o.seller, sv.name)).length;
    if (n) { setSellerMsg(`${sv.name} tem ${n} pedido(s) e não pode ser apagado. Você pode renomear ou trocar a cor.`); setTimeout(() => setSellerMsg(''), 5000); return; }
    persistTeam({ ...data, sellers: data.sellers.filter(x => x.id !== sv.id) });
  };
  // Trocar nome/cor do vendedor: atualiza pedidos e logins ligados a ele (a cor muda em todo o app)
  const saveSellerEdit = () => {
    const sv = data.sellers.find(x => x.id === sellerEdit.id); if (!sv) return;
    const newName = sellerEdit.name.trim() || sv.name;
    const nd = {
      ...data,
      sellers: data.sellers.map(x => x.id === sv.id ? { ...x, name: newName, color: sellerEdit.color } : x),
      orders: data.orders.map(o => sameSeller(data.sellers, o.seller, sv.name) ? { ...o, seller: newName } : o),
      users: (data.users || []).map(u => u.sellerName && sameSeller(data.sellers, u.sellerName, sv.name) ? { ...u, sellerName: newName } : u),
    };
    persistTeam(nd); setSellerEdit(null);
  };

  const [copied, setCopied] = useState(false);
  const accessLink = `${window.location.origin}/?empresa=${user?.company_id || ""}`;
  const copyLink = async () => { try { await navigator.clipboard.writeText(accessLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copie o link:", accessLink); } };
  const updateUser = (uid, patch) => { const nd = { ...data }; nd.users = nd.users.map(u => u.id !== uid ? u : { ...u, ...patch }); setData(nd); saveData(nd); };
  const permSummary = (p) => { const o = toPermObj(p); const e = Object.keys(o).filter(k => o[k] === 'edit').map(k => PERM_TAB_LABELS[k]); const v = Object.keys(o).filter(k => o[k] === 'view').map(k => PERM_TAB_LABELS[k]); return [e.length ? `Edita: ${e.join(', ')}` : '', v.length ? `Vê: ${v.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Sem acesso a nenhuma aba'; };
  const toggleMemberStatus = (id) => { const nd = { ...data }; nd.team = nd.team.map(m => m.id !== id ? m : { ...m, status: m.status === 'ativo' ? 'inativo' : 'ativo' }); setData(nd); saveData(nd); };

  const addUser = () => {
    if (!userForm.name || !userForm.email || !userForm.password) { alert('Preencha nome, usuário e senha.'); return; }
    if ((data.users || []).some(u => (u.email || '').toLowerCase() === userForm.email.trim().toLowerCase())) { alert('Esse usuário já existe.'); return; }
    const nd = { ...data }; nd.users = nd.users || []; nd.users.push({ id: Date.now(), name: userForm.name, email: userForm.email.trim().toLowerCase(), password: userForm.password, role: 'user', permissions: toPermObj(userForm.permissions), sellerName: userForm.sellerName || '' });
    setData(nd); saveData(nd); setUserForm(EMPTY_USER); setShowUserForm(false);
  };

  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`;

  return (
    <div className='space-y-6 animate-slide-up'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='page-title page-title-underline'>Gestão de Equipe</h2>
          <p className='text-sm text-slate-500 mt-1 font-medium'>Controle de colaboradores, logins e vendedores</p>
        </div>
      </div>

      <div className={`flex gap-2 p-1 rounded-xl w-fit ${dark ? 'bg-gray-900 border border-gray-800' : 'bg-black/5'}`}>
        {[{id:'members', label:'Colaboradores', icon:<Users size={14}/>}, {id:'logins', label:'Logins', icon:<Shield size={14}/>}, {id:'sellers', label:'Vendedores', icon:<UserPlus size={14}/>}].map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === t.id ? (dark ? 'bg-gray-800 shadow-sm text-orange-500' : 'bg-white shadow-sm text-orange-600') : 'text-slate-500 hover:text-orange-500'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'members' && (
        <div className='space-y-4'>
          <div className='flex justify-end'><button onClick={() => setShowForm(true)} className='btn-brand text-xs'><Plus size={14}/> Novo Colaborador</button></div>
          {showForm && (
            <div className='card-surface p-4 border-orange-500/30 animate-slide-up'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
                <input placeholder='Nome' value={form.name} onChange={e => setForm({...form, name:e.target.value})} className={ic} />
                <select value={form.role} onChange={e => setForm({...form, role:e.target.value})} className={ic}>
                  {['Corte', 'Costura', 'Preparação', 'Montagem', 'Finalizador'].map(r => <option key={r}>{r}</option>)}
                </select>
                <div className='flex gap-2'><button onClick={addMember} className='btn-brand flex-1'>Salvar</button><button onClick={() => setShowForm(false)} className={`px-3 rounded-xl text-sm font-bold ${dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}><X size={14}/></button></div>
              </div>
            </div>
          )}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {data.team.map(m => (
              <div key={m.id} className='card-surface p-4 flex items-center justify-between'>
                <div className={`flex items-center gap-3 ${m.status === 'ativo' ? '' : 'opacity-50'}`}>
                  <div className='w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-600 font-black'>{(m.name || '?')[0]}</div>
                  <div><p className='font-bold text-sm'>{m.name}</p><p className='text-xs text-slate-500'>{m.role}{m.status !== 'ativo' ? ' · inativo' : ''}</p></div>
                </div>
                <div className='flex items-center gap-1'>
                <button onClick={() => toggleMemberStatus(m.id)} className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${m.status === 'ativo' ? 'border-emerald-500/40 text-emerald-500' : dark ? 'border-gray-700 text-gray-500' : 'border-gray-300 text-gray-500'}`}>{m.status === 'ativo' ? 'Ativo' : 'Inativo'}</button>
                <button onClick={() => { const nd={...data}; nd.team=nd.team.filter(x=>x.id!==m.id); setData(nd); saveData(nd); }} className='p-2 text-slate-400 hover:text-red-500 transition-colors'><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'logins' && (
        <div className='space-y-4'>
          <div className={`card-surface p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between`}>
            <div className='min-w-0'>
              <div className='text-[11px] font-bold uppercase tracking-wider text-slate-500'>Link de acesso da equipe</div>
              <div className='text-xs font-mono truncate text-orange-500'>{accessLink}</div>
              <div className='text-[11px] text-slate-500'>Envie este link aos funcionários. Eles entram com o usuário e senha criados aqui.</div>
            </div>
            <div className='flex gap-2 flex-shrink-0'>
              <button onClick={copyLink} className={`px-3 py-2 rounded-xl text-xs font-bold border ${dark ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-gray-700'}`}>{copied ? 'Copiado ✓' : 'Copiar link'}</button>
              <button onClick={() => setShowUserForm(true)} className='btn-brand text-xs'><Shield size={14}/> Novo Login</button>
            </div>
          </div>
          {showUserForm && (
            <div className='card-surface p-4 border-orange-500/30 animate-slide-up'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
                <input placeholder='Nome' value={userForm.name} onChange={e => setUserForm({...userForm, name:e.target.value})} className={ic} />
                <input placeholder='Usuário' value={userForm.email} onChange={e => setUserForm({...userForm, email:e.target.value})} className={ic} />
                <input placeholder='Senha' type='password' value={userForm.password} onChange={e => setUserForm({...userForm, password:e.target.value})} className={ic} />
              </div>
              <div className='mb-4'>
                <div className='text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2'>O que este funcionário pode fazer</div>
                <PermissionGrid value={userForm.permissions} onChange={(p) => setUserForm({ ...userForm, permissions: p })} dark={dark} />
                <div className='mt-3'>
                  <div className='text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1'>Este login é de um vendedor?</div>
                  <select value={userForm.sellerName || ''} onChange={e => setUserForm({ ...userForm, sellerName: e.target.value })} className={ic}>
                    <option value=''>Não — é da fábrica/escritório</option>
                    {(data.sellers || []).map(sv => <option key={sv.id || sv.name} value={sv.name}>Sim — {sv.name} (vê só os próprios clientes e vendas)</option>)}
                  </select>
                </div>
                <p className='text-[11px] text-slate-500 mt-2'>A aba Equipe (logins, colaboradores e vendedores) é só do gerente.</p>
              </div>
              <div className='flex gap-2'><button onClick={addUser} className='btn-brand'>Criar Acesso</button><button onClick={() => setShowUserForm(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${dark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>Cancelar</button></div>
            </div>
          )}
          <div className='space-y-2'>
            {(data.users || []).length === 0 && <div className='text-center py-10 text-sm text-slate-500'>Nenhum login de funcionário criado ainda.</div>}
            {(data.users || []).map(u => (
              <div key={u.id} className='card-surface p-4'>
                <div className='flex items-center justify-between gap-3 flex-wrap'>
                  <div className='min-w-0'>
                    <p className='font-bold text-sm'>{u.name}</p>
                    <p className='text-xs text-slate-500'>usuário: <b>{u.email}</b> · senha: <span className='font-mono'>{showPw[u.id] ? u.password : '••••'}</span> <button onClick={() => setShowPw({ ...showPw, [u.id]: !showPw[u.id] })} className='underline ml-1'>{showPw[u.id] ? 'ocultar' : 'mostrar'}</button></p>
                    <p className='text-[11px] text-slate-500 mt-1'>{permSummary(u.permissions)}{u.sellerName ? ` · vendedor: ${u.sellerName}` : ''}</p>
                  </div>
                  <div className='flex gap-2'>
                    <button onClick={() => setOpenUser(openUser === u.id ? null : u.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${openUser === u.id ? 'border-orange-500 text-orange-500' : dark ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-gray-700'}`}>{openUser === u.id ? 'Fechar' : 'Permissões'}</button>
                    <button onClick={() => { setConfirmDel(null); setPwEdit(pwEdit?.id === u.id ? null : { id: u.id, value: '' }); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${pwEdit?.id === u.id ? 'border-orange-500 text-orange-500' : dark ? 'border-gray-700 text-gray-300' : 'border-gray-300 text-gray-700'}`}>Trocar senha</button>
                    <button onClick={() => { setPwEdit(null); setConfirmDel(confirmDel === u.id ? null : u.id); }} title='Excluir login' className={`p-2 rounded-xl ${confirmDel === u.id ? 'text-red-500 bg-red-500/10' : 'text-slate-400 hover:text-red-500'}`}><Trash2 size={16}/></button>
                  </div>
                </div>
                {pwEdit?.id === u.id && (
                  <div className='mt-3 flex gap-2 flex-wrap items-center animate-slide-up'>
                    <input autoFocus type='text' value={pwEdit.value} onChange={e => setPwEdit({ ...pwEdit, value: e.target.value })} placeholder='Nova senha' className={`${ic} !w-56`} />
                    <button disabled={!pwEdit.value.trim()} onClick={() => { updateUser(u.id, { password: pwEdit.value.trim() }); setPwEdit(null); setShowPw({ ...showPw, [u.id]: true }); }} className='px-3 py-2 rounded-xl text-xs font-black bg-emerald-500 text-white disabled:opacity-40'>Salvar senha</button>
                    <button onClick={() => setPwEdit(null)} className='px-3 py-2 rounded-xl text-xs font-bold text-slate-500'>Cancelar</button>
                  </div>
                )}
                {confirmDel === u.id && (
                  <div className='mt-3 p-3 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center gap-2 flex-wrap animate-slide-up'>
                    <span className='text-sm font-bold text-red-400'>Excluir o login de {u.name}? Ele não vai mais conseguir entrar.</span>
                    <button onClick={() => { const nd = { ...data, users: (data.users || []).filter(x => x.id !== u.id) }; setData(nd); saveData(nd); setConfirmDel(null); }} className='px-3 py-1.5 rounded-xl text-xs font-black bg-red-500 text-white'>Sim, excluir</button>
                    <button onClick={() => setConfirmDel(null)} className='px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400'>Cancelar</button>
                  </div>
                )}
                {openUser === u.id && <div className='mt-3'><PermissionGrid value={u.permissions} onChange={(p) => updateUser(u.id, { permissions: p })} dark={dark} />
                  <div className='mt-3 flex items-center gap-2 flex-wrap'><span className='text-[11px] font-bold uppercase tracking-wider text-slate-500'>Vendedor vinculado:</span>
                    <select value={u.sellerName || ''} onChange={e => updateUser(u.id, { sellerName: e.target.value })} className={`${ic} !w-auto`}>
                      <option value=''>Nenhum</option>{(data.sellers || []).map(sv => <option key={sv.id || sv.name} value={sv.name}>{sv.name}</option>)}
                    </select></div><p className='text-[11px] text-slate-500 mt-2'>As mudanças são salvas na hora e valem na próxima vez que o funcionário abrir o app.</p></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'sellers' && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-2 flex-wrap'>
            <p className='text-xs text-slate-500'>Vendedores entram sozinhos quando aparecem num pedido, cada um com cor própria e login automático (senha 1234). A cor escolhida aqui vale para o app inteiro.</p>
            <button onClick={() => setShowSellerForm(true)} className='btn-brand text-xs'><Plus size={14}/> Novo Vendedor</button>
          </div>
          {sellerMsg && <div className='p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm font-bold text-amber-500'>{sellerMsg}</div>}
          {showSellerForm && (
            <div className='card-surface p-4 border-orange-500/30 animate-slide-up'>
              <div className='flex gap-3 flex-wrap items-center'>
                <input placeholder='Nome do Vendedor' value={sellerForm.name} onChange={e => setSellerForm({...sellerForm, name:e.target.value})} className={`${ic} !w-64`} />
                <div className='flex gap-1.5 flex-wrap'>{SELLER_PALETTE.map(c => { const used = (data.sellers || []).some(x => (x.color || '').toLowerCase() === c); return <button key={c} disabled={used} title={used ? 'Cor já usada' : ''} onClick={() => setSellerForm({ ...sellerForm, color: c })} className={`w-7 h-7 rounded-full ${used ? 'opacity-20 cursor-not-allowed' : ''} ${sellerForm.color === c ? 'ring-2 ring-offset-2 ring-white' : ''}`} style={{ background: c }} />; })}</div>
                <button onClick={addSellerT} className='btn-brand'>Adicionar</button>
                <button onClick={() => setShowSellerForm(false)} className='px-3 py-2 rounded-xl text-sm font-bold text-slate-500'>Cancelar</button>
              </div>
            </div>
          )}
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
            {(data.sellers || []).map(sv => {
              const n = (data.orders || []).filter(o => sameSeller(data.sellers, o.seller, sv.name)).length;
              const login = (data.users || []).find(u => u.sellerName && sameSeller(data.sellers, u.sellerName, sv.name));
              const editing = sellerEdit?.id === sv.id;
              return (
                <div key={sv.id} className='card-surface p-4' style={{ boxShadow: `inset 4px 0 0 ${sv.color}` }}>
                  {!editing ? (
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-3 min-w-0'>
                        <div className='w-9 h-9 rounded-xl flex items-center justify-center text-white font-black flex-shrink-0' style={{ background: sv.color }}>{(sv.name || '?')[0]}</div>
                        <div className='min-w-0'><div className='font-black text-sm truncate' style={{ color: sv.color }}>{sv.name}</div><div className='text-[11px] text-slate-500'>{n} pedido(s){login ? ` · login: ${login.email}` : ' · sem login'}</div></div>
                      </div>
                      <div className='flex gap-1 flex-shrink-0'>
                        <button onClick={() => setSellerEdit({ id: sv.id, name: sv.name, color: sv.color })} className='p-2 text-slate-400 hover:text-orange-500'><Edit3 size={15}/></button>
                        <button onClick={() => removeSeller(sv)} className='p-2 text-slate-400 hover:text-red-500'><Trash2 size={15}/></button>
                      </div>
                    </div>
                  ) : (
                    <div className='space-y-2'>
                      <input value={sellerEdit.name} onChange={e => setSellerEdit({ ...sellerEdit, name: e.target.value })} className={ic} />
                      <div className='flex gap-1.5 flex-wrap items-center'>{SELLER_PALETTE.map(c => { const used = (data.sellers || []).some(x => x.id !== sv.id && (x.color || '').toLowerCase() === c); return <button key={c} disabled={used} onClick={() => setSellerEdit({ ...sellerEdit, color: c })} className={`w-6 h-6 rounded-full ${used ? 'opacity-20 cursor-not-allowed' : ''} ${sellerEdit.color === c ? 'ring-2 ring-offset-2 ring-white' : ''}`} style={{ background: c }} />; })}
                        <input type='color' value={sellerEdit.color?.startsWith('#') ? sellerEdit.color : '#f97316'} onChange={e => setSellerEdit({ ...sellerEdit, color: e.target.value })} className='w-7 h-7 p-0 border-none bg-transparent cursor-pointer' title='Outra cor' />
                      </div>
                      <div className='flex gap-2'><button onClick={saveSellerEdit} className='px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-500 text-white'>Salvar</button><button onClick={() => setSellerEdit(null)} className='px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500'>Cancelar</button></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
// MAPA: ver src/tabs/MapTab.jsx

const SESSION_KEY = "ags_session";
function loadSession() {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.company_id ? s : null; } catch { return null; }
}
// Abas que o usuário pode ver: dono vê tudo; funcionário vê só o que foi liberado em Equipe > Logins
const allowedTabs = (user) => {
  if (!user) return [];
  if (user.role === "admin") return Object.keys(TAB_META);
  return Object.keys(TAB_META).filter(k => k !== "team" && permLevel(user, k));
};

// Primeira tela ao entrar: vendedor cai na área dele; gerente no Dashboard
const firstTab = (u) => { const t = allowedTabs(u); if (u?.sellerName && t.includes("sales")) return "sales"; if (t.includes("dashboard")) return "dashboard"; return t[0] || "orders"; };

function MainApp() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("ags_dark") !== "0"; } catch { return true; } });
  const [user, setUser] = useState(loadSession);
  const [data, setData] = useState(emptyData);
  const [tab, setTab] = useState(() => firstTab(loadSession()));
  const login = (u) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); localStorage.setItem("ags_last_company", u.company_id); } catch { }
    setData(emptyData()); setLoadingServer(true);
    setTab(firstTab(u));
    setUser(u);
  };
  const logout = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch { }
    CURRENT_COMPANY_ID = null; setData(emptyData()); setUser(null);
  };
  useEffect(() => { try { localStorage.setItem("ags_dark", dark ? "1" : "0"); } catch { } }, [dark]);
  const persist = (nd) => { setData(nd); saveData(nd); };
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [loadingServer, setLoadingServer] = useState(true);
  // Todo vendedor que aparece em pedido fica cadastrado automaticamente (com cor própria)
  useEffect(() => {
    if (!user || loadingServer) return;
    const fixed = ensureSellers(data);
    if (fixed !== data) { setData(fixed); saveData(fixed); }
  }, [data, user, loadingServer]); // eslint-disable-line
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    if (!user || !user.company_id) {
       setLoadingServer(false);
       return;
    }
    CURRENT_COMPANY_ID = user.company_id;
    async function fetchState() {
      try {
        const { data: remote, error } = await supabase.from('companies').select('app_data, plan_id, status, trial_ends_at').eq('id', user.company_id).single();
        if (error) throw error;
        if (remote && remote.app_data) {
          const merged = { ...emptyData(), ...JSON.parse(JSON.stringify(remote.app_data)) };
          setData(merged);
          try { localStorage.setItem(`ags_v3_${user.company_id}`, JSON.stringify(merged)); } catch { }
        }
        if (remote && user.role === "employee") {
          const me = (remote.app_data?.users || []).find(u => String(u.id) === String(user.id));
          if (!me) { try { localStorage.removeItem(SESSION_KEY); } catch { } setUser(null); return; }
          if (JSON.stringify(me.permissions) !== JSON.stringify(user.permissions) || (me.sellerName || "") !== (user.sellerName || "")) {
            const u = { ...user, permissions: me.permissions, sellerName: me.sellerName || "" };
            try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch { }
            setUser(u);
          }
        }
        if (remote && user.role === "admin" && (remote.plan_id !== user.plan || remote.status !== user.status)) {
          const u = { ...user, plan: remote.plan_id, status: remote.status, trial_ends_at: remote.trial_ends_at };
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch { }
        }
      } catch (err) {
        console.error(err);
        // Sem internet / falha no banco: usa a última cópia salva neste aparelho
        try { const c = localStorage.getItem(`ags_v3_${user.company_id}`); if (c) setData({ ...emptyData(), ...JSON.parse(c) }); } catch { }
      }
      finally { setLoadingServer(false); }
    }
    fetchState();
  }, [user?.company_id, user?.id]);

  if (!user) return <LoginScreen onLogin={login} dark={dark} />;
  if (loadingServer) return <div className='flex items-center justify-center h-screen bg-gray-950'><div className='animate-spin rounded-full h-12 w-12 border-t-2 border-orange-500'></div></div>;

  const tabs = allowedTabs(user);
  const currentTab = tabs.includes(tab) ? tab : (tabs[0] || 'orders');
  const ActiveTab = { 
    orders: OrdersTab, 
    production: ProductionTab, 
    finalization: FinalizationTab, 
    dashboard: DashboardTab, 
    routes: MapTab, 
    clients: ClientsTab, 
    team: TeamTab,
    sales: SalesTab
  }[currentTab];

  const isAdmin = user.role === 'admin';
  const isTrial = isAdmin && (user.status === 'trial' || !user.plan || user.plan === 'trial' || user.plan === 'free');
  const trialDays = user.trial_ends_at ? Math.ceil((new Date(user.trial_ends_at) - new Date()) / 86400000) : null;

  return (
    <div className={`flex h-screen overflow-hidden ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* SIDEBAR */}
      <aside className={`flex-shrink-0 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-16 md:w-20'} ${dark ? 'bg-gray-900 border-r border-gray-800' : 'bg-white border-r border-gray-200'}`}>
        <div className={`${sidebarOpen ? 'px-4 pt-5 pb-3' : 'px-2 pt-4 pb-2 flex-col'} flex items-center gap-3 overflow-hidden`}>
          <img src={logoMark} alt='Inflatudo' className='w-10 h-10 flex-shrink-0 drop-shadow-lg' />
          {sidebarOpen && <div className='min-w-0 flex-1'><h1 className='text-xl font-black tracking-tight'>Infla<span className='text-orange-500'>tudo</span></h1><p className='text-[11px] text-gray-500 font-semibold truncate'>{user.company_name || user.name}{!isAdmin ? ` · ${user.name}` : ''}</p></div>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} title={sidebarOpen ? 'Recolher menu' : 'Abrir menu'} className={`p-2 rounded-xl border flex-shrink-0 ${dark ? 'border-gray-700 hover:bg-gray-800 text-gray-300' : 'border-gray-200 hover:bg-gray-100 text-gray-600'}`}>
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        <nav className={`flex-1 ${sidebarOpen ? 'px-3' : 'px-2'} space-y-1 py-2 overflow-y-auto`}>
          {Object.entries(TAB_META).filter(([k]) => tabs.includes(k)).map(([k, { label, Icon }]) => {
            const active = currentTab === k;
            return (
              <button key={k} onClick={() => { setTab(k); if (window.innerWidth < 900) setSidebarOpen(false); }} title={label} className={`w-full flex items-center ${sidebarOpen ? '' : 'justify-center'} gap-3 px-3 py-3 rounded-xl font-bold transition-all ${active ? (dark ? 'bg-gray-800 text-orange-500 shadow-sm' : 'bg-orange-50 text-orange-600 shadow-sm') : (dark ? 'text-gray-400 hover:text-white hover:bg-gray-800/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`}>
                <Icon size={20} className={active ? 'text-orange-500' : ''} />
                {sidebarOpen && <span className='text-sm'>{label}</span>}
              </button>
            );
          })}
        </nav>

        <div className={`${sidebarOpen ? 'p-4' : 'p-2'} border-t`} style={{ borderColor: dark ? '#1f2937' : '#f1f5f9' }}>
          {sidebarOpen && isAdmin && (
            <button onClick={() => setShowPlans(true)} className='w-full flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 hover:scale-[1.02] transition-transform'>
              <CreditCard size={14} /> Planos e Assinatura
            </button>
          )}
          <div className={`flex items-center justify-between ${sidebarOpen ? '' : 'flex-col gap-2'}`}>
            <button onClick={() => setDark(!dark)} className={`p-2.5 rounded-xl border transition-all ${dark ? 'border-gray-700 bg-gray-800 text-yellow-400' : 'border-gray-200 bg-gray-100 text-blue-600'}`}>
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={logout} title='Sair' className='p-2.5 text-gray-500 hover:text-red-500 transition-colors flex items-center gap-2'><LogOut size={20} />{sidebarOpen && <span className='text-xs font-bold'>Sair</span>}</button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className='flex-1 min-w-0 flex flex-col relative overflow-hidden'>
        {isTrial && (
          <div className='bg-orange-500/10 border-b border-orange-500/20 px-6 py-2 flex items-center justify-between'>
            <div className='flex items-center gap-2 text-xs font-bold text-orange-500'>
               <Sparkles size={14} /> Período de teste ativo{trialDays !== null ? (trialDays > 0 ? ` — faltam ${trialDays} dia${trialDays === 1 ? '' : 's'}` : ' — expirado') : ''}
            </div>
            <button onClick={() => setShowPlans(true)} className='text-xs font-black uppercase text-orange-600 hover:underline'>Ver Planos</button>
          </div>
        )}

        <div className='flex-1 overflow-y-auto p-4 md:p-8'>
          {ActiveTab ? <ActiveTab data={data} setData={setData} persist={persist} dark={dark} user={user} goTo={(t) => tabs.includes(t) && setTab(t)} /> : <div className='text-center py-20 text-gray-500'>Seu usuário ainda não tem acesso a nenhuma aba. Peça ao administrador.</div>}
        </div>

        {showPlans && (
          <div className='fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md' onClick={() => setShowPlans(false)}>
            <div className={`w-full max-w-4xl p-8 rounded-3xl shadow-2xl border overflow-y-auto max-h-[90vh] ${dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`} onClick={e => e.stopPropagation()}>
              <div className='flex items-center justify-between mb-8'>
                <div>
                  <h2 className='text-3xl font-black'>Escolha seu Plano</h2>
                  <p className='text-gray-500 mt-1'>Potencialize sua produção industrial</p>
                </div>
                <button onClick={() => setShowPlans(false)} className='p-2 rounded-full hover:bg-gray-800'><X size={24} /></button>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                <div className='p-8 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex flex-col'>
                  <h3 className='text-xl font-black mb-1'>Básico</h3>
                  <div className='text-3xl font-black text-orange-500 mb-6'>R$ 379,90<span className='text-sm text-gray-500'>/mês</span></div>
                  <ul className='space-y-3 mb-8 flex-1 text-sm font-medium'>
                    <li className='flex items-center gap-2'><Check size={16} className='text-emerald-500' /> Extração de Pedidos via IA</li>
                    <li className='flex items-center gap-2'><Check size={16} className='text-emerald-500' /> Controle de Produção (Esteira)</li>
                  </ul>
                  <a href='#' className='w-full text-center bg-gray-800 text-white font-bold py-3 rounded-xl transition hover:bg-gray-700'>Assinar Básico</a>
                </div>
                <div className='p-8 rounded-2xl border border-orange-500 bg-orange-500/5 dark:bg-orange-500/10 flex flex-col relative'>
                  <div className='absolute top-0 right-6 -translate-y-1/2 bg-orange-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full'>Recomendado</div>
                  <h3 className='text-xl font-black mb-1'>Completo</h3>
                  <div className='text-3xl font-black text-orange-500 mb-6'>R$ 697,00<span className='text-sm text-gray-500'>/mês</span></div>
                  <ul className='space-y-3 mb-8 flex-1 text-sm font-medium'>
                    <li className='flex items-center gap-2'><Check size={16} className='text-orange-500' /> IA + Produção + MAPA</li>
                    <li className='flex items-center gap-2'><Check size={16} className='text-orange-500' /> Dashboards Avançados</li>
                    <li className='flex items-center gap-2'><Check size={16} className='text-orange-500' /> Gestão de Equipe</li>
                  </ul>
                  <a href='#' className='w-full text-center bg-orange-500 text-white font-bold py-3 rounded-xl transition hover:bg-orange-600 shadow-lg shadow-orange-500/30'>Assinar Completo</a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}