import React, { useState, useRef, useEffect, useCallback, Component } from "react";
import { supabase } from "./lib/supabase";

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
import logoImg from "./assets/logo.png";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const GEO_URL = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

const TAB_META = {
  dashboard: { label: "Dashboard", Icon: BarChart3 },
  orders: { label: "Pedidos", Icon: Package },
  production: { label: "Produção", Icon: Factory },
  finalization: { label: "Finalização", Icon: CheckCircle },
  routes: { label: "MAPA", Icon: Flag },
  clients: { label: "Clientes", Icon: Users },
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
const CAN_EDIT_PRODUCTION = ["admin", "producao", "finalizacao", "user"];
const canEditProd = (role) => CAN_EDIT_PRODUCTION.includes(role) && role !== "miriane";

const INITIAL_DATA = {
  users: [],
  clients: [],
  team: [],
  sellers: [],
  orders: [],
  production: [],
  finalization: [],
};

function loadData() {
  try {
    const s = localStorage.getItem("ags_v3");
    if (s) {
      const p = JSON.parse(s);
      return {
        ...INITIAL_DATA,
        ...p,
        users: p.users || INITIAL_DATA.users,
        clients: p.clients || INITIAL_DATA.clients,
        team: p.team || INITIAL_DATA.team,
        orders: p.orders || INITIAL_DATA.orders,
        production: p.production || INITIAL_DATA.production,
        finalization: p.finalization || INITIAL_DATA.finalization,
      };
    }
  } catch { }
  return INITIAL_DATA;
}
let CURRENT_COMPANY_ID = null;
async function saveToSupabase(d) {
  if (!CURRENT_COMPANY_ID) return;
  try { await supabase.from('companies').update({ app_data: d }).eq('id', CURRENT_COMPANY_ID); } catch (err) { console.error("Supabase save error", err); }
}
function saveData(d) { 
  const companyId = CURRENT_COMPANY_ID || localStorage.getItem("ags_last_company");
  const key = companyId ? `ags_v3_${companyId}` : "ags_v3";
  try { localStorage.setItem(key, JSON.stringify(d)); } catch { } 
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
const TODAY_STR = TODAY.toISOString().split("T")[0]; // normalize today to midnight
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

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function AppLogo({ collapsed = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logoImg} alt="AGS Brinquedos" className={`object-contain flex-shrink-0 transition-all duration-300 ${collapsed ? "h-8 w-8" : "h-11 w-auto"}`} />
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, dark, data: propsData }) {
  const params = new URLSearchParams(window.location.search);
  const qsCompanyId = params.get('empresa');
  
  const [data] = useState(propsData || loadData());
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
        const defData = { ...data, team: data.team || [] };
        
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
      const emp = users.find(u => u.email === email && u.password === pw);
      if (!emp) throw new Error("Usuário ou senha incorretos.");
      
      onLogin({ id: emp.id, name: emp.name, role: "employee", permissions: emp.permissions || [], company_id: cData.id, company_name: cData.company_name });
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
            <div className="flex justify-center mb-5"><div className="relative"><div style={{ position:"absolute",inset:-8,borderRadius:"50%",background:"radial-gradient(circle,rgba(249,115,22,0.2) 0%,transparent 70%)",filter:"blur(12px)" }} /><AppLogo collapsed={false} /></div></div>
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
    deadline: order.deadline || "", seller: order.seller || "", status: order.status || "aguardando",
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
    const nd = { ...data }; const oi = nd.orders.findIndex(o => o.id === order.id); if (oi < 0) return; const
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
          <div className="flex gap-2">
            <select value={calMonth} onChange={e => setCalMonth(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer">
              {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={calYear} onChange={e => setCalYear(parseInt(e.target.value))} className="bg-transparent border-none text-xs font-bold outline-none cursor-pointer">
              {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
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
            <div><label className={lc}>Vendedor</label>
              <select value={form.seller} onChange={e => setForm({ ...form, seller: e.target.value })}
                className={ic}>
                <option value="">— selecione —</option>{["Luan", "Emerson", "Sidnei"].map(s => <option
                  key={s}>{s}</option>)}
              </select>
            </div>
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

// ─── ORDERS TAB ───────────────────────────────────────────────────────────────
const ORDERS_PER_PAGE = 10;
function OrdersTab({ data, setData, dark }) {
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
  const thisMonth = orders.filter(o => o.createdAt?.startsWith("2026-03"));
  const totalItems = orders.reduce((a, o) => a + (o.items?.filter(it => !it.isMotor).length || 0), 0);
  const done = orders.filter(o => o.status === "concluido").length;
  const delayed = orders.filter(o => o.status !== "concluido" && daysLeft(o.deadline) < 0).length;
  
  let baseFiltered = orders;
  if (filterType === "mes") baseFiltered = thisMonth;
  else if (filterType === "concluidos") baseFiltered = orders.filter(o => o.status === "concluido");
  else if (filterType === "atrasados") baseFiltered = orders.filter(o => o.status !== "concluido" && daysLeft(o.deadline) < 0);
  
  const filtered = baseFiltered.filter(o =>
    o.clientName.toLowerCase().includes(search.toLowerCase()) || (o.items || []).some(it => it.toy.toLowerCase().includes(search.toLowerCase())) || o.id.includes(search));
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
    const sys = `Você extrai dados de pedidos de brinquedos infláveis. Retorne APENAS JSON válido sem markdown:
            {
            "orderNumber":"número do pedido (ex: PED-042) se encontrado",
            "clientName":"nome do cliente/empresa",
            "city":"cidade do cliente, se encontrada",
            "state":"estado do cliente (preferência para sigla, ex: SP, MG), se encontrado",
            "phone":"telefone do contato do cliente, se encontrado",
            "email":"email do cliente, se encontrado",
            "voltage":"110V ou 220V",
            "deadline":"YYYY-MM-DD — ATENÇÃO: procure o prazo de FABRICAÇÃO/CONFECÇÃO. Ele aparece como 'PRAZO' seguido
            de data nas observações. NÃO é a data de emissão. Se houver dois prazos, use o ÚLTIMO.",
            "seller":"nome do representante/vendedor — IMPORTANTE: Apenas existem 3 vendedores autorizados: Luan, Emerson, Sidnei. Procure EXATAMENTE nos campos: REPRESENTANTE, Vendedor,
            Representante, Rep., Atendente, Vendido por, Agente. Copie o nome exatamente como está. Caso não encontre nenhum dos 3 explicitamente, aplique a lógica de dedução ou deixe em branco caso seja totalmente incerto.",
            "items":[{"toy":"nome","colors":["cor1"],"price":0,"observations":"obs","isMotor":false}]
            }
            Motores/sopradores/bombas: isMotor=true. ATENÇÃO: NÃO coloque observações (observations) em motores/sopradores/bombas, deixe vazio. Coloque TODAS as observações do pedido no item do brinquedo principal. Crie um item por brinquedo.`;
    try {
      const
        content = pdfData ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfData } }, { type: "text", text: "Extraia os dados deste pedido em PDF. Busque o REPRESENTANTE para o vendedor. Lembre-se, os unicos vendedores são Luan, Emerson e Sidnei. E busque o campo PRAZO nas observações para o prazo de fabricação." }] : `Extraia os dados:\n\n${text}\n\nLembre-se: os únicos vendedores são Luan, Emerson e Sidnei.`;
      const res = await fetch("/.netlify/functions/anthropic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
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
      const raw = d.content[0].text.replace(/```json|```/g, "").trim();
      const p = JSON.parse(raw);
      setExtracted(p);
      setExtHeader({ orderNumber: p.orderNumber || "", clientName: p.clientName || "", city: p.city || "", state: p.state || "", phone: p.phone || "", email: p.email || "", voltage: p.voltage || "110V", deadline: p.deadline || "", seller: p.seller || "" });
      setExtItems((p.items || []).map(it => ({ ...it, images: [], colors: Array.isArray(it.colors) ? it.colors.join(",") : (it.colors || "") })));
    } catch (err) { console.error("Extraction error:", err); setExtracted({ error: err.message || "Não foi possível extrair os dados." }); }
    setLoading(false);
  };

  const saveExt = () => {
    const nd = { ...data }; const rawNum = extHeader.orderNumber?.trim(); const
      newId = rawNum || `PED-${String(nd.orders.length + 1).padStart(3, "0")}`;
    const items = extItems.map((it, i) => ({
      itemId: `${newId}-${i + 1}`, toy: it.toy, colors: typeof
        it.colors === "string" ? it.colors.split(",").map(c => c.trim()).filter(Boolean) : it.colors, price: Number(it.price) || 0, observations: it.observations || "", images: it.images || [], isMotor: !!it.isMotor
    }));
    const total = items.reduce((a, b) => a + b.price, 0);
    nd.orders.push({ id: newId, clientName: extHeader.clientName, voltage: extHeader.voltage, deadline: extHeader.deadline, seller: extHeader.seller, totalPrice: total, status: "aguardando", createdAt: TODAY_STR, priority: false, items });
    items.filter(it => !it.isMotor).forEach(it => nd.production.push({ itemId: it.itemId, orderId: newId, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false }));
    const ci = nd.clients.findIndex(c => c.name.toLowerCase() === extHeader.clientName?.toLowerCase());
    if (ci >= 0) { 
        nd.clients[ci].totalOrders = (nd.clients[ci].totalOrders || 0) + 1; 
        nd.clients[ci].totalSpent = (nd.clients[ci].totalSpent || 0) + total; 
        // merge AI extracted info into existing client
        if (!nd.clients[ci].city && extHeader.city) nd.clients[ci].city = extHeader.city;
        if (!nd.clients[ci].state && extHeader.state) nd.clients[ci].state = extHeader.state;
        if (!nd.clients[ci].phone && extHeader.phone) nd.clients[ci].phone = extHeader.phone;
        if (!nd.clients[ci].email && extHeader.email) nd.clients[ci].email = extHeader.email;
    }
    else {
      nd.clients.push({ id: Date.now(), name: extHeader.clientName, city: extHeader.city || "", state: extHeader.state || "", phone: extHeader.phone || "", email: extHeader.email || "", totalOrders: 1, totalSpent: total });
    }
    setData(nd); saveData(nd); setText(""); setPdfData(null); setPdfName(""); setExtracted(null); setExtItems([]); setExtHeader({}); setView("list");
  };

  const addManual = () => {
    const nd = { ...data }; const newId = `PED-${String(nd.orders.length + 1).padStart(3, "0")}`;
    const
      items = manualItems.map((it, i) => ({ itemId: `${newId}-${i + 1}`, toy: it.toy, colors: it.colors.split(",").map(c => c.trim()).filter(Boolean), price: Number(it.price) || 0, observations: it.observations, images: it.images || [], isMotor: !!it.isMotor }));
    const total = items.reduce((a, b) => a + b.price, 0);
    nd.orders.push({ id: newId, ...manualHeader, totalPrice: total, status: "aguardando", createdAt: TODAY_STR, priority: false, items });
    items.filter(it => !it.isMotor).forEach(it => nd.production.push({ itemId: it.itemId, orderId: newId, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false }));
    const ci = nd.clients.findIndex(c => c.name.toLowerCase() === manualHeader.clientName?.toLowerCase());
    if (ci >= 0) { nd.clients[ci].totalOrders = (nd.clients[ci].totalOrders || 0) + 1; nd.clients[ci].totalSpent = (nd.clients[ci].totalSpent || 0) + total; }
    else
      if (manualHeader.clientName) nd.clients.push({ id: Date.now(), name: manualHeader.clientName, city: "", phone: "", email: "", totalOrders: 1, totalSpent: total });
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
          {!selectMode ? (<>
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
      {showForm && (
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
            <div><label className={lc}>Vendedor</label><select value={manualHeader.seller}
              onChange={e => setManualHeader({ ...manualHeader, seller: e.target.value })}
              className={ic}><option value="">— selecione —</option>
                {(data.sellers || []).map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}</select></div>
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
      {view === "ai" && (
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
                {[["orderNumber", "Nº Pedido"], ["clientName", "Cliente"], ["deadline", "Prazo", "date"]].map(([k, l, t]) => (
                  <div key={k}><label className={lc}>{l}</label><input type={t || "text"} value={extHeader[k] || ""} onChange={e => setExtHeader({ ...extHeader, [k]: e.target.value })} className={ic} /></div>
                ))}
                <div><label className={lc}>Vendedor (REPRESENTANTE)</label>
                  <select value={extHeader.seller || ""} onChange={e => setExtHeader({ ...extHeader, seller: e.target.value })} className={ic}><option value="">— selecione —</option>{(data.sellers || []).map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}</select></div>
                <div><label className={lc}>Voltagem</label><select value={extHeader.voltage || "110V"} onChange={e => setExtHeader({ ...extHeader, voltage: e.target.value })} className={ic}><option>110V</option><option>220V</option></select></div>
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
        <div className="relative"><Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${dark ? "text-gray-400" : "text-gray-400"}`} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar..." className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-200 text-gray-900"}`} /></div>
        <div className="space-y-4">
          {pagedOrders.map(o => {
            const s = statusBadge(o.deadline, o.status === "concluido"); const isSel = selected.has(o.id); const sc = SELLER_COLORS[o.seller] || "#9ca3af"; const ni = (o.items || []).filter(it => !it.isMotor).length; const mi = (o.items || []).filter(it => it.isMotor).length;
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
                    {!selectMode && <button onClick={e => { e.stopPropagation(); setEditingOrder(o) }} className={`p-2 rounded-xl border ${dark ? "border-gray-700 text-gray-400 hover:border-orange-500/50 hover:text-orange-400" : "border-gray-200 text-gray-400 hover:border-orange-300"}`}><Edit3 size={15} /></button>}
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

// ─── SHARED PROD CARD ─────────────────────────────────────────────────────────
function ProdCard({ row, editMode, dark, workers, onUpdateProd, onMarkDone, onTogglePriority, canEdit, lightbox, setLightbox }) {
  const [obsOpen, setObsOpen] = useState(false);

  // Progress: 12.5% per assigned worker (4 stages) and 12.5% per completed stage (4 stages)
  let points = 0;
  if (row.cutter) points++; if (row.cutDone) points++;
  if (row.tailor) points++; if (row.tailorDone) points++;
  if (row.prep) points++; if (row.prepDone) points++;
  if (row.assembler) points++; if (row.assembleDone) points++;
  const pct = Math.round((points / 8) * 100);

  const dl = daysLeft(row.deadline);
  const s = statusBadge(row.deadline, row.done);
  const progressColor = row.done ? "#22c55e" : dl < 0 ? "#ef4444" : dl <= 3 ? "#f59e0b" : "#f97316";
  const strokeColor = row.done ? "#10b981" : (pct >= 75 ? "#84cc16" : pct >= 50 ? "#eab308" : "#f97316");
  const hasObs = row.observations && row.observations.trim().length > 0;
  const hasImg = row.images && row.images.length > 0;
  const isMulti = row._isMulti;

  const StageNode = ({ label, worker, wList, field, doneField }) => (
    <div className={`flex flex-col p-3 rounded-xl border transition-all ${dark ? "bg-gray-800/40 border-gray-700/60 hover:bg-gray-800/80" : "bg-gray-50 border-gray-200 hover:bg-gray-100"} flex-1 min-w-[120px]`}>
       <div className="flex items-center justify-between mb-2">
         <span className={`text-[10px] sm:text-xs font-black uppercase tracking-widest ${row[doneField] ? "text-emerald-500" : dark ? "text-gray-400" : "text-gray-500"}`}>{label}</span>
         <button disabled={!editMode || !canEdit || !worker} onClick={() => onUpdateProd(row._itemId, doneField, !row[doneField])} 
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 ${row[doneField] ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" : (worker ? "bg-blue-500/20 text-blue-500 border border-blue-500/30" : "bg-gray-200/50 dark:bg-gray-700/50 text-gray-500 border border-transparent")} ${(!editMode || !canEdit || !worker) ? "opacity-50 cursor-not-allowed" : "hover:opacity-80 active:scale-95 cursor-pointer"}`}>{row[doneField] ? <><Check size={10} strokeWidth={3}/> OK</> : (worker ? "Em Progresso" : "Pendente")}
         </button>
       </div>
       <select value={worker || ""} disabled={!editMode || !canEdit} onChange={e => onUpdateProd(row._itemId, field, e.target.value)}
          className={`w-full px-2 py-1.5 rounded-lg text-xs font-semibold outline-none transition-all border shadow-sm
            ${worker ? (dark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-300 text-emerald-700") : (dark ? "bg-gray-950 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900")}
            ${(!editMode || !canEdit) ? "opacity-60 cursor-not-allowed" : "cursor-pointer focus:border-orange-500 focus:ring-1 focus:ring-orange-500"}>
          `}>
          <option value="">👤 Atribuir...</option>
          {wList.map(w => <option key={w.id}>{w.name}</option>)}
       </select>
    </div>
  );

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${row.priority ? "ring-2 ring-red-500/40" : ""} ${row.done ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between p-4 gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className={`font-mono text-xs font-bold ${dark ? "text-orange-400" : "text-orange-600"}`}>{row._orderId}</span>
              {isMulti && <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}>item {row._itemId?.split("-").pop()}</span>}
              {row.priority && <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30">🚨 Prioridade</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>
            </div>
            <div className={`font-black text-base ${dark ? "text-white" : "text-gray-900"}`}>{row.toy}</div>
            <div className={`text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>{row.clientName} · {row.seller || "—"} · {row.voltage}</div>
            {/* Colors - no bullet circles, only color swatches */}
            {(row.colors || []).length > 0 && (
              <div className="flex gap-1 mt-1">{(row.colors || []).map(c => <span key={c} title={c} className="w-4 h-4 rounded-full" style={{ background: COLOR_MAP[c] || "#888" }} />)}</div>
            )}
            {(hasObs || hasImg) && (
              <button onClick={() => setObsOpen(!obsOpen)} className={`mt-2 flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl ${obsOpen ? dark ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-orange-100 text-orange-700 border border-orange-300" : dark ? "bg-gray-800 text-gray-300 border border-gray-700" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
                {obsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{hasObs && hasImg ? "📋 Obs + Foto" : hasObs ? "📋 Ver Observações" : "🖼️ Ver Foto"}
              </button>
            )}
            {obsOpen && (
              <div className={`mt-3 p-4 rounded-xl border ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex gap-4">
                  {hasObs && <div className="flex-1 min-w-0"><div className={`text-xs font-bold uppercase mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Observações</div><p className={`text-sm leading-relaxed ${dark ? "text-gray-200" : "text-gray-700"}`}>{row.observations}</p></div>}
                  {hasImg && (
                    <div className="flex-shrink-0">
                      {hasObs && <div className={`text-xs font-bold uppercase mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Imagens</div>}
                      <div className="flex flex-wrap gap-2">
                        {row.images.map((imgUrl, imgIdx) => (
                          <div key={imgIdx} className="relative group cursor-pointer" onClick={() => setLightbox(imgUrl)}>
                            <img src={imgUrl} alt="" className="w-24 h-24 rounded-xl object-cover border-2 border-gray-600" />
                            <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><ZoomIn size={24} className="text-white" /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-14 h-14 transform -rotate-90 block">
              <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="none" className={dark ? "text-gray-800" : "text-gray-200"} />
              <circle cx="28" cy="28" r="24" stroke={strokeColor} strokeWidth="4" fill="none" strokeDasharray="150.8" strokeDashoffset={150.8 - (150.8 * pct) / 100} className="transition-all duration-500 ease-out drop-shadow-sm" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
               <span className={`text-[11px] font-black ${pct === 100 ? "text-emerald-500" : dark ? "text-white" : "text-gray-700"}`}>{pct}%</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {canEdit && (
              <button onClick={() => onTogglePriority(row._itemId, row._orderId)} title={row.priority ? "Remover prioridade" : "Marcar como prioridade"}
                className={`p-1.5 rounded-lg border transition-all ${row.priority ? "bg-red-500/20 border-red-500/40 text-red-400" : "border-gray-700 text-gray-500 hover:border-red-400 hover:text-red-400"}`}>
                <Flag size={14} />
              </button>
            )}
            <button onClick={() => canEdit && editMode && onMarkDone(row._itemId, row._orderId)} disabled={!canEdit || !editMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${row.done || pct === 100 ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" : dark ? "border-gray-700 text-gray-400 hover:border-emerald-500/50" : "border-gray-300 text-gray-500"} ${(!canEdit || !editMode) ? "opacity-40 cursor-not-allowed" : ""}`}>
              <Check size={12} />{row.done || pct === 100 ? "Concluído" : "Marcar feito"}
            </button>
          </div>
        </div>
      </div>
      <div className={`p-4 border-t ${dark ? "border-gray-800 bg-gray-900/60" : "border-gray-100 bg-gray-50/60"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StageNode label="Corte" worker={row.cutter} wList={workers.corte} field="cutter" doneField="cutDone" />
          <StageNode label="Costura" worker={row.tailor} wList={workers.costura} field="tailor" doneField="tailorDone" />
          <StageNode label="Preparação" worker={row.prep} wList={workers.prep} field="prep" doneField="prepDone" />
          <StageNode label="Montagem" worker={row.assembler} wList={workers.montagem} field="assembler" doneField="assembleDone" />
        </div>
        
        {/* Horizontal Progress Bar replacing the gradient */}
        <div className="w-full h-1.5 rounded-full overflow-hidden flex" style={{ background: dark ? "#1f2937" : "#e5e7eb" }}>
          <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: strokeColor }}></div>
        </div>
      </div>
    </div>
  );
}

// ─── PRODUCTION TAB ───────────────────────────────────────────────────────────
function ProductionTab({ data, setData, dark, user }) {
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [lightbox, setLightbox] = useState(null);
  const [savedState, setSavedState] = useState(null); // snapshot before edit
  const [form, setForm] = useState({ toy: "", clientName: "", deadline: "", seller: "", colors: "", voltage: "110V", observations: "" });

  const canEdit = canEditProd(user?.role);

  const allRows = [];
  data.orders.forEach(order => {
    const orderItems = (order.items || []).filter(it => !it.isMotor);
    orderItems.forEach(item => {
      const prod = data.production.find(p => p.itemId === item.itemId) || {};
      allRows.push({ ...order, ...item, ...prod, _orderId: order.id, _itemId: item.itemId, _isMulti: orderItems.length > 1, priority: order.priority || false });
    });
  });

  const sortedRows = sortProdRows(allRows);
  const activeRows = sortedRows.filter(r => !r.done && r.status !== "concluido" && (r.clientName?.toLowerCase().includes(search.toLowerCase()) || r.toy?.toLowerCase().includes(search.toLowerCase()) || r._orderId?.includes(search)));
  const doneRows = sortedRows.filter(r => r.done || r.status === "concluido");
  const thisMon = sortedRows.filter(r => { const d = new Date(r.deadline); return d >= new Date("2026-03-01") && d <= new Date("2026-03-31"); });
  const nextMon = sortedRows.filter(r => { const d = new Date(r.deadline); return d >= new Date("2026-04-01") && d <= new Date("2026-04-30"); });
  const doneMon = doneRows.filter(r => r.deadline >= "2026-03-01" && r.deadline <= "2026-03-31");
  const delayedRows = activeRows.filter(r => daysLeft(r.deadline) < 0);

  const workers = {
    corte: data.team.filter(t => t.role === "Corte" && t.status === "ativo"),
    costura: data.team.filter(t => t.role === "Costura" && t.status === "ativo"),
    prep: data.team.filter(t => t.role === "Preparação" && t.status === "ativo"),
    montagem: data.team.filter(t => (t.role === "Preparação" || t.role === "Montagem") && t.status === "ativo"),
  };

  const filteredRows = filterStatus === "todos" ? sortedRows
    : filterStatus === "atrasados" ? activeRows.filter(r => daysLeft(r.deadline) < 0)
      : filterStatus === "concluidos" ? doneRows
        : filterStatus === "urgente" ? activeRows.filter(r => { const d = daysLeft(r.deadline); return r.priority || (d >= 0 && d <= 3); })
          : activeRows.filter(r => !r.priority && daysLeft(r.deadline) > 3);

  const startEdit = () => { setSavedState(JSON.parse(JSON.stringify(data))); setEditMode(true); };
  const cancelEdit = () => { if (savedState) { setData(savedState); saveData(savedState); } setEditMode(false); setSavedState(null); };
  const saveEdit = () => { saveData(data); setEditMode(false); setSavedState(null); };

  const updateProd = (itemId, field, value) => {
    const nd = { ...data };
    const idx = nd.production.findIndex(p => p.itemId === itemId);
    if (idx >= 0) nd.production[idx] = { ...nd.production[idx], [field]: value };
    setData(nd);
  };

  const markDone = (itemId, orderId) => {
    const nd = { ...data };
    const prodItem = nd.production.find(p => p.itemId === itemId);
    if (!prodItem) return;
    if (!prodItem.done && (!prodItem.cutter || !prodItem.tailor || !prodItem.prep || !prodItem.assembler)) {
      alert("Atribua colaboradores em todas as 4 etapas antes de finalizar o pedido."); return;
    }
    const idx = nd.production.findIndex(p => p.itemId === itemId);
    if (idx >= 0) {
      nd.production[idx].done = !nd.production[idx].done;
      // also toggle interior checkmarks automatically for logic compatibility
      nd.production[idx].cutDone = nd.production[idx].done;
      nd.production[idx].tailorDone = nd.production[idx].done;
      nd.production[idx].prepDone = nd.production[idx].done;
      nd.production[idx].assembleDone = nd.production[idx].done;
    }
    
    // if marking done: add to finalization queue
    if (nd.production[idx].done) {
      if (!nd.finalization.find(f => f.itemId === itemId)) {
        nd.finalization.push({ itemId, orderId, finalizer: "", done: false, finDate: null });
      }
    } else {
      nd.finalization = nd.finalization.filter(f => f.itemId !== itemId || f.done); // keep if already finalized
    }
    const allDone = nd.production.filter(p => p.orderId === orderId).every(p => p.done);
    const oi = nd.orders.findIndex(o => o.id === orderId);
    if (oi >= 0) nd.orders[oi].status = allDone ? "concluido" : "producao";
    setData(nd); saveData(nd);
  };

  const assigned = (p) => [p.cutter, p.tailor, p.prep, p.assembler].filter(Boolean).length;

  const togglePriority = (itemId, orderId) => {
    const nd = { ...data }; const oi = nd.orders.findIndex(o => o.id === orderId);
    if (oi >= 0) {
      const wasPriority = nd.orders[oi].priority;
      nd.orders[oi].priority = !wasPriority;
      // When activating priority, jump to "urgente" filter
      
    }
    setData(nd); saveData(nd);
  };

  const addOrder = () => {
    const nd = { ...data }; const newId = `PED-${String(nd.orders.length + 1).padStart(3, "0")}`; const itemId = `${newId}-1`;
    nd.orders.push({ id: newId, clientName: form.clientName, voltage: form.voltage, deadline: form.deadline, seller: form.seller, totalPrice: 0, status: "producao", createdAt: TODAY_STR, priority: false, items: [{ itemId, toy: form.toy, colors: form.colors.split(",").map(c => c.trim()).filter(Boolean), price: 0, observations: form.observations, image: null, isMotor: false }] });
    nd.production.push({ itemId, orderId: newId, cutter: "", tailor: "", prep: "", assembler: "", cutDone: false, tailorDone: false, prepDone: false, assembleDone: false, done: false });
    setData(nd); saveData(nd); setShowAdd(false);
  };

  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`;

  // Filter labels for "Todos" dropdown
  const filterOpts = [["todos", "Todos"], ["urgente", "Urgente"], ["atrasados", "Atrasados"], ["ok", "No prazo"], ["concluidos", "Concluídos"]];

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {/* ── FROZEN HEADER — compact ── */}
      <div className={`flex-shrink-0 pb-3 pt-1 border-b ${dark ? "bg-gray-950 border-gray-800" : "bg-slate-100 border-gray-200"}`}>
        {/* Row 1: title + buttons */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className={`text-xl font-black leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Produção</h2>
            <p className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>Brinquedos — motores excluídos</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {canEdit && <button onClick={() => setShowAdd(!showAdd)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}><Plus size={13} />Adicionar</button>}
            {canEdit && !editMode && <button onClick={startEdit} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border ${dark ? "border-gray-700 text-gray-300" : "border-gray-300 text-gray-700"}`}><Edit3 size={13} />Editar</button>}
            {editMode && <><button onClick={saveEdit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}><Save size={13} />Salvar</button><button onClick={cancelEdit} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border ${dark ? "border-gray-700 text-gray-300" : "border-gray-300 text-gray-700"}`}><X size={13} />Cancelar</button></>}
          </div>
        </div>
        {/* Row 2: stats compact */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[{ label: "Atrasados", value: delayedRows.length, color: "#ef4444" }, { label: "Mês", value: thisMon.length, color: "#f97316" }, { label: "Prox. Mês", value: nextMon.length, color: "#3b82f6" }, { label: "Montados", value: doneMon.length, color: "#22c55e" }].map(s => (
            <div key={s.label} className={`rounded-lg px-2 py-1.5 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} flex items-center gap-1.5`}>
              <span className="text-lg font-black leading-none" style={{ color: s.color }}>{s.value}</span>
              <span className={`text-xs font-medium leading-tight ${dark ? "text-gray-400" : "text-gray-500"}`}>{s.label}</span>
            </div>
          ))}
        </div>
        {/* Row 3: filters */}
        <div className="relative mb-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou brinquedo..." className={`w-full pl-9 pr-4 py-2 rounded-xl border text-xs outline-none ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`} /></div><div className="flex gap-1.5 flex-wrap">
          {filterOpts.map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${filterStatus === v ? "text-white" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"}`} style={filterStatus === v ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>
              {l}{" "}<span className="opacity-70">{v === "todos" ? `(${sortedRows.length})` : v === "atrasados" ? `(${delayedRows.length})` : v === "concluidos" ? `(${doneRows.length})` : v === "urgente" ? `(${activeRows.filter(r => { const d = daysLeft(r.deadline); return r.priority || (d >= 0 && d <= 3); }).length})` : ""}</span>
            </button>
          ))}
        </div>
        {editMode && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>✏️ Modo edição ativo — clique em Salvar para confirmar.</div>}
        {!editMode && canEdit && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-gray-800/60 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-500"}`}>🔒 Modo leitura — clique em Editar.</div>}
        {!canEdit && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"}`}>👁️ Somente visualização.</div>}
      </div>

      {/* ── SCROLLABLE CARDS AREA ── */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3" style={{ minHeight: 0 }}>
        {showAdd && (
          <div className={`rounded-xl p-4 border ${dark ? "bg-gray-900 border-orange-500/30" : "bg-orange-50 border-orange-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>Adicionar à Produção</h4>
              <button onClick={() => setShowAdd(false)} className={`p-1.5 rounded-lg ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[["toy", "Brinquedo"], ["clientName", "Cliente"], ["deadline", "Prazo", "date"], ["seller", "Vendedor"], ["colors", "Cores"], ["observations", "Observações"]].map(([k, l, t]) => (
                <div key={k}><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>{l}</label><input type={t || "text"} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className={ic} /></div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addOrder} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Adicionar</button>
              <button onClick={() => setShowAdd(false)} className={`flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}><X size={14} />Cancelar</button>
            </div>
          </div>
        )}

        {filteredRows.map((row, i) => (
          <ProdCard key={`${row._itemId}-${i}`} row={row} editMode={editMode} dark={dark} workers={workers} onUpdateProd={updateProd} onMarkDone={markDone} onTogglePriority={togglePriority} canEdit={canEdit} lightbox={lightbox} setLightbox={setLightbox} />
        ))}
        {filteredRows.length === 0 && <div className={`text-center py-16 ${dark ? "text-gray-500" : "text-gray-400"}`}><Factory size={36} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">Nenhum item nesta categoria</p></div>}
      </div>
    </div>
  );
}

// ─── FINALIZATION TAB ─────────────────────────────────────────────────────────
function FinalizationTab({ data, setData, dark, user }) {
  const [editMode, setEditMode] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [savedState, setSavedState] = useState(null);
  const canEdit = user?.role === "admin" || user?.role === "finalizacao" || user?.role === "producao";

  // Only items that are done in production
  const finRows = [];
  data.finalization.forEach(fin => {
    const order = data.orders.find(o => o.id === fin.orderId);
    const item = order?.items?.find(it => it.itemId === fin.itemId);
    const prod = data.production.find(p => p.itemId === fin.itemId);
    if (order && item && prod?.done) {
      finRows.push({ ...order, ...item, ...fin, _orderId: order.id, _itemId: fin.itemId, priority: order.priority || false });
    }
  });
  const sorted = sortProdRows(finRows);
  const activeF = sorted.filter(r => !r.done);
  const doneF = sorted.filter(r => r.done);
  const delayed = activeF.filter(r => r.deadline && daysLeft(r.deadline) < 0);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [obsOpenIds, setObsOpenIds] = useState(new Set());
  const toggleObs = (id) => { const next = new Set(obsOpenIds); if (next.has(id)) next.delete(id); else next.add(id); setObsOpenIds(next); };

  const finWorkers = data.team.filter(t => t.role === "Finalizador" && t.status === "ativo");

  const filteredRows = filterStatus === "todos" ? sorted
    : filterStatus === "atrasados" ? activeF.filter(r => r.deadline && daysLeft(r.deadline) < 0)
      : filterStatus === "concluidos" ? doneF
        : filterStatus === "urgente" ? activeF.filter(r => { if (!r.deadline) return r.priority; const d = daysLeft(r.deadline); return r.priority || (d >= 0 && d <= 3); })
          : activeF.filter(r => !r.priority && (!r.deadline || daysLeft(r.deadline) > 3));

  const startEdit = () => { setSavedState(JSON.parse(JSON.stringify(data))); setEditMode(true); };
  const cancelEdit = () => { if (savedState) { setData(savedState); saveData(savedState); } setEditMode(false); setSavedState(null); };
  const saveEdit = () => { saveData(data); setEditMode(false); setSavedState(null); };

  const updateFin = (itemId, field, value) => {
    const nd = { ...data }; const idx = nd.finalization.findIndex(f => f.itemId === itemId);
    if (idx >= 0) nd.finalization[idx] = { ...nd.finalization[idx], [field]: value };
    setData(nd);
  };

  const markFinDone = (itemId) => {
    const nd = { ...data }; const idx = nd.finalization.findIndex(f => f.itemId === itemId);
    if (idx < 0) return;
    const fin = nd.finalization[idx];
    if (!fin.done && !fin.finalizer) { alert("Selecione um finalizador antes de marcar como concluído."); return; }
    nd.finalization[idx] = { ...fin, done: !fin.done, finDate: !fin.done ? TODAY_STR : null };
    setData(nd); saveData(nd);
  };

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {/* ── FROZEN HEADER compact ── */}
      <div className={`flex-shrink-0 pb-3 pt-1 border-b ${dark ? "bg-gray-950 border-gray-800" : "bg-slate-100 border-gray-200"}`}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className={`text-xl font-black leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Finalização</h2>
            <p className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>Apenas itens concluídos na produção</p>
          </div>
          <div className="flex gap-2">
            {canEdit && !editMode && <button onClick={startEdit} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border ${dark ? "border-gray-700 text-gray-300" : "border-gray-300 text-gray-700"}`}><Edit3 size={13} />Editar</button>}
            {editMode && <><button onClick={saveEdit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}><Save size={13} />Salvar</button><button onClick={cancelEdit} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border ${dark ? "border-gray-700 text-gray-300" : "border-gray-300 text-gray-700"}`}><X size={13} />Cancelar</button></>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[{ label: "A Finalizar", value: activeF.length, color: "#f97316" }, { label: "Atrasados", value: delayed.length, color: "#ef4444" }, { label: "Finalizados", value: doneF.length, color: "#22c55e" }].map(s => (
            <div key={s.label} className={`rounded-lg px-2 py-1.5 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} flex items-center gap-1.5`}>
              <span className="text-lg font-black leading-none" style={{ color: s.color }}>{s.value}</span>
              <span className={`text-xs font-medium ${dark ? "text-gray-400" : "text-gray-500"}`}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[["todos", "Todos"], ["urgente", "Urgente"], ["atrasados", "Atrasados"], ["ok", "No prazo"], ["concluidos", "Concluídos"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${filterStatus === v ? "text-white" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"}`} style={filterStatus === v ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>
              {l}{" "}<span className="opacity-70">{v === "todos" ? `(${sorted.length})` : v === "atrasados" ? `(${delayed.length})` : v === "concluidos" ? `(${doneF.length})` : v === "urgente" ? `(${activeF.filter(r => { if (!r.deadline) return r.priority; const d = daysLeft(r.deadline); return r.priority || (d >= 0 && d <= 3); }).length})` : ""}</span>
            </button>
          ))}
        </div>
        {editMode && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>✏️ Modo edição ativo.</div>}
        {!editMode && canEdit && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-gray-800/60 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-500"}`}>🔒 Modo leitura — clique em Editar.</div>}
        {!canEdit && <div className={`mt-2 text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"}`}>👁️ Somente visualização.</div>}
      </div>

      {/* ── SCROLLABLE CARDS ── */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3" style={{ minHeight: 0 }}>
        {filteredRows.map((row, i) => {
          const s = statusBadge(row.deadline || "", row.done);
          const pct = row.finalizer ? 100 : 0;
          const progressColor = row.done ? "#22c55e" : (!row.deadline || daysLeft(row.deadline) >= 0) ? "#f97316" : "#ef4444";
          const hasObs = row.observations && row.observations.trim().length > 0;
          const hasImg = row.images && row.images.length > 0;
          const obsOpen = obsOpenIds.has(row._itemId);
          return (
            <div key={`${row._itemId}-${i}`} className={`rounded-xl border overflow-hidden ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${row.done ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between p-4 gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="relative flex-shrink-0 w-12 h-12">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15" fill="none" stroke={dark ? "#1f2937" : "#e5e7eb"} strokeWidth="2.5" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke={progressColor} strokeWidth="2.5" strokeDasharray={`${pct * 0.942} 94.2`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-black" style={{ color: progressColor }}>{pct}%</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`font-mono text-xs font-bold ${dark ? "text-orange-400" : "text-orange-600"}`}>{row._orderId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>
                      {row.done && row.finDate && <span className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>✓ {fmt(row.finDate)}</span>}
                    </div>
                    <div className={`font-black text-base ${dark ? "text-white" : "text-gray-900"}`}>{row.toy}</div>
                    <div className={`text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>{row.clientName} · {row.seller || "—"} · {row.voltage}</div>
                    {(row.colors || []).length > 0 && <div className="flex gap-1 mt-1">{(row.colors || []).map(c => <span key={c} className="w-4 h-4 rounded-full" style={{ background: COLOR_MAP[c] || "#888" }} title={c} />)}</div>}
                    {(hasObs || hasImg) && (
                      <button onClick={() => toggleObs(row._itemId)} className={`mt-2 flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl ${obsOpen ? dark ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-orange-100 text-orange-700" : dark ? "bg-gray-800 text-gray-300 border border-gray-700" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
                        {obsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{hasObs && hasImg ? "📋 Obs + Fotos" : hasObs ? "📋 Observações" : "🖼️ Fotos"}
                      </button>
                    )}
                    {obsOpen && (
                      <div className={`mt-3 p-4 rounded-xl border flex flex-col gap-3 ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                        {hasObs && <div><p className={`text-sm ${dark ? "text-gray-200" : "text-gray-700"}`}>{row.observations}</p></div>}
                        {hasImg && (
                          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            {row.images.map((imgUrl, imgIdx) => (
                              <div key={imgIdx} className="flex-shrink-0 cursor-pointer relative group" onClick={() => setLightbox(imgUrl)}>
                                <img src={imgUrl} alt="" className="w-28 h-28 rounded-xl object-cover border-2 border-gray-600" />
                                <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"><ZoomIn size={24} className="text-white" /></div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <button onClick={() => canEdit && editMode && markFinDone(row._itemId)} disabled={!canEdit || !editMode}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${row.done ? "bg-emerald-500 text-white" : (dark ? "bg-gray-800 text-gray-400 hover:text-emerald-400 border border-gray-700" : "bg-gray-100 text-gray-500 hover:text-emerald-600 border border-gray-200")} ${(!canEdit || !editMode) ? "opacity-40 cursor-not-allowed" : ""}`}>
                    {row.done ? <><Check size={16} /> Finalizado</> : "Finalizar Item"}
                  </button>
                </div>
              <div className={`h-1.5 ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: row.done ? "#22c55e" : "linear-gradient(90deg,#f97316,#eab308)" }} />
              </div>
              <div className={`p-4 border-t ${dark ? "border-gray-800 bg-gray-900/60" : "border-gray-100 bg-gray-50/60"}`}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${row.finalizer ? "bg-emerald-500" : "bg-gray-600"}`} />
                    <span className={`text-xs font-bold ${row.finalizer ? "text-emerald-400" : dark ? "text-gray-400" : "text-gray-500"}`}>Finalizador</span>
                  </div>
                  <select value={row.finalizer || ""} disabled={!editMode || !canEdit} onChange={e => updateFin(row._itemId, "finalizer", e.target.value)}
                    className={`px-2 py-1.5 rounded-lg text-xs border outline-none w-full max-w-xs ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"} ${(!editMode || !canEdit) ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <option value="">— selecione —</option>
                    {finWorkers.map(w => <option key={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className={`text-center py-16 ${dark ? "text-gray-500" : "text-gray-400"}`}><Sparkles size={36} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">Nenhum brinquedo aguardando finalização</p></div>}
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────────────
function DashboardTab({ data, dark }) {
  const [salesPeriod, setSalesPeriod] = useState("mes");
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calDate, setCalDate] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  
  const orders = data.orders || [];
  const sellers = data.sellers || [];
  const production = data.production || [];
  const clients = data.clients || [];

  // ─── CALCULATIONS ─────────────────────────────────────────────────────────
  const now = new Date();
  const currentMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  
  const monthOrders = orders.filter(o => o.createdAt?.startsWith(currentMonthStr));
  const monthRevenue = monthOrders.reduce((a, o) => a + (o.totalPrice || 0), 0);
  const totalRevenue = orders.reduce((a, o) => a + (o.totalPrice || 0), 0);
  
  const activeOrders = orders.filter(o => o.status !== "concluido");
  const lateOrders = activeOrders.filter(o => daysLeft(o.deadline) < 0);
  
  const sectorData = [
    { name: "Corte", done: production.filter(p => p.cutDone).length, pending: production.filter(p => !p.cutDone).length, color: "#3b82f6" },
    { name: "Costura", done: production.filter(p => p.tailorDone).length, pending: production.filter(p => !p.tailorDone).length, color: "#a855f7" },
    { name: "Preparo", done: production.filter(p => p.prepDone).length, pending: production.filter(p => !p.prepDone).length, color: "#f59e0b" },
    { name: "Montagem", done: production.filter(p => p.assembleDone).length, pending: production.filter(p => !p.assembleDone).length, color: "#22c55e" },
  ];

  const salesBySeller = (sellers.length > 0 ? sellers : [{name: "Sem Vendedor", color: "#94a3b8"}]).map(s => {
    const sOrders = orders.filter(o => o.seller === s.name);
    return {
      name: s.name,
      value: sOrders.reduce((a, o) => a + (o.totalPrice || 0), 0),
      count: sOrders.length,
      color: s.color || "#3b82f6"
    };
  }).sort((a, b) => b.value - a.value);

  // Calendar logic
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const getOrdersForDay = (day) => {
    if (!day) return [];
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return orders.filter(o => o.deadline === dateStr);
  };

  const generateAIInsights = async () => {
    setAiLoading(true);
    try {
      const statsSummary = {
        totalRevenue,
        monthRevenue,
        activeOrders: activeOrders.length,
        lateOrders: lateOrders.length,
        topSeller: salesBySeller[0]?.name || "N/A",
        productionStatus: sectorData.map(s => `${s.name}: ${s.done} prontos, ${s.pending} pendentes`).join(", ")
      };

      const res = await fetch("/.netlify/functions/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: "Você é um consultor de gestão industrial sênior. Analise os dados e forneça 3 insights estratégicos curtos e acionáveis para o diretor da empresa. Retorne APENAS os 3 pontos em formato de lista, sem introdução.",
          messages: [{ role: "user", content: `Analise estes dados da AGS Brinquedos:\n${JSON.stringify(statsSummary)}` }]
        })
      });
      const d = await res.json();
      const text = d.content[0].text;
      setAiInsights(text);
    } catch (err) {
      setAiInsights("Não foi possível gerar insights no momento. Verifique sua chave de API.");
    }
    setAiLoading(false);
  };

  const tt = {
    backgroundColor: dark ? "#0f172a" : "#fff",
    border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`,
    borderRadius: "12px",
    padding: "10px",
    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)"
  };

  return (
    <div className="space-y-6 animate-slide-up pb-10">
      {/* ─── HEADER & AI INSIGHTS ─── */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <h2 className="page-title page-title-underline">Dashboard Estratégico</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium italic">Inteligência Industrial & Performance de Vendas</p>
          
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="stat-card stat-card-orange p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Faturamento Mensal</span>
                <DollarSign size={16} className="text-orange-500" />
              </div>
              <div className="text-2xl font-black tabular-nums text-orange-500">R$ {monthRevenue.toLocaleString("pt-BR")}</div>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <TrendingUp size={12} className="text-emerald-500" /> +12.5% em relação ao mês anterior
              </div>
            </div>
            <div className="stat-card stat-card-blue p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pedidos em Aberto</span>
                <Package size={16} className="text-blue-500" />
              </div>
              <div className="text-2xl font-black tabular-nums">{activeOrders.length}</div>
              <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <AlertTriangle size={12} className={lateOrders.length > 0 ? "text-red-500" : "text-emerald-500"} /> 
                {lateOrders.length} pedidos com prazo ultrapassado
              </div>
            </div>
          </div>
        </div>

        {/* AI INSIGHTS BOX */}
        <div className={`lg:w-1/3 rounded-3xl p-6 border flex flex-col justify-between relative overflow-hidden ${dark ? "bg-indigo-950/20 border-indigo-500/30" : "bg-indigo-50 border-indigo-200"}`}>
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><Sparkles size={80} className="text-indigo-500" /></div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30"><Zap size={18} /></div>
              <h3 className="font-black text-sm uppercase tracking-wider text-indigo-500">AGS Inteligência AI</h3>
            </div>
            {aiInsights ? (
              <div className={`text-sm leading-relaxed space-y-2 font-medium ${dark ? "text-indigo-200" : "text-indigo-900"}`}>
                {aiInsights.split('\n').map((line, i) => <p key={i}>{line}</p>)}
              </div>
            ) : (
              <p className={`text-sm font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>Clique para analisar o desempenho atual da sua produção e vendas com IA.</p>
            )}
          </div>
          <button onClick={generateAIInsights} disabled={aiLoading} className="mt-6 w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2">
            {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <><Sparkles size={14} /> Gerar Insights</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PRODUCTION CHART */}
        <div className="lg:col-span-2 card-surface p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-black text-lg">Fluxo de Produção</h3>
              <p className="text-xs text-slate-500 font-bold uppercase">Status por setor industrial</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sectorData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <Tooltip cursor={{ fill: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)" }} contentStyle={tt} />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '20px' }} />
              <Bar name="Concluído" dataKey="done" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={40} />
              <Bar name="Pendente" dataKey="pending" fill={dark ? "#1e293b" : "#e2e8f0"} radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* TOP SELLERS */}
        <div className="card-surface p-6">
          <h3 className="font-black text-lg mb-6">Top Vendedores</h3>
          <div className="space-y-5">
            {salesBySeller.slice(0, 5).map((s, i) => (
              <div key={s.name} className="flex flex-col gap-2">
                <div className="flex justify-between items-end">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ background: s.color }}>{i + 1}</div>
                    <span className="font-bold text-sm">{s.name}</span>
                  </div>
                  <span className="font-black text-sm tabular-nums">R$ {s.value.toLocaleString("pt-BR")}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full transition-all duration-1000" style={{ width: `${(s.value / (salesBySeller[0]?.value || 1)) * 100}%`, backgroundColor: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SALES CALENDAR */}
        <div className="card-surface p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-lg">Agenda de Entregas</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setCalMonth(m => m === 0 ? 11 : m - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={16}/></button>
              <span className="text-xs font-black uppercase tracking-widest w-28 text-center">{monthNames[calMonth]} {calYear}</span>
              <button onClick={() => setCalMonth(m => m === 11 ? 0 : m + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={16}/></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const dayOrders = getOrdersForDay(day);
              const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
              return (
                <div key={i} onClick={() => day && dayOrders.length > 0 && setCalDate(`${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)} 
                  className={`aspect-square rounded-xl border flex flex-col items-center justify-center relative transition-all ${!day ? "border-transparent" : dark ? "border-gray-800 hover:border-orange-500/50 cursor-pointer" : "border-gray-100 hover:border-orange-500/50 cursor-pointer"} ${isToday ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20 border-transparent" : ""}`}>
                  {day && <span className="text-xs font-bold">{day}</span>}
                  {dayOrders.length > 0 && !isToday && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-orange-500" />}
                  {dayOrders.length > 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 text-white text-[8px] font-black flex items-center justify-center border-2 border-white dark:border-gray-900">{dayOrders.length}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* REGIONAL PERFORMANCE SUMMARY */}
        <div className="card-surface p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-lg">Performance Regional</h3>
            <button className="text-[10px] font-black uppercase text-orange-500 hover:underline">Ver no Mapa</button>
          </div>
          <div className="space-y-4">
             {/* Mini ranking of states */}
             {Object.entries(
                orders.reduce((acc, o) => {
                  const client = clients.find(c => c.name === o.clientName);
                  const uf = (client?.state || "N/A").trim().toUpperCase().slice(0, 2);
                  if (!acc[uf]) acc[uf] = 0;
                  acc[uf] += (o.totalPrice || 0);
                  return acc;
                }, {})
             ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([uf, val], i) => (
                <div key={uf} className="flex items-center justify-between p-3 rounded-2xl bg-slate-500/5 border border-transparent hover:border-slate-500/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 font-black text-sm">{uf}</div>
                    <div className="text-sm font-bold">{uf === "N/A" ? "Não Definido" : `Estado de ${uf}`}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black tabular-nums">R$ {val.toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Líder Regional</div>
                  </div>
                </div>
             ))}
          </div>
        </div>
      </div>

      {/* Day Details Modal */}
      {calDate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setCalDate(null)}>
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-xl">Entregas do dia {calDate.split('-').reverse().join('/')}</h3>
              <button onClick={() => setCalDate(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {getOrdersForDay(parseInt(calDate.split('-')[2])).map(o => (
                <div key={o.id} className={`p-4 rounded-2xl border ${dark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-xs font-black text-orange-400">{o.id}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.status === "concluido" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"}`}>{o.status}</span>
                  </div>
                  <div className="font-black text-base truncate">{o.clientName}</div>
                  <div className="text-xs text-slate-500 font-bold mt-1">
                    {(o.items || []).length} Brinquedos · R$ {o.totalPrice.toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientsTab({ data, setData, dark }) {
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
      nd.clients[ci] = editingClient;
      setData(nd);
      saveData(nd);
    }
    setEditingClient(null);
  };

  const getSellerForClient = (n) => { const o = data.orders.filter(x => x.clientName === n); return o.length ? o[o.length - 1].seller : null; };
  const clientOrders = (n) => data.orders.filter(o => o.clientName === n);

  const filtered = data.clients.filter(c => {
    const q = search.toLowerCase();
    const matchName = c.name.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
    const lastSeller = getSellerForClient(c.name);
    const matchSeller = !sellerFilter || (lastSeller === sellerFilter);
    const matchSearch = !q || matchName;
    return matchSearch && matchSeller;
  });

  return (
    <div className="space-y-5">
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div><h2 className={`text-2xl font-black ${dark ? "text-white" : "text-gray-900"}`}>Clientes</h2><p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Histórico e informações — somente visualização</p></div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${dark ? "text-gray-400" : "text-gray-400"}`} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou cidade..." className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-200 text-gray-900"}`} /></div>
        <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} className={`px-3 py-2.5 rounded-xl border text-sm outline-none ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`}>
          <option value="">Todos os vendedores</option>
          {(data.sellers || []).map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {filtered.map(c => {
          const orders = clientOrders(c.name); const total = orders.reduce((a, b) => a + (b.totalPrice || 0), 0); const lastSeller = getSellerForClient(c.name); const sc = SELLER_COLORS[lastSeller] || "#9ca3af"; const isOpen = openClient === c.id;
          return (
            <div key={c.id} className={`rounded-xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${isOpen ? "border-orange-500/40" : ""}`}>
              <div className="flex items-center justify-between p-4 gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-base flex-shrink-0" style={{ background: `linear-gradient(135deg,${sc}88,${sc})` }}>{c.name.slice(0, 2).toUpperCase()}</div>
                  <div className="flex flex-col gap-0.5">
                    <div className={`font-bold text-lg ${dark ? "text-white" : "text-gray-900"}`}>{c.name}</div>
                    <div className={`text-xs font-medium ${dark ? "text-gray-300" : "text-gray-600"}`}>
                      {c.city || "S/ Cidade"} {c.state ? `- ${c.state}` : ""}
                      {c.phone && <span className="ml-2 border-l border-gray-300 pl-2 dark:border-gray-700">📞 {c.phone}</span>}
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
                    <button onClick={(e) => { e.stopPropagation(); setEditingClient(c); }} className={`p-2 rounded-xl border transition-all ${dark ? "border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-500/50" : "border-gray-200 text-gray-500 hover:text-orange-500 hover:bg-orange-50"} `}>
                      <Edit3 size={18} />
                    </button>
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

function EditOrderModal({ order, data, setData, dark, onClose }) {
  const [form, setForm] = useState({ ...order });
  const [items, setItems] = useState([...(order.items || [])]);

  const handleSave = () => {
    const nd = { ...data };
    const idx = nd.orders.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      nd.orders[idx] = { ...form, items };
      setData(nd);
      saveData(nd);
    }
    onClose();
  };

  const updItem = (idx, field, val) => {
    const ni = [...items];
    ni[idx] = { ...ni[idx], [field]: val };
    setItems(ni);
  };

  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"}`;
  const lc = `block text-xs font-semibold uppercase tracking-wide mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`} onClick={e => e.stopPropagation()}>
        <div className={`sticky top-0 px-6 py-4 flex items-center justify-between border-b z-10 ${dark ? "bg-gray-900/90 border-gray-800" : "bg-white/90 border-gray-100"} backdrop-blur-md`}>
          <h3 className={`font-black text-xl ${dark ? "text-white" : "text-gray-900"}`}>Editar Pedido {order.id}</h3>
          <button onClick={onClose} className={`p-2 rounded-xl ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}><X size={20}/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><label className={lc}>Cliente</label><input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} className={ic} /></div>
            <div><label className={lc}>Vendedor</label>
              <select value={form.seller} onChange={e => setForm({ ...form, seller: e.target.value })} className={ic}>
                <option value="">— selecione —</option>
                {(data.sellers || []).map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div><label className={lc}>Prazo</label><input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className={ic} /></div>
            <div><label className={lc}>Voltagem</label><select value={form.voltage} onChange={e => setForm({ ...form, voltage: e.target.value })} className={ic}><option>110V</option><option>220V</option></select></div>
            <div><label className="flex items-center gap-2 cursor-pointer mt-6"><input type="checkbox" checked={form.priority} onChange={e => setForm({ ...form, priority: e.target.checked })} /><span className={lc}>Prioridade 🚨</span></label></div>
          </div>
          <div className="space-y-4">
            <h4 className={`font-black text-sm uppercase tracking-widest ${dark ? "text-gray-400" : "text-gray-500"}`}>Itens do Pedido</h4>
            {items.map((it, idx) => (
              <div key={idx} className={`p-4 rounded-2xl border ${dark ? "bg-gray-800/40 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2"><label className={lc}>Brinquedo</label><input value={it.toy} onChange={e => updItem(idx, "toy", e.target.value)} className={ic} /></div>
                  <div><label className={lc}>Preço R$</label><input type="number" value={it.price} onChange={e => updItem(idx, "price", Number(e.target.value))} className={ic} /></div>
                  {!it.isMotor && <div><label className={lc}>Cores</label><input value={(it.colors || []).join(", ")} onChange={e => updItem(idx, "colors", e.target.value.split(",").map(c => c.trim()).filter(Boolean))} className={ic} /></div>}
                  <div className="col-span-4"><label className={lc}>Observações</label><input value={it.observations} onChange={e => updItem(idx, "observations", e.target.value)} className={ic} /></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-4 border-t" style={{ borderColor: dark ? "#374151" : "#e5e7eb" }}>
            <button onClick={handleSave} className="flex-1 py-3 rounded-2xl text-sm font-black text-white shadow-lg shadow-orange-500/20" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Salvar Alterações</button>
            <button onClick={onClose} className={`flex-1 py-3 rounded-2xl text-sm font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamTab({ data, setData, dark, user }) {
  const [activeSubTab, setActiveSubTab] = useState('members'); 
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'Corte', status: 'ativo' });
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', permissions: ['orders'] });
  const [showUserForm, setShowUserForm] = useState(false);
  const [sellerForm, setSellerForm] = useState({ name: '', color: '#3b82f6' });
  const [showSellerForm, setShowSellerForm] = useState(false);

  const ALL_TABS = ['orders', 'production', 'finalization', 'dashboard', 'routes', 'clients', 'team'];
  const TAB_LABELS = { 'orders': 'Pedidos', 'production': 'Produção', 'finalization': 'Finalização', 'dashboard': 'Dashboard', 'routes': 'MAPA', 'clients': 'Clientes', 'team': 'Equipe' };

  const addMember = () => { if (!form.name) return; const nd = { ...data }; nd.team.push({ id: Date.now(), ...form }); setData(nd); saveData(nd); setForm({ name: '', role: 'Corte', status: 'ativo' }); setShowForm(false); };
  const addSeller = () => { if (!sellerForm.name) return; const nd = { ...data }; nd.sellers = nd.sellers || []; nd.sellers.push({ id: Date.now(), ...sellerForm }); setData(nd); saveData(nd); setSellerForm({ name: '', color: '#3b82f6' }); setShowSellerForm(false); };
  const removeSeller = (id) => { const nd = { ...data }; nd.sellers = nd.sellers.filter(s => s.id !== id); setData(nd); saveData(nd); };

  const addUser = () => {
    if (!userForm.name || !userForm.email || !userForm.password) return;
    const nd = { ...data }; nd.users.push({ id: Date.now(), name: userForm.name, email: userForm.email, password: userForm.password, role: 'user', permissions: userForm.permissions });
    setData(nd); saveData(nd); setUserForm({ name: '', email: '', password: '', permissions: ['orders'] }); setShowUserForm(false);
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

      <div className='flex gap-2 p-1 bg-black/5 rounded-xl w-fit'>
        {[{id:'members', label:'Colaboradores', icon:<Users size={14}/>}, {id:'logins', label:'Logins', icon:<Shield size={14}/>}, {id:'sellers', label:'Vendedores', icon:<UserPlus size={14}/>}].map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === t.id ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}>
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
                <button onClick={addMember} className='btn-brand w-full'>Salvar</button>
              </div>
            </div>
          )}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {data.team.map(m => (
              <div key={m.id} className='card-surface p-4 flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <div className='w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-600 font-black'>{m.name[0]}</div>
                  <div><p className='font-bold text-sm'>{m.name}</p><p className='text-xs text-slate-500'>{m.role}</p></div>
                </div>
                <button onClick={() => { const nd={...data}; nd.team=nd.team.filter(x=>x.id!==m.id); setData(nd); saveData(nd); }} className='p-2 text-slate-400 hover:text-red-500 transition-colors'><Trash2 size={16}/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'logins' && (
        <div className='space-y-4'>
          <div className='flex justify-end'><button onClick={() => setShowUserForm(true)} className='btn-brand text-xs'><Shield size={14}/> Novo Login</button></div>
          {showUserForm && (
            <div className='card-surface p-4 border-orange-500/30 animate-slide-up'>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-4'>
                <input placeholder='Nome' value={userForm.name} onChange={e => setUserForm({...userForm, name:e.target.value})} className={ic} />
                <input placeholder='Usuário' value={userForm.email} onChange={e => setUserForm({...userForm, email:e.target.value})} className={ic} />
                <input placeholder='Senha' type='password' value={userForm.password} onChange={e => setUserForm({...userForm, password:e.target.value})} className={ic} />
              </div>
              <button onClick={addUser} className='btn-brand'>Criar Acesso</button>
            </div>
          )}
          <div className='space-y-2'>
            {data.users.map(u => (
              <div key={u.id} className='card-surface p-4 flex items-center justify-between'>
                <div><p className='font-bold text-sm'>{u.name}</p><p className='text-xs text-slate-500'>@{u.email} · {u.role}</p></div>
                <div className='flex gap-2'>
                  <button onClick={() => { const nd={...data}; nd.users=nd.users.filter(x=>x.id!==u.id); setData(nd); saveData(nd); }} className='p-2 text-slate-400 hover:text-red-500'><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'sellers' && (
        <div className='space-y-4'>
          <div className='flex justify-end'><button onClick={() => setShowSellerForm(true)} className='btn-brand text-xs'><Plus size={14}/> Novo Vendedor</button></div>
          {showSellerForm && (
            <div className='card-surface p-4 border-orange-500/30 animate-slide-up'>
              <div className='flex gap-4'>
                <input placeholder='Nome do Vendedor' value={sellerForm.name} onChange={e => setSellerForm({...sellerForm, name:e.target.value})} className={ic} />
                <input type='color' value={sellerForm.color} onChange={e => setSellerForm({...sellerForm, color:e.target.value})} className='w-12 h-10 p-0 border-none bg-transparent cursor-pointer' />
                <button onClick={addSeller} className='btn-brand'>Adicionar</button>
              </div>
            </div>
          )}
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {(data.sellers || []).map(s => (
              <div key={s.id} className='card-surface p-4 flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <div className='w-4 h-4 rounded-full' style={{ background: s.color }} />
                  <span className='font-bold text-sm'>{s.name}</span>
                </div>
                <button onClick={() => removeSeller(s.id)} className='p-2 text-slate-400 hover:text-red-500'><Trash2 size={16}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
const STATE_COORDS = {
  'AC': [-70.5, -9.0], 'AL': [-36.5, -9.6], 'AM': [-64.0, -3.4], 'AP': [-51.0, 1.4],
  'BA': [-41.7, -12.5], 'CE': [-39.5, -5.2], 'DF': [-47.9, -15.8], 'ES': [-40.3, -19.1],
  'GO': [-49.3, -15.9], 'MA': [-45.2, -5.4], 'MG': [-44.5, -18.5], 'MS': [-54.6, -20.4],
  'MT': [-55.9, -12.6], 'PA': [-52.3, -3.9], 'PB': [-36.7, -7.1], 'PE': [-37.9, -8.3],
  'PI': [-42.7, -7.6], 'PR': [-51.6, -24.8], 'RJ': [-43.2, -22.9], 'RN': [-36.5, -5.8],
  'RO': [-63.0, -10.8], 'RR': [-61.3, 1.9], 'RS': [-53.8, -30.0], 'SC': [-50.9, -27.2],
  'SE': [-37.1, -10.6], 'SP': [-48.6, -23.5], 'TO': [-48.3, -10.2]
};

const UF_MAP = {
  'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO', 'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', 'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO',
  'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO'
};

function normalizeState(s) {
  if (!s) return '';
  const clean = s.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (clean.length === 2) return clean;
  return UF_MAP[clean] || clean.slice(0, 2);
}

function RoutesTab({ data, dark }) {
  const [mapFilter, setMapFilter] = useState('producao');
  const [selectedState, setSelectedState] = useState(null);

  const filteredOrders = data.orders.filter(o => {
    if (mapFilter === 'concluidos') return o.status === 'concluido';
    if (mapFilter === 'producao') return o.status !== 'concluido';
    return true;
  });

  const stateData = {};
  filteredOrders.forEach(o => {
    const clientRow = data.clients.find(c => c.name === o.clientName);
    const uf = normalizeState(clientRow?.state);
    if (!uf) return;
    if (!stateData[uf]) stateData[uf] = { orders: 0, value: 0, orderList: [] };
    stateData[uf].orders += 1;
    stateData[uf].orderList.push({ ...o, clientCity: clientRow?.city });
    stateData[uf].value += o.totalPrice || 0;
  });

  const maxValue = Math.max(...Object.values(stateData).map(d => d.value), 100);
  const colorScale = scaleLinear().domain([0, maxValue]).range(dark ? ['#1e293b', '#f97316'] : ['#fff7ed', '#f97316']);

  // Jitter for markers to avoid overlap in the same state
  const getJitter = (id) => {
    const seed = id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return [(seed % 20 - 10) / 10, (seed % 14 - 7) / 10];
  };

  const selectedStateInfo = selectedState ? stateData[selectedState] : null;

  return (
    <div className='space-y-6 animate-slide-up'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='page-title page-title-underline'>MAPA Estratégico</h2>
          <p className='text-sm text-slate-500 mt-1 font-medium'>Distribuição geográfica e volume de vendas</p>
        </div>
        <select value={mapFilter} onChange={e => { setMapFilter(e.target.value); setSelectedState(null); }} 
          className={`px-4 py-2 rounded-xl text-sm font-bold border outline-none ${dark ? 'bg-gray-800 text-white border-gray-700' : 'bg-white border-gray-200 text-gray-900'}`}>
          <option value='producao'>Em Produção</option>
          <option value='concluidos'>Concluídos</option>
          <option value='todos'>Todos</option>
        </select>
      </div>

      <div className='flex flex-col lg:flex-row gap-6'>
        {/* MAP CONTAINER */}
        <div className='lg:w-2/3 card-surface p-4 relative min-h-[550px] overflow-hidden flex flex-col'>
          <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
            <div className={`p-3 rounded-xl border backdrop-blur-md ${dark ? 'bg-gray-900/80 border-gray-700' : 'bg-white/80 border-gray-200'}`}>
              <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Legenda de Volume</div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-gradient-to-r from-slate-200 to-orange-500" />
                <span className="text-[10px] font-bold text-slate-400">R$ {maxValue.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <ComposableMap projection='geoMercator' projectionConfig={{ scale: 850, center: [-54, -15] }} style={{ width: "100%", height: "100%" }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => geographies.map(geo => {
                  const uf = geo.properties.sigla;
                  const sdata = stateData[uf];
                  const isSelected = selectedState === uf;
                  return (
                    <Geography key={geo.rsmKey} geography={geo} 
                      fill={isSelected ? '#f97316' : (sdata ? colorScale(sdata.value) : (dark ? '#111827' : '#f8fafc'))}
                      stroke={isSelected ? '#fff' : (dark ? '#1e293b' : '#e2e8f0')}
                      strokeWidth={isSelected ? 1.5 : 0.5}
                      onClick={() => setSelectedState(uf)}
                      style={{ 
                        default: { outline: 'none' },
                        hover: { fill: '#fb923c', cursor: 'pointer', outline: 'none' },
                        pressed: { outline: 'none' }
                      }}
                    />
                  );
                })}
              </Geographies>

              {/* RENDER MARKERS FOR EACH ORDER */}
              {Object.entries(stateData).map(([uf, data]) => {
                const coords = STATE_COORDS[uf];
                if (!coords) return null;
                return data.orderList.map((order, idx) => {
                  const [jx, jy] = getJitter(order.id);
                  return (
                    <Marker key={order.id} coordinates={[coords[0] + jx, coords[1] + jy]}>
                      <circle r={mapFilter === 'producao' ? 3 : 2} 
                        fill={order.status === 'concluido' ? '#22c55e' : '#f97316'} 
                        stroke="#fff" strokeWidth={0.5} 
                        className="animate-pulse-soft"
                      />
                    </Marker>
                  );
                });
              })}
            </ComposableMap>
          </div>
        </div>

        {/* SIDE PANEL */}
        <div className='lg:w-1/3 flex flex-col gap-4'>
          {selectedState ? (
            <div className='card-surface p-5 border-orange-500/30 animate-slide-up flex flex-col h-full'>
              <div className='flex items-center justify-between mb-4'>
                <div>
                  <h3 className='font-black text-2xl text-orange-500'>{selectedState}</h3>
                  <p className='text-xs text-slate-500 font-bold uppercase'>{selectedStateInfo?.orders || 0} Pedidos no estado</p>
                </div>
                <button onClick={() => setSelectedState(null)} className='p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800'><X size={20}/></button>
              </div>

              <div className='bg-orange-500/10 rounded-2xl p-4 mb-6 border border-orange-500/20'>
                <div className='text-[10px] font-black uppercase text-orange-500/60 mb-1'>Volume Total</div>
                <div className='text-2xl font-black tabular-nums'>R$ {(selectedStateInfo?.value || 0).toLocaleString('pt-BR')}</div>
              </div>

              <div className='flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3'>
                {selectedStateInfo?.orderList.map(o => (
                  <div key={o.id} className={`p-3 rounded-xl border ${dark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                    <div className='flex justify-between items-start mb-1'>
                      <span className='font-mono text-[10px] font-black text-orange-400'>{o.id}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.status === 'concluido' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{o.status}</span>
                    </div>
                    <div className='text-sm font-black truncate'>{o.clientName}</div>
                    <div className='text-[10px] text-slate-500 font-bold'>{o.clientCity} · R$ {o.totalPrice.toLocaleString('pt-BR')}</div>
                  </div>
                ))}
                {(!selectedStateInfo || selectedStateInfo.orderList.length === 0) && (
                  <div className='text-center py-10 opacity-30'><Package size={40} className='mx-auto mb-2'/><p className='text-sm font-bold'>Nenhum pedido</p></div>
                )}
              </div>
            </div>
          ) : (
            <div className='card-surface p-5 flex flex-col h-full'>
              <h3 className='font-black text-sm uppercase tracking-widest text-slate-500 mb-6'>Ranking por Região</h3>
              <div className='space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar'>
                {Object.entries(stateData).sort((a,b) => b[1].value - a[1].value).map(([uf, s], i) => (
                  <div key={uf} onClick={() => setSelectedState(uf)} className='group cursor-pointer p-3 rounded-2xl border border-transparent hover:border-orange-500/30 hover:bg-orange-500/5 transition-all'>
                    <div className='flex justify-between items-center'>
                      <div className='flex items-center gap-3'>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-orange-500 text-white' : dark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{i+1}</div>
                        <div>
                          <div className='font-black text-sm'>{uf}</div>
                          <div className='text-[10px] font-bold text-slate-500'>{s.orders} pedidos</div>
                        </div>
                      </div>
                      <div className='text-right'>
                        <div className='font-black text-sm text-orange-500'>R$ {s.value.toLocaleString('pt-BR')}</div>
                        <div className='text-[10px] font-bold text-slate-400'>{(s.value/maxValue*100).toFixed(0)}% do topo</div>
                      </div>
                    </div>
                    <div className='mt-2 w-full h-1 bg-slate-100 dark:bg-gray-800 rounded-full overflow-hidden'>
                      <div className='h-full bg-orange-500 rounded-full transition-all duration-1000' style={{ width: `${(s.value/maxValue*100)}%` }} />
                    </div>
                  </div>
                ))}
                {Object.keys(stateData).length === 0 && (
                  <div className='text-center py-20 opacity-20'><Layers size={48} className='mx-auto mb-4'/><p className='font-black'>Aguardando dados...</p></div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState('orders');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingServer, setLoadingServer] = useState(true);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    if (!user || !user.company_id) {
       setLoadingServer(false);
       return;
    }
    CURRENT_COMPANY_ID = user.company_id;
    async function fetchState() {
      try {
        const { data: remote, error } = await supabase.from('companies').select('app_data').eq('id', user.company_id).single();
        if (remote && remote.app_data) {
          const merged = { ...INITIAL_DATA, ...remote.app_data };
          setData(merged);
        }
      } catch (err) { console.error(err); }
      finally { setLoadingServer(false); }
    }
    fetchState();
  }, [user]);

  if (!user) return <Login onLogin={setUser} />;
  if (loadingServer) return <div className='flex items-center justify-center h-screen bg-gray-950'><div className='animate-spin rounded-full h-12 w-12 border-t-2 border-orange-500'></div></div>;

  const ActiveTab = { 
    orders: OrdersTab, 
    production: ProductionTab, 
    finalization: FinalizationTab, 
    dashboard: DashboardTab, 
    routes: RoutesTab, 
    clients: ClientsTab, 
    team: TeamTab 
  }[tab || 'orders'];

  const isTrial = !user.plan || user.plan === 'trial';

  return (
    <div className={`flex h-screen overflow-hidden ${dark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* SIDEBAR */}
      <aside className={`flex-shrink-0 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'} ${dark ? 'bg-gray-900 border-r border-gray-800' : 'bg-white border-r border-gray-200'}`}>
        <div className='p-6 flex items-center gap-3 overflow-hidden'>
          <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex-shrink-0 shadow-lg shadow-orange-500/20 flex items-center justify-center text-white'><Package size={24} /></div>
          {sidebarOpen && <h1 className='text-xl font-black tracking-tight'>AGS<span className='text-orange-500'>.ind</span></h1>}
        </div>

        <nav className='flex-1 px-3 space-y-1 py-4'>
          {Object.entries(TAB_META).map(([k, { label, Icon }]) => {
            const active = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all ${active ? (dark ? 'bg-gray-800 text-orange-500 shadow-sm' : 'bg-orange-50 text-orange-600 shadow-sm') : (dark ? 'text-gray-400 hover:text-white hover:bg-gray-800/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`}>
                <Icon size={20} className={active ? 'text-orange-500' : ''} />
                {sidebarOpen && <span className='text-sm'>{label}</span>}
              </button>
            );
          })}
        </nav>

        <div className='p-4 border-t' style={{ borderColor: dark ? '#1f2937' : '#f1f5f9' }}>
          {sidebarOpen && (
            <button onClick={() => setShowPlans(true)} className='w-full flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 hover:scale-[1.02] transition-transform'>
              <CreditCard size={14} /> Planos e Assinatura
            </button>
          )}
          <div className='flex items-center justify-between'>
            <button onClick={() => setDark(!dark)} className={`p-2.5 rounded-xl border transition-all ${dark ? 'border-gray-700 bg-gray-800 text-yellow-400' : 'border-gray-200 bg-gray-100 text-blue-600'}`}>
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {sidebarOpen && <button onClick={() => setUser(null)} className='p-2.5 text-gray-500 hover:text-red-500 transition-colors'><LogOut size={20} /></button>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-2.5 rounded-xl border ${dark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-100'}`}>
              {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className='flex-1 flex flex-col relative overflow-hidden'>
        {isTrial && (
          <div className='bg-orange-500/10 border-b border-orange-500/20 px-6 py-2 flex items-center justify-between'>
            <div className='flex items-center gap-2 text-xs font-bold text-orange-500'>
               <Sparkles size={14} /> Período de teste ativo (Expirará em breve)
            </div>
            <button onClick={() => setShowPlans(true)} className='text-xs font-black uppercase text-orange-600 hover:underline'>Ver Planos</button>
          </div>
        )}

        <div className='flex-1 overflow-y-auto p-4 md:p-8'>
          <ActiveTab data={data} setData={setData} dark={dark} user={user} />
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