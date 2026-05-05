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
  DollarSign, Calendar, RefreshCw, ZoomIn
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ComposedChart, Area,
  AreaChart, PieChart, Pie
} from "recharts";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import logoImg from "./assets/logo.png";

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────
// tabs each role can see: "orders","production","finalization","dashboard","clients","team"
const ROLE_PERMISSIONS = {
  admin: ["orders", "production", "finalization", "dashboard", "clients", "team"],
  miriane: ["orders", "production", "finalization", "clients"],
  producao: ["production", "finalization"],
  finalizacao: ["finalization"],
  user: ["orders", "production", "finalization"],
};
// roles that CAN edit production/finalization stages
const CAN_EDIT_PRODUCTION = ["admin", "producao", "finalizacao", "user"];
const canEditProd = (role) => CAN_EDIT_PRODUCTION.includes(role) && role !== "miriane";

// ─── INITIAL DATA ────────────────────────────────────────────────────────────
const INITIAL_DATA = {
  users: [],
  clients: [],
  team: [],
  orders: [],
  production: [],
  finalization: [],
};

let CURRENT_COMPANY_ID = null;

function getStorageKey(companyId) {
  const id = companyId || CURRENT_COMPANY_ID || localStorage.getItem("ags_last_company");
  return id ? `ags_v3_${id}` : "ags_v3";
}

function loadData(companyId) {
  try {
    const key = getStorageKey(companyId);
    const s = localStorage.getItem(key);
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

async function saveToSupabase(d) {
  if (!CURRENT_COMPANY_ID) return;
  try { await supabase.from('companies').update({ app_data: d }).eq('id', CURRENT_COMPANY_ID); } catch (err) { console.error("Supabase save error", err); }
}

function saveData(d) { 
  const key = getStorageKey();
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
  const currentMonthStr = TODAY.toISOString().slice(0, 7); // "YYYY-MM"
  const thisMonth = orders.filter(o => o.createdAt?.startsWith(currentMonthStr));
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
              {["Luan", "Emerson", "Sidnei"].map(s => <option key={s}>{s}</option>)}</select></div>
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
                  <select value={extHeader.seller || ""} onChange={e => setExtHeader({ ...extHeader, seller: e.target.value })} className={ic}><option value="">— selecione —</option>{["Luan", "Emerson", "Sidnei"].map(s => <option key={s}>{s}</option>)}</select></div>
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
  const currentMonthStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const currentMonthEnd = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
  const nextMonthStart = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);
  const nextMonthEnd = new Date(TODAY.getFullYear(), TODAY.getMonth() + 2, 0);
  const currentMonthPrefix = TODAY.toISOString().slice(0, 7);

  const thisMon = sortedRows.filter(r => { const d = new Date(r.deadline); return d >= currentMonthStart && d <= currentMonthEnd; });
  const nextMon = sortedRows.filter(r => { const d = new Date(r.deadline); return d >= nextMonthStart && d <= nextMonthEnd; });
  const doneMon = doneRows.filter(r => r.deadline && r.deadline.startsWith(currentMonthPrefix));
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${row.done ? "bg-emerald-500 border-emerald-500 text-white" : dark ? "border-gray-700 text-gray-400" : "border-gray-300 text-gray-500"} ${(!canEdit || !editMode) ? "opacity-40 cursor-not-allowed" : ""}`}>
                    <Check size={12} />{row.done ? "Finalizado" : "Marcar finalizado"}
                  </button>
                </div>
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
        {sorted.length === 0 && <div className={`text-center py-16 ${dark ? "text-gray-500" : "text-gray-400"}`}><Sparkles size={36} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">Nenhum brinquedo aguardando finalização</p><p className={`text-xs mt-1 ${dark ? "text-gray-600" : "text-gray-400"}`}>Itens aparecem aqui após serem concluídos na produção</p></div>}
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────────────
function DashboardTab({ data, dark }) {
  const [salesPeriod, setSalesPeriod] = useState("mes");
  const [prodPeriod, setProdPeriod] = useState("mes");
  const [prodSector, setProdSector] = useState("todos");
  const [prodWorker, setProdWorker] = useState("todos");
  const [calDate, setCalDate] = useState(null);
  const [calMonth, setCalMonth] = useState(TODAY.getMonth());
  const [calYear, setCalYear] = useState(TODAY.getFullYear());

  const tt = { background: dark ? "#1f2937" : "#fff", border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`, borderRadius: 8, fontSize: 12 };

  // ── Helpers ──
  const year = calYear;
  const month = String(calMonth + 1).padStart(2, '0');
  const daysInMonth = new Date(year, calMonth + 1, 0).getDate();
  
  const getFrom = (p) => {
    const d = new Date(TODAY);
    if (p === "hoje") return d.toISOString().split("T")[0];
    if (p === "ontem") { d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; }
    if (p === "3d") { d.setDate(d.getDate() - 3); return d.toISOString().split("T")[0]; }
    if (p === "7d") { d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; }
    if (p === "mes") return `${year}-${month}-01`;
    if (p === "ano") return `${year}-01-01`;
    return "2020-01-01";
  };
  const getTo = (p) => {
    const d = new Date(TODAY);
    if (p === "hoje") return d.toISOString().split("T")[0];
    if (p === "ontem") { d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; }
    if (p === "ano") return `${year}-12-31`;
    if (p === "mes") return `${year}-${month}-${daysInMonth}`;
    return d.toISOString().split("T")[0];
  };

  const salesDays = [];
  let curr = new Date(getFrom(salesPeriod));
  const end = new Date(getTo(salesPeriod));
  if (salesPeriod === "ano") {
    for (let i = 1; i <= 12; i++) {
        salesDays.push({ dateStr: `${year}-${String(i).padStart(2, '0')}`, display: `${String(i).padStart(2, '0')}/${year}` });
    }
  } else if (salesPeriod === "hoje") {
    for (let i = 0; i <= 24; i += 3) {
      salesDays.push({ dateStr: `HOJE_${i}`, display: `${String(i).padStart(2, '0')}:00`, hour: i });
    }
  } else {
    while (curr <= end && salesDays.length < 40) {
        const dStr = curr.toISOString().split("T")[0];
        salesDays.push({ dateStr: dStr, display: `${String(curr.getDate()).padStart(2, '0')}/${String(curr.getMonth() + 1).padStart(2, '0')}` });
        curr.setDate(curr.getDate() + 1);
    }
  }

  // ── Real sales data from orders ──
  const orders = data.orders;
  const salesTotal = (period) => {
    const from = getFrom(period), to = getTo(period);
    return orders.filter(o => o.createdAt >= from && o.createdAt <= to).reduce((a, o) => a + (o.totalPrice || 0), 0);
  };

  // Sales by day (dynamically filtered)
  const salesByDay = salesDays.map(d => {
    let dayOrders = [];
    if (salesPeriod === "ano") {
        dayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(d.dateStr));
    } else if (salesPeriod === "hoje") {
        const todayStr = getFrom("hoje");
        dayOrders = orders.filter(o => {
          if (o.createdAt?.startsWith(todayStr)) {
            const h = o.createdAt.includes("T") ? new Date(o.createdAt).getHours() : 12;
            return h >= d.hour && h < d.hour + 3;
          }
          return false;
        });
    } else {
        dayOrders = orders.filter(o => o.createdAt === d.dateStr);
    }
    const obj = { date: d.display, total: dayOrders.reduce((a, o) => a + (o.totalPrice || 0), 0) };
    ["Luan", "Emerson", "Sidnei"].forEach(s => { obj[s] = dayOrders.filter(o => o.seller === s).reduce((a, o) => a + (o.totalPrice || 0), 0); });
    return obj;
  });

  // ── Production data — real from production array ──
  const allProdRows = [];
  data.orders.forEach(o => (o.items || []).filter(it => !it.isMotor).forEach(it => { const p = data.production.find(x => x.itemId === it.itemId) || {}; allProdRows.push({ ...o, ...it, ...p }); }));
  const doneItems = allProdRows.filter(r => r.done);
  const delayedItems = allProdRows.filter(r => !r.done && r.status !== "concluido" && daysLeft(r.deadline) < 0);

  // Finalized items
  const finalizedItems = data.finalization.filter(f => f.done);

  // Stage counts (real - from production array)
  const stageCounts = {
    Corte: data.production.filter(p => p.cutter).length,
    Costura: data.production.filter(p => p.tailor).length,
    Preparação: data.production.filter(p => p.prep).length,
    Montagem: data.production.filter(p => p.assembler).length,
    Finalização: finalizedItems.length,
  };
  const stageData = Object.entries(stageCounts).map(([k, v]) => ({ name: k, valor: v }));

  const RangeDropdown = ({ val, set, opts }) => (
    <select 
      value={val} 
      onChange={(e) => set(e.target.value)} 
      className={`px-3 py-1.5 rounded-xl text-sm font-bold border outline-none cursor-pointer transition-all ${dark ? "bg-gray-800 text-white border-gray-700 hover:border-orange-500" : "bg-gray-100 text-gray-900 border-gray-200 hover:border-orange-400"}`}
    >
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  const periodOpts = [["hoje", "Hoje"], ["ontem", "Ontem"], ["3d", "3 dias"], ["7d", "7 dias"], ["mes", "Mês"], ["ano", "Ano"]];

  // ── Production Performance Logic ──
  const [prodStart, setProdStart] = useState("");
  const [prodEnd, setProdEnd] = useState("");

  const prodDays = [];
  let pCurr = new Date(prodPeriod === "custom" && prodStart ? prodStart : getFrom(prodPeriod));
  const pEnd = new Date(prodPeriod === "custom" && prodEnd ? prodEnd : getTo(prodPeriod));
  
  if (prodPeriod === "ano") {
    for (let i = 1; i <= 12; i++) prodDays.push({ dateStr: `${year}-${String(i).padStart(2, '0')}`, display: `${String(i).padStart(2, '0')}/${year}` });
  } else {
    for (let i = 0; i < 60; i++) {
      if (pCurr > pEnd) break;
      prodDays.push({ dateStr: pCurr.toISOString().split("T")[0], display: `${String(pCurr.getDate()).padStart(2, '0')}/${String(pCurr.getMonth() + 1).padStart(2, '0')}` });
      pCurr.setDate(pCurr.getDate() + 1);
    }
  }

  const getSecFields = (s) => ({
    corte: { f: "cutDone", w: "cutter" },
    costura: { f: "tailorDone", w: "tailor" },
    prep: { f: "prepDone", w: "prep" },
    montagem: { f: "assembleDone", w: "assembler" }
  }[s] || {});

  const prodWorkersList = prodSector === "todos" ? [] : [...new Set(allProdRows.map(r => r[getSecFields(prodSector).w]).filter(Boolean))];

  const prodPerfByDay = prodDays.map(d => {
    const items = allProdRows.filter(r => (prodPeriod === "ano" ? (r.deadline || "").startsWith(d.dateStr) : r.deadline === d.dateStr));
    if (prodSector === "todos") {
       return { date: d.display, Corte: items.filter(r => r.cutDone).length, Costura: items.filter(r => r.tailorDone).length, Preparação: items.filter(r => r.prepDone).length, Montagem: items.filter(r => r.assembleDone).length };
    } else {
       const { f, w } = getSecFields(prodSector);
       const obj = { date: d.display };
       if (prodWorker === "todos") {
         prodWorkersList.forEach(wrk => obj[wrk] = items.filter(r => r[f] || (r[w] === wrk && (r.status === "concluido" || r.done))).length);
       } else {
         obj[prodWorker] = items.filter(r => (r[f] && r[w] === prodWorker) || (r[w] === prodWorker && (r.status === "concluido" || r.done))).length;
       }
       return obj;
    }
  });

  const sectorColors = { Corte: "#3b82f6", Costura: "#a855f7", Preparação: "#f59e0b", Montagem: "#22c55e" };
  const workerPalette = ["#3b82f6","#ef4444","#f97316","#22c55e","#a855f7","#ec4899","#14b8a6","#8b5cf6"];

  const Card = ({ children, className = "" }) => (
    <div className={`rounded-2xl border p-5 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${className}`}>{children}</div>
  );

  const totalSales = salesTotal(salesPeriod);

  return (
    <div className="space-y-5">
      <div>
        <h2 style={{ fontSize:"1.6rem",fontWeight:800,letterSpacing:"-0.03em",color:dark?"#f8fafc":"#0f172a",fontFamily:"'Inter',system-ui,sans-serif" }}>Dashboard</h2>
        <p style={{ fontSize:"0.8rem",color:"#64748b",marginTop:2,fontWeight:500 }}>Dados reais de vendas, produção e equipe</p>
      </div>

      {/* ── TOP KPIs ── */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12 }}>
        {[
          { label:"Total de Pedidos", value: orders.length, colorVar:"stat-card-orange", icon:<Package size={18} style={{ color:"#f97316" }} />, color:"#f97316", sub:`${orders.filter(o=>o.createdAt?.startsWith("2026-03")).length} este mês` },
          { label:"Receita Total",    value:`R$ ${orders.reduce((a,o)=>a+(o.totalPrice||0),0).toLocaleString("pt-BR")}`, colorVar:"stat-card-green", icon:<DollarSign size={18} style={{ color:"#22c55e" }} />, color:"#22c55e", sub:"todos os pedidos" },
          { label:"Em Produção",     value: allProdRows.filter(r=>!r.done).length, colorVar:"stat-card-blue", icon:<Factory size={18} style={{ color:"#3b82f6" }} />, color:"#3b82f6", sub:`${delayedItems.length} atrasados` },
          { label:"Finalizados",      value: finalizedItems.length, colorVar:"stat-card-purple", icon:<Sparkles size={18} style={{ color:"#a855f7" }} />, color:"#a855f7", sub:`${doneItems.length} prontos` },
        ].map(k => (
          <div key={k.label} className={`stat-card ${k.colorVar}`} style={{ padding:"16px" }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:"0.7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#64748b" }}>{k.label}</span>
              <div style={{ width:32,height:32,borderRadius:8,background:`${k.color}18`,display:"flex",alignItems:"center",justifyContent:"center" }}>{k.icon}</div>
            </div>
            <div style={{ fontSize:typeof k.value==="string"?"1.4rem":"2rem",fontWeight:900,lineHeight:1,color:k.color,fontFamily:"'Inter',system-ui,sans-serif" }}>{k.value}</div>
            <div style={{ fontSize:"0.7rem",color:"#475569",marginTop:4,fontWeight:500 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── VENDAS POR PERÍODO ── */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className={`font-black text-lg ${dark ? "text-white" : "text-gray-900"}`}>Vendas por Período</h3>
            <div className="text-3xl font-black mt-1" style={{ color: "#f97316" }}>R$ {totalSales.toLocaleString("pt-BR")}</div>
          </div>
          <RangeDropdown val={salesPeriod} set={setSalesPeriod} opts={periodOpts} />
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={salesByDay} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="colorLuan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SELLER_COLORS["Luan"]} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={SELLER_COLORS["Luan"]} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorEmerson" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SELLER_COLORS["Emerson"]} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={SELLER_COLORS["Emerson"]} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSidnei" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SELLER_COLORS["Sidnei"]} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={SELLER_COLORS["Sidnei"]} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1f2937" : "#f1f5f9"} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: dark ? "#9ca3af" : "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
            <YAxis tick={{ fill: dark ? "#9ca3af" : "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={45} />
            <Tooltip contentStyle={{ ...tt, borderWidth: 0, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} formatter={v => [`R$ ${v.toLocaleString("pt-BR")}`, ""]} />
            <Area type="monotone" dataKey="Luan" stroke={SELLER_COLORS["Luan"]} strokeWidth={3} fillOpacity={1} fill="url(#colorLuan)" />
            <Area type="monotone" dataKey="Emerson" stroke={SELLER_COLORS["Emerson"]} strokeWidth={3} fillOpacity={1} fill="url(#colorEmerson)" />
            <Area type="monotone" dataKey="Sidnei" stroke={SELLER_COLORS["Sidnei"]} strokeWidth={3} fillOpacity={1} fill="url(#colorSidnei)" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-3 mt-3 justify-center">
          {["Luan", "Emerson", "Sidnei"].map(s => (
            <div key={s} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: SELLER_COLORS[s] }} /><span className={`text-xs font-semibold ${dark ? "text-gray-300" : "text-gray-600"}`}>{s}</span></div>
          ))}
        </div>
      </Card>

      {/* ── CONCLUÍDOS + ATRASADOS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <h3 className={`font-black text-base mb-3 ${dark ? "text-white" : "text-gray-900"}`}>Brinquedos Concluídos</h3>
          <div className="text-4xl font-black text-emerald-400 mb-1">{doneItems.length}</div>
          <div className={`text-xs mb-4 ${dark ? "text-gray-400" : "text-gray-500"}`}>total concluído na produção</div>
          <div className={`text-4xl font-black mb-1`} style={{ color: "#a855f7" }}>{finalizedItems.length}</div>
          <div className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>total finalizado</div>
        </Card>
        <Card>
          <h3 className={`font-black text-base mb-3 ${dark ? "text-white" : "text-gray-900"}`}>Em Atraso Agora</h3>
          <div className="text-4xl font-black text-red-400 mb-3">{delayedItems.length}</div>
          <div className="space-y-1.5">
            {delayedItems.slice(0, 4).map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${dark ? "bg-gray-800" : "bg-gray-50"}`}>
                <div><span className={`font-mono text-xs font-bold ${dark ? "text-orange-400" : "text-orange-600"}`}>{r._orderId || r.id}</span><span className={`ml-2 text-xs ${dark ? "text-gray-300" : "text-gray-700"}`}>{r.toy}</span></div>
                <span className="text-xs font-bold text-red-400">{Math.abs(daysLeft(r.deadline))}d</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── CALENDÁRIO MENSIAL DE VENDAS ── */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className={`font-black text-base ${dark ? "text-white" : "text-gray-900"}`}>Calendário de Metas</h3>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className={`text-xs font-bold text-center p-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>{d}</div>)}
          {Array.from({ length: new Date(year, calMonth, 1).getDay() }).map((_, i) => <div key={`b-${i}`} className="p-2" />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const dayStr = String(i + 1).padStart(2, '0');
            const dateKey = `${year}-${month}-${dayStr}`; 
            const itemsInDay = allProdRows.filter(r => r.deadline === dateKey);
            const itemsCount = itemsInDay.length;
            const isToday = TODAY_STR === dateKey;
            return (
              <div key={i} onClick={() => itemsCount > 0 && setCalDate(dateKey)} className={`flex flex-col items-center justify-center p-2 rounded-lg border ${itemsCount > 0 ? "cursor-pointer hover:scale-[1.03] active:scale-95 shadow-sm transition-transform" : ""} ${dark ? "border-gray-800" : "border-gray-100"} ${isToday ? dark ? "bg-orange-500/10 border-orange-500/30" : "bg-orange-50 border-orange-200" : dark ? "bg-gray-900" : "bg-white"}`}>
                <span className={`text-[10px] font-bold ${isToday ? (dark ? "text-orange-400" : "text-orange-600") : itemsCount > 0 ? (dark ? "text-white" : "text-gray-900") : (dark ? "text-gray-500" : "text-gray-400")}`}>{i + 1}</span>
                {itemsCount > 0 ? <span className="mt-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow shadow-emerald-500/30">{itemsCount}</span> : <span className="mt-1 w-5 h-5" />}
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── DESEMPENHO DA PRODUÇÃO ── */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className={`font-black text-base ${dark ? "text-white" : "text-gray-900"}`}>Desempenho da Produção</h3>
            <p className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>Evolução de brinquedos concluídos por setor</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <select value={prodSector} onChange={(e) => { setProdSector(e.target.value); setProdWorker("todos"); }} className={`px-3 py-1.5 rounded-xl text-sm font-bold border outline-none ${dark ? "bg-gray-800 text-white border-gray-700" : "bg-gray-100 text-gray-900 border-gray-200"}`}>
              <option value="todos">Todos os Setores</option>
              <option value="corte">Corte</option>
              <option value="costura">Costura</option>
              <option value="prep">Preparação</option>
              <option value="montagem">Montagem</option>
            </select>
            {prodSector !== "todos" && (
              <select value={prodWorker} onChange={(e) => setProdWorker(e.target.value)} className={`px-3 py-1.5 rounded-xl text-sm font-bold border outline-none ${dark ? "bg-gray-800 text-white border-gray-700" : "bg-gray-100 text-gray-900 border-gray-200"}`}>
                <option value="todos">Todos Funcionários</option>
                {prodWorkersList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            )}
            <select value={prodPeriod} onChange={(e) => setProdPeriod(e.target.value)} className={`px-3 py-1.5 rounded-xl text-sm font-bold border outline-none ${dark ? "bg-gray-800 text-white border-gray-700 hover:border-orange-500" : "bg-gray-100 text-gray-900 border-gray-200 hover:border-orange-400"}`}>
              <option value="hoje">Hoje</option>
              <option value="ontem">Ontem</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="mes">Este Mês</option>
              <option value="ano">Este Ano</option>
              <option value="custom">Personalizado...</option>
            </select>
            {prodPeriod === "custom" && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={prodStart} onChange={e => setProdStart(e.target.value)} className={`px-2 py-1 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 text-white border-gray-700 hover:border-orange-500" : "bg-gray-100 text-gray-900 border-gray-200 hover:border-orange-400"}`} />
                <span className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>até</span>
                <input type="date" value={prodEnd} onChange={e => setProdEnd(e.target.value)} className={`px-2 py-1 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 text-white border-gray-700 hover:border-orange-500" : "bg-gray-100 text-gray-900 border-gray-200 hover:border-orange-400"}`} />
              </div>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={prodPerfByDay} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#1f2937" : "#f1f5f9"} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: dark ? "#9ca3af" : "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} dy={10} />
            <YAxis tick={{ fill: dark ? "#9ca3af" : "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ ...tt, borderWidth: 0, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }} />
            {prodSector === "todos" ? (
               Object.keys(sectorColors).map(k => (
                 <Area key={k} type="monotone" dataKey={k} stroke={sectorColors[k]} strokeWidth={3} fill={sectorColors[k]} fillOpacity={0.15} />
               ))
            ) : prodWorker === "todos" ? (
               prodWorkersList.map((w, i) => (
                 <Area key={w} type="monotone" dataKey={w} stroke={workerPalette[i % workerPalette.length]} strokeWidth={3} fill={workerPalette[i % workerPalette.length]} fillOpacity={0.15} />
               ))
            ) : (
               <Area type="monotone" dataKey={prodWorker} stroke="#f97316" strokeWidth={3} fill="#f97316" fillOpacity={0.15} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── CALENDAR OVERLAY ── */}
      {calDate && (() => {
        const dayOrders = allProdRows.filter(r => r.deadline === calDate);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCalDate(null)}>
            <div className={`w-full max-w-sm p-5 rounded-2xl shadow-xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-black text-lg ${dark ? "text-white" : "text-gray-900"}`}>Metas do Dia {calDate.split("-").reverse().join("/")}</h3>
                <button onClick={() => setCalDate(null)} className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-900 ${dark ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}><X size={16} /></button>
              </div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {dayOrders.map((r, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                    <div className="flex justify-between items-start mb-1">
                      <div className={`font-bold text-sm ${dark ? "text-white" : "text-gray-900"}`}>{r._orderId || r.id}</div>
                      <div className="text-xs font-bold px-2 py-0.5 rounded-lg bg-orange-500/20 text-orange-500 border border-orange-500/30">{r.seller || "Vendedor"}</div>
                    </div>
                    <div className={`text-xs font-semibold ${dark ? "text-gray-300" : "text-gray-700"}`}>{r.toy}</div>
                    <div className={`text-[11px] mt-1.5 flex items-center gap-1 ${dark ? "text-gray-500" : "text-gray-400"}`}><Users size={12}/> {r.clientName}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

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
          {["Luan", "Emerson", "Sidnei"].map(s => <option key={s}>{s}</option>)}
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
function TeamTab({ data, setData, dark, user }) {
  const [showForm, setShowForm] = useState(false);
  const ALL_TABS = ["orders", "production", "finalization", "dashboard", "routes", "clients", "team"];
  const TAB_LABELS = { "orders": "Pedidos", "production": "Produção", "finalization": "Finalização", "dashboard": "Dashboard", "routes": "Rotas", "clients": "Clientes", "team": "Equipe" };
  const [form, setForm] = useState({ name: "", role: "Corte", status: "ativo" });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", permissions: ["orders"] }); // permissions now strings like "orders", "orders:edit"
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const addMember = () => { if (!form.name) return; const nd = { ...data }; nd.team.push({ id: Date.now(), ...form }); setData(nd); saveData(nd); setForm({ name: "", role: "Corte", status: "ativo" }); setShowForm(false); };
  const toggle = (id) => { const nd = { ...data }; const m = nd.team.find(t => t.id === id); if (m) m.status = m.status === "ativo" ? "inativo" : "ativo"; setData(nd); saveData(nd); };
  const remove = (id) => { const nd = { ...data }; nd.team = nd.team.filter(t => t.id !== id); setData(nd); saveData(nd); };

  const addUser = () => {
    if (!userForm.name || !userForm.email || !userForm.password) return;
    const nd = { ...data }; nd.users.push({ id: Date.now(), name: userForm.name, email: userForm.email, password: userForm.password, role: "user", permissions: userForm.permissions });
    setData(nd); saveData(nd); setUserForm({ name: "", email: "", password: "", permissions: ["orders"] }); setShowUserForm(false);
  };
  const removeUser = (id) => { const nd = { ...data }; nd.users = nd.users.filter(u => u.id !== id); setData(nd); saveData(nd); };
  const toggleUserPerm = (userId, tab, type="read") => {
    const nd = { ...data }; const ui = nd.users.findIndex(u => u.id === userId);
    if (ui < 0) return;
    const perms = nd.users[ui].permissions || [];
    
    if (type === "read") {
      if (perms.includes(tab)) {
        // remove read and write
        nd.users[ui].permissions = perms.filter(p => p !== tab && p !== `${tab}:edit`);
      } else {
        // add read
        nd.users[ui].permissions = [...perms, tab];
      }
    } else if (type === "edit") {
      const editKey = `${tab}:edit`;
      if (perms.includes(editKey)) {
        nd.users[ui].permissions = perms.filter(p => p !== editKey);
      } else {
        nd.users[ui].permissions = [...perms, editKey];
      }
    }
    setData(nd); saveData(nd);
  };

  const grouped = { "Corte": [], "Costura": [], "Preparação": [], "Montagem": [], "Finalizador": [], "Vendedor": [], "Admin": [] };
  data.team.forEach(m => { if (grouped[m.role]) grouped[m.role].push(m); else grouped[m.role] = [m]; });
  const roleColors = { "Corte": "#f97316", "Costura": "#3b82f6", "Preparação": "#22c55e", "Montagem": "#14b8a6", "Finalizador": "#a855f7", "Vendedor": "#ec4899", "Admin": "#ef4444" };
  const ic = `w-full px-3 py-2 rounded-lg border text-sm outline-none ${dark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900"}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className={`text-2xl font-black ${dark ? "text-white" : "text-gray-900"}`}>Equipe</h2><p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Colaboradores e controle de acesso</p></div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border ${dark ? "border-gray-700 text-gray-300" : "border-gray-300 text-gray-700"}`}><Plus size={14} />Colaborador</button>
          <button onClick={() => setShowUserForm(!showUserForm)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}><Shield size={14} />Novo Login</button>
        </div>
      </div>
      
      {/* EMPLOYEE ACCESS LINK */}
      {user && user.company_id && (
         <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
            <div>
               <h4 className={`font-bold text-sm ${dark ? "text-white" : "text-gray-900"}`}>Link de Acesso da Equipe</h4>
               <p className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>Envie este link para os funcionários logarem direto na plataforma</p>
            </div>
            <div className="flex w-full md:w-auto items-center gap-2">
               <input readOnly value={`${window.location.origin}/?empresa=${user.company_id}`} className={`flex-1 md:w-64 px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${dark ? "bg-gray-900 border-gray-600 text-gray-300" : "bg-white border-gray-300 text-gray-600"}`} />
               <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?empresa=${user.company_id}`)} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition">Copiar</button>
            </div>
         </div>
      )}

      {showUserForm && (
        <div className={`rounded-xl p-4 border ${dark ? "bg-gray-900 border-orange-500/30" : "bg-orange-50 border-orange-200"}`}>
          <div className="flex items-center justify-between mb-3"><h4 className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>Novo Login de Acesso</h4><button onClick={() => setShowUserForm(false)} className={`p-1.5 rounded-lg ${dark ? "text-gray-400" : "text-gray-500"}`}><X size={14} /></button></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Nome</label><input value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} className={ic} placeholder="Nome completo" /></div>
            <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Usuário (login)</label><input value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className={ic} placeholder="usuario" /></div>
            <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Senha</label><input value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className={ic} placeholder="senha" /></div>
          </div>
          <div className="mb-3">
            <label className={`block text-xs font-semibold uppercase mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Permissões de Acesso</label>
            <div className="flex gap-2 flex-wrap">
              {ALL_TABS.map(tab => {
                if (user && user.plan === 'free' && user.status !== 'trial' && tab !== "orders" && tab !== "production" && tab !== "routes") return null;
                const has = userForm.permissions.includes(tab);
                const hasEdit = userForm.permissions.includes(`${tab}:edit`);
                return (
                  <div key={tab} className="flex flex-col gap-1 items-start mb-2">
                    <button onClick={() => {
                        const newP = has ? userForm.permissions.filter(p => p !== tab && p !== `${tab}:edit`) : [...userForm.permissions, tab];
                        setUserForm({ ...userForm, permissions: newP });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${has ? "text-white border-transparent" : dark ? "border-gray-700 text-gray-400" : "border-gray-300 text-gray-600"}`} style={has ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>
                      {TAB_LABELS[tab]}
                    </button>
                    {has && (
                      <div className="flex items-center gap-2 px-1">
                        <label className={`flex items-center gap-1 text-[10px] uppercase font-bold cursor-pointer ${dark ? "text-gray-400" : "text-gray-500"}`}>
                          <input type="checkbox" checked={!hasEdit} onChange={() => {
                            if (hasEdit) setUserForm({ ...userForm, permissions: userForm.permissions.filter(p => p !== `${tab}:edit`) });
                          }} className="accent-orange-500 w-3 h-3" /> Leitor
                        </label>
                        <label className={`flex items-center gap-1 text-[10px] uppercase font-bold cursor-pointer ${dark ? "text-gray-400" : "text-gray-500"}`}>
                          <input type="checkbox" checked={hasEdit} onChange={() => {
                            if (!hasEdit) setUserForm({ ...userForm, permissions: [...userForm.permissions, `${tab}:edit`] });
                          }} className="accent-orange-500 w-3 h-3" /> Editor
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2"><button onClick={addUser} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Criar Login</button><button onClick={() => setShowUserForm(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>Cancelar</button></div>
        </div>
      )}

      {showForm && (
        <div className={`rounded-xl p-4 border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
          <div className="flex items-center justify-between mb-3"><h4 className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>Adicionar Colaborador</h4><button onClick={() => setShowForm(false)} className={`p-1.5 rounded-lg ${dark ? "text-gray-400" : "text-gray-500"}`}><X size={14} /></button></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Nome</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={ic} placeholder="Nome" /></div>
            <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Função</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={ic}>{["Corte", "Costura", "Preparação", "Montagem", "Finalizador", "Vendedor", "Admin"].map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label className={`block text-xs font-semibold uppercase mb-1 ${dark ? "text-gray-400" : "text-gray-500"}`}>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={ic}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></div>
          </div>
          <div className="flex gap-2 mt-3"><button onClick={addMember} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>Salvar</button><button onClick={() => setShowForm(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>Cancelar</button></div>
        </div>
      )}

      {/* Users */}
      <div>
        <h3 className={`text-sm font-black uppercase tracking-wide mb-3 ${dark ? "text-gray-300" : "text-gray-700"}`}>Logins do Sistema</h3>
        <div className="space-y-2">
          {data.users.map(u => (
            <div key={u.id} className={`rounded-xl border p-3 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}>{u.name.slice(0, 2).toUpperCase()}</div>
                  <div><div className={`text-sm font-bold ${dark ? "text-white" : "text-gray-900"}`}>{u.name}</div><div className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>@{u.email} · {u.role}</div></div>
                </div>
                {u.role !== "admin" && <button onClick={() => removeUser(u.id)} className={`p-1.5 rounded-lg flex-shrink-0 ${dark ? "hover:bg-red-500/20 text-gray-500 hover:text-red-400" : "hover:bg-red-50 text-gray-400 hover:text-red-500"}`}><Trash2 size={13} /></button>}
              </div>
              {u.role !== "admin" && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: dark ? "#374151" : "#e5e7eb" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold uppercase tracking-wide ${dark ? "text-gray-400" : "text-gray-500"}`}>Acessos do Usuário</span>
                    {editingUser === u.id ? (
                      <button onClick={() => setEditingUser(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20"><Check size={14}/>Salvar Acessos</button>
                    ) : (
                      <button onClick={() => setEditingUser(u.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}><Edit3 size={14}/>Editar Acessos</button>
                    )}
                  </div>
                  <div className={`flex gap-2 flex-wrap transition-opacity duration-300 ${editingUser === u.id ? "opacity-100" : "opacity-40 pointer-events-none grayscale-[50%]"}`}>
                    {ALL_TABS.map(tab => {
                      const has = (u.permissions || []).includes(tab);
                      const hasEdit = (u.permissions || []).includes(`${tab}:edit`);
                      return (
                        <div key={tab} className={`flex flex-col gap-1 p-1.5 rounded-xl border ${dark ? "border-gray-800" : "border-gray-100"}`}>
                          <button onClick={() => toggleUserPerm(u.id, tab, "read")} className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all ${has ? "text-white border-transparent" : dark ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"}`} style={has ? { background: "linear-gradient(135deg,#f97316,#eab308)" } : {}}>{TAB_LABELS[tab]}</button>
                          {has && (
                            <div className="flex items-center justify-center gap-2 mt-1">
                              <label className={`flex items-center gap-1 text-[10px] uppercase font-bold cursor-pointer transition-colors ${dark ? "text-gray-400" : "text-gray-500"}`} title="Somente Leitura">
                                <input type="checkbox" checked={!hasEdit} onChange={() => toggleUserPerm(u.id, tab, "edit")} className="accent-orange-500 w-2.5 h-2.5" /> L
                              </label>
                              <label className={`flex items-center gap-1 text-[10px] uppercase font-bold cursor-pointer transition-colors ${dark ? "text-gray-400" : "text-gray-500"}`} title="Pode Editar">
                                <input type="checkbox" checked={hasEdit} onChange={() => toggleUserPerm(u.id, tab, "edit")} className="accent-orange-500 w-2.5 h-2.5" /> E
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {u.role === "admin" && <div className={`text-xs mt-1.5 ${dark ? "text-gray-500" : "text-gray-400"}`}>Acesso total ao sistema</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div>
        <h3 className={`text-sm font-black uppercase tracking-wide mb-3 ${dark ? "text-gray-300" : "text-gray-700"}`}>Colaboradores</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(grouped).filter(([, m]) => m.length > 0).map(([role, members]) => (
            <div key={role} className={`rounded-xl border overflow-hidden ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
              <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: dark ? "#1f2937" : "#f3f4f6", background: `${roleColors[role] || "#888"}15` }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: roleColors[role] || "#888" }} /><span className="font-bold text-sm" style={{ color: roleColors[role] || "#888" }}>{role}</span>
                <span className={`ml-auto text-xs font-semibold ${dark ? "text-gray-400" : "text-gray-500"}`}>{members.length}</span>
              </div>
              <div className="divide-y" style={{ borderColor: dark ? "#1f2937" : "#f3f4f6" }}>
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ background: roleColors[m.role] || "#888" }}>{m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                      <div><div className={`text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{m.name}</div><div className={`text-xs ${m.status === "ativo" ? "text-emerald-500" : "text-red-400"}`}>{m.status}</div></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggle(m.id)} className={`px-2 py-1 rounded-lg text-xs font-semibold ${m.status === "ativo" ? dark ? "bg-amber-500/20 text-amber-400" : "bg-amber-50 text-amber-600" : dark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>{m.status === "ativo" ? "Desativar" : "Ativar"}</button>
                      <button onClick={() => remove(m.id)} className={`p-1.5 rounded-lg ${dark ? "hover:bg-red-500/20 text-gray-500 hover:text-red-400" : "hover:bg-red-50 text-gray-400 hover:text-red-500"}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ROUTES TAB ─────────────────────────────────────────────────────────────
const GEO_URL = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

class MapErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Map rendering error:", error, info); }
  render() {
    if (this.state.hasError) return <div className="flex items-center justify-center p-12 text-center text-sm font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-xl">O mapa não pôde ser carregado no momento. Verifique sua conexão.</div>;
    return this.props.children;
  }
}

const STATE_CENTERS = {
  AC: [-70.55, -9.02], AL: [-36.59, -9.57], AM: [-64.62, -4.22], AP: [-51.95, 1.41],
  BA: [-41.70, -12.57], CE: [-39.32, -5.49], DF: [-47.92, -15.79], ES: [-40.30, -19.18],
  GO: [-49.83, -15.82], MA: [-45.11, -4.96], MG: [-44.28, -18.51], MS: [-54.60, -20.44],
  MT: [-56.92, -12.68], PA: [-52.92, -3.97], PB: [-36.72, -7.11], PE: [-37.21, -8.28],
  PI: [-42.80, -7.71], PR: [-51.99, -25.25], RJ: [-42.70, -22.90], RN: [-36.68, -5.79],
  RO: [-62.90, -10.90], RR: [-60.75, 2.73], RS: [-53.27, -30.03], SC: [-50.45, -27.24],
  SE: [-37.38, -10.59], SP: [-48.11, -22.19], TO: [-48.36, -10.17]
};

function RoutesTab({ data, dark }) {
  const [tooltipContent, setTooltipContent] = useState("");
  const [mapFilter, setMapFilter] = useState("producao");
  const [selectedState, setSelectedState] = useState(null);

  // filter logical orders
  const filteredOrders = data.orders.filter(o => {
    if (mapFilter === "todos") return true;
    const isDone = o.status === "concluido" || o.done;
    if (mapFilter === "concluidos") return isDone;
    return !isDone; // producao means active
  });

  const stateData = {};
  filteredOrders.forEach(o => {
    let clientRow = null;
    if (o.client) {
      if (typeof o.client === "string") {
         clientRow = data.clients.find(c => c.name === o.client);
      } else {
         clientRow = o.client;
      }
    }
    const normalizeState = (str) => {
      if(!str || str.length < 2) return "SP";
      const s = str.trim().toUpperCase();
      if(STATE_CENTERS[s]) return s;
      const map = {
        "SÃO PAULO":"SP", "SAO PAULO":"SP", "MINAS GERAIS":"MG", "RIO DE JANEIRO":"RJ",
        "ESPIRITO SANTO":"ES", "ESPÍRITO SANTO":"ES", "BAHIA":"BA", "PARANÁ":"PR", "PARANA":"PR",
        "SANTA CATARINA":"SC", "RIO GRANDE DO SUL":"RS", "MATO GROSSO":"MT", "MATO GROSSO DO SUL":"MS",
        "GOIÁS":"GO", "GOIAS":"GO", "DISTRITO FEDERAL":"DF", "CEARÁ":"CE", "CEARA":"CE",
        "PERNAMBUCO":"PE", "PARAÍBA":"PB", "PARAIBA":"PB", "RIO GRANDE DO NORTE":"RN",
        "ALAGOAS":"AL", "SERGIPE":"SE", "PIAUÍ":"PI", "PIAUI":"PI", "MARANHÃO":"MA", "MARANHAO":"MA",
        "TOCANTINS":"TO", "PARÁ":"PA", "PARA":"PA", "AMAPÁ":"AP", "AMAPA":"AP", "RORAIMA":"RR",
        "AMAZONAS":"AM", "ACRE":"AC", "RONDÔNIA":"RO", "RONDONIA":"RO"
      };
      return map[s] || "SP";
    };
    const safeStateId = normalizeState(clientRow?.state);
    
    if (!stateData[safeStateId]) {
      stateData[safeStateId] = { orders: 0, items: 0, value: 0, orderList: [] };
    }
    stateData[safeStateId].orders += 1;
    stateData[safeStateId].orderList.push(o);
    (o.items || []).forEach(it => {
      stateData[safeStateId].items += it.qty || 0;
      stateData[safeStateId].value += (it.qty || 0) * (it.price || 0);
    });
  });

  const maxValue = Math.max(...Object.values(stateData).map(d => d.value), 100);
  const colorScale = scaleLinear().domain([0, maxValue]).range(dark ? ["#4b5563", "#ea580c"] : ["#fed7aa", "#ea580c"]);

  const sortedStates = Object.entries(stateData).sort((a,b) => b[1].value - a[1].value);

  const selectedStateData = selectedState ? stateData[selectedState] : null;

  return (
    <div className="space-y-5 flex flex-col lg:flex-row gap-6">
      <div className={`w-full lg:w-2/3 p-4 rounded-xl shadow-sm border flex flex-col ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className={`text-xl font-black ${dark ? "text-white" : "text-gray-900"}`}>Território de Vendas</h2>
          <select value={mapFilter} onChange={e => setMapFilter(e.target.value)} className={`px-4 py-2 rounded-xl text-sm font-bold border outline-none shadow-sm cursor-pointer ${dark ? "bg-gray-800 text-white border-gray-700 focus:border-orange-500" : "bg-gray-50 text-gray-900 border-gray-300 focus:border-orange-500"}`}>
            <option value="producao">Pedidos em Produção</option>
            <option value="concluidos">Pedidos Concluídos</option>
            <option value="todos">Todos os Pedidos</option>
          </select>
        </div>
        <div className="relative w-full flex-1 min-h-[400px] rounded-xl overflow-hidden bg-sky-50 dark:bg-sky-900/10 flex items-center justify-center border border-gray-100 dark:border-gray-800/50">
          <MapErrorBoundary>
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 750, center: [-54, -15] }} width={800} height={600} style={{ width: "100%", height: "100%" }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const stateId = geo.properties.sigla || "SP";
                    const sdata = stateData[stateId];
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => sdata && setSelectedState(stateId)}
                        fill={sdata ? colorScale(sdata.value) : (dark ? "#1f2937" : "#f3f4f6")}
                        stroke={dark ? "#111827" : "#ffffff"}
                        strokeWidth={0.8}
                        onMouseEnter={() => {
                          const valStr = sdata ? `R$ ${sdata.value.toLocaleString("pt-BR")}` : "0 Pedidos";
                          setTooltipContent(`${geo.properties.name}: ${valStr} ${sdata ? `(${sdata.orders} un)` : ''}`);
                        }}
                        onMouseLeave={() => setTooltipContent("")}
                        style={{
                          hover: { fill: "#f97316", outline: "none", strokeWidth: 1.5, stroke: "#fff", cursor: sdata ? "pointer" : "default" },
                          pressed: { fill: "#ea580c", outline: "none" },
                          default: { outline: "none", cursor: sdata ? "pointer" : "default" }
                        }}
                      />
                    );
                  })
                }
              </Geographies>
              {Object.entries(stateData).map(([uf, sdata]) => {
                 const coords = STATE_CENTERS[uf];
                 if (!coords || !sdata) return null;
                 return (
                   <Marker key={uf} coordinates={coords}>
                     <circle r={10} fill="#f97316" stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
                     <text textAnchor="middle" y={3} style={{ fill: "#fff", fontSize: "10px", fontWeight: "900", pointerEvents: "none" }}>{sdata.orders}</text>
                   </Marker>
                 );
              })}
            </ComposableMap>
          </MapErrorBoundary>
            {tooltipContent && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-2xl font-bold whitespace-nowrap z-10 pointer-events-none ring-1 ring-white/10">
                {tooltipContent}
              </div>
            )}
        </div>
      </div>
      <div className={`w-full lg:w-1/3 flex flex-col gap-4`}>
        <div className={`p-4 rounded-xl shadow-sm border flex-1 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            <h3 className={`text-sm font-black uppercase tracking-wide mb-4 flex items-center gap-2 ${dark ? "text-gray-300" : "text-gray-700"}`}>
               <TrendingUp size={16} className="text-orange-500" /> Top Estados ({mapFilter === "todos" ? "Geral" : mapFilter})
            </h3>
            <div className="space-y-3">
              {sortedStates.slice(0, 10).map(([uf, stats], i) => (
                <div key={uf} onClick={() => setSelectedState(uf)} className={`flex items-center justify-between p-2 pb-3 border-b last:border-0 cursor-pointer transition-all hover:pl-3 rounded-lg ${dark ? "border-gray-800 hover:bg-gray-800/80" : "border-gray-100 hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded bg-orange-500/10 text-orange-500 flex items-center justify-center text-[10px] font-black">{i + 1}º</span>
                    <span className={`text-sm font-bold ${dark ? "text-white" : "text-gray-800"}`}>{uf}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-orange-500">R$ {stats.value.toLocaleString("pt-BR")}</div>
                    <div className={`text-[10px] uppercase font-bold mt-0.5 ${dark ? "text-gray-500" : "text-gray-400"}`}>{stats.orders} pedidos</div>
                  </div>
                </div>
              ))}
              {sortedStates.length === 0 && <p className="text-xs text-center p-6 text-gray-400 border-dashed border rounded-xl border-gray-200 dark:border-gray-800">Nenhum pedido nesta categoria.</p>}
            </div>
        </div>
      </div>
      
      {/* STATE ORDERS MODAL */}
      {selectedState && selectedStateData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setSelectedState(null)}>
          <div className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl shadow-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-5 border-b ${dark ? "border-gray-800" : "border-gray-100"}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-orange-500/30">{selectedState}</div>
                <div>
                   <h3 className={`font-black text-lg ${dark ? "text-white" : "text-gray-900"}`}>Pedidos em {selectedState}</h3>
                   <p className={`text-xs font-bold uppercase ${dark ? "text-gray-500" : "text-gray-400"}`}>{selectedStateData.orders} pedidos • R$ {selectedStateData.value.toLocaleString("pt-BR")}</p>
                </div>
              </div>
              <button onClick={() => setSelectedState(null)} className={`p-2 rounded-xl transition-all ${dark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedStateData.orderList.map(o => (
                <div key={o.id} className={`p-4 rounded-xl border flex flex-col gap-3 ${dark ? "bg-gray-800/50 border-gray-800" : "bg-gray-50 border-gray-200"}`}>
                  <div className="flex sm:items-center justify-between flex-col sm:flex-row gap-2 border-b pb-3" style={{ borderColor: dark ? "#374151" : "#e5e7eb" }}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-mono text-xs font-bold ${dark ? "text-orange-400" : "text-orange-600"}`}>#{o.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${o.status === "concluido" ? "bg-emerald-500/20 text-emerald-500" : "bg-blue-500/20 text-blue-400"}`}>{o.status === "concluido" ? "Concluído" : "Em Produção"}</span>
                      </div>
                      <div className={`font-bold text-sm ${dark ? "text-white" : "text-gray-900"}`}>{(o.client?.name || o.clientName || o.client) || "Cliente Sem Nome"}</div>
                      <div className={`text-xs mt-0.5 ${dark ? "text-gray-400" : "text-gray-500"}`}>Vendedor: {o.seller || "—"} · Prazo: {o.deadline}</div>
                    </div>
                    <div className="flex flex-col sm:items-end justify-between">
                      <div className="text-sm font-black text-orange-500">R$ {(o.totalPrice || 0).toLocaleString("pt-BR")}</div>
                      <div className={`text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>{(o.items || []).length} itens</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {(o.items || []).map((it, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border flex flex-col gap-2 ${dark ? "bg-gray-900/50 border-gray-700" : "bg-white border-gray-200"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <span className={`text-sm font-bold ${dark ? "text-gray-200" : "text-gray-800"}`}>{it.toy}</span>
                             {it.isMotor && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">Motor</span>}
                          </div>
                          {!it.isMotor && <div className="flex gap-1">{(it.colors || []).map(cc => <span key={cc} title={cc} className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ background: COLOR_MAP[cc] || "#888" }} />)}</div>}
                        </div>
                        {it.observations && (
                          <div className={`text-xs leading-relaxed ${dark ? "text-gray-400" : "text-gray-600"}`}>
                            <span className="font-bold uppercase tracking-wider opacity-70">Obs:</span> {it.observations}
                          </div>
                        )}
                        {it.images && it.images.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-1 mt-1 custom-scrollbar">
                            {it.images.map((img, i) => (
                               <img key={i} src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-600 cursor-pointer" />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const TAB_META = {
  orders: { label: "Pedidos", Icon: Package },
  production: { label: "Produção", Icon: Factory },
  finalization: { label: "Finalização", Icon: Sparkles },
  dashboard: { label: "Dashboard", Icon: BarChart3 },
  routes: { label: "Rotas", Icon: Flag },
  clients: { label: "Clientes", Icon: Users },
  team: { label: "Equipe", Icon: UserCircle },
};

function MainApp() {
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState(null);
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
        if (remote && remote.app_data && Object.keys(remote.app_data).length > 0) {
          setData(remote.app_data);
          const key = getStorageKey(user.company_id);
          try { localStorage.setItem(key, JSON.stringify(remote.app_data)); localStorage.setItem("ags_last_company", user.company_id); } catch { }
        }
      } catch (err) { console.error(err); }
      setLoadingServer(false);
    }
    fetchState();

    // Subscribe to realtime updates
    const subscription = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'companies',
          filter: `id=eq.${user.company_id}`
        },
        (payload) => {
          if (payload.new && payload.new.app_data) {
            setData(payload.new.app_data);
            const key = getStorageKey(user.company_id);
            try { localStorage.setItem(key, JSON.stringify(payload.new.app_data)); } catch { }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [user?.company_id]);

  if (loadingServer) return (
    <div className="min-h-screen flex flex-col items-center justify-center login-bg" style={{ fontFamily:"'Inter','DM Sans',system-ui,sans-serif" }}>
      <div className="animate-float" style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:24 }}>
        <div style={{ position:"relative" }}>
          <div style={{ width:56,height:56,border:"3px solid rgba(249,115,22,0.2)",borderTop:"3px solid #f97316",borderRadius:"50%",animation:"spin 0.9s linear infinite" }} />
          <div style={{ position:"absolute",inset:8,border:"2px solid rgba(234,179,8,0.25)",borderBottom:"2px solid #eab308",borderRadius:"50%",animation:"spin 1.4s linear infinite reverse" }} />
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"0.9rem",fontWeight:800,color:"#f8fafc",letterSpacing:"-0.01em" }}>AGS Brinquedos</div>
          <div style={{ fontSize:"0.75rem",color:"#475569",marginTop:4,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase" }}>Sincronizando dados...</div>
        </div>
      </div>
    </div>
  );

  if (!user) return <LoginScreen onLogin={u => { setUser(u); const perms = u.role === "admin" ? ["orders", "production", "finalization", "dashboard", "routes", "clients", "team"] : (u.permissions || []); setTab(perms[0] || "orders"); }} dark={dark} />;


  const trialLeft = user ? Math.ceil((new Date(user.trial_ends_at).getTime() - new Date().getTime()) / 86400000) : 0;
  const isExpired = user && user.plan === 'free' && trialLeft < 0;

  let allowTabs = ["orders", "production", "routes"];
  if (user && user.plan === "premium" || (user && user.plan === "free" && !isExpired)) {
     allowTabs = ["orders", "production", "finalization", "dashboard", "routes", "clients", "team"];
  }

  const userPerms = user.role === "admin" ? allowTabs : (user.permissions || []);
  const currentTab = tab && userPerms.includes(tab) ? tab : (userPerms[0] || "orders");

  const sidebarBg = dark
    ? "linear-gradient(180deg,#0e1628 0%,#0a1020 100%)"
    : "linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)";

  const mainBg = dark ? "#070d1a" : "#f1f5f9";

  return (
    <div className={`min-h-screen flex`} style={{ fontFamily:"'Inter','DM Sans',system-ui,sans-serif", background: mainBg }}>
      {/* Premium Sidebar */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{
          width: sidebarOpen ? 232 : 60,
          minHeight:"100vh", position:"sticky", top:0, height:"100vh", overflowY:"auto",
          background: sidebarBg,
          borderRight: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.07)",
          transition:"width 0.3s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: dark ? "4px 0 24px rgba(0,0,0,0.4)" : "4px 0 16px rgba(0,0,0,0.06)"
        }}
      >
        {/* Sidebar top gradient decoration */}
        <div style={{ position:"absolute",top:0,left:0,right:0,height:200,background:"linear-gradient(180deg,rgba(249,115,22,0.07) 0%,transparent 100%)",pointerEvents:"none" }} />

        {/* Logo area */}
        <div style={{ padding:"16px 14px",display:"flex",alignItems:"center",justifyContent:sidebarOpen?"space-between":"center",borderBottom:dark?"1px solid rgba(255,255,255,0.05)":"1px solid rgba(0,0,0,0.06)",flexShrink:0 }}>
          {sidebarOpen && <AppLogo />}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ padding:6,borderRadius:8,background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:dark?"#64748b":"#94a3b8",cursor:"pointer",transition:"all 0.15s",lineHeight:0 }}
          >
            {sidebarOpen ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex:1,padding:"12px 8px",display:"flex",flexDirection:"column",gap:2 }}>
          {Object.entries(TAB_META).filter(([id]) => userPerms.includes(id)).map(([id, { label, Icon }]) => {
            const active = currentTab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                title={!sidebarOpen ? label : undefined}
                className={active ? "sidebar-item sidebar-item-active" : "sidebar-item"}
                style={!sidebarOpen ? { justifyContent:"center",padding:"10px 0" } : {}}
              >
                <Icon size={17} style={{ flexShrink:0, opacity: active ? 1 : 0.7 }} />
                {sidebarOpen && <span style={{ fontSize:"0.875rem",fontWeight:active?700:600,transition:"all 0.15s" }}>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div style={{ padding:"8px",borderTop:dark?"1px solid rgba(255,255,255,0.05)":"1px solid rgba(0,0,0,0.06)",display:"flex",flexDirection:"column",gap:2,flexShrink:0 }}>
          <button
            onClick={() => setDark(!dark)}
            className="sidebar-item"
            style={!sidebarOpen ? { justifyContent:"center",padding:"10px 0" } : {}}
            title={!sidebarOpen ? (dark ? "Modo Claro" : "Modo Escuro") : undefined}
          >
            {dark ? <Sun size={17} style={{ flexShrink:0,opacity:0.7 }} /> : <Moon size={17} style={{ flexShrink:0,opacity:0.7 }} />}
            {sidebarOpen && <span style={{ fontSize:"0.875rem",fontWeight:600 }}>{dark ? "Modo Claro" : "Modo Escuro"}</span>}
          </button>
          <button
            onClick={() => { setUser(null); setData(INITIAL_DATA); CURRENT_COMPANY_ID = null; }}
            className="sidebar-item"
            style={{ color:"#ef4444", ...(!sidebarOpen ? { justifyContent:"center",padding:"10px 0" } : {}) }}
            title={!sidebarOpen ? "Sair" : undefined}
          >
            <LogOut size={17} style={{ flexShrink:0,opacity:0.8 }} />
            {sidebarOpen && <span style={{ fontSize:"0.875rem",fontWeight:600 }}>Sair</span>}
          </button>
        </div>

        {/* User profile card */}
        {sidebarOpen && (
          <div className="user-profile-card" style={{ margin:"0 8px 10px 8px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div className="avatar" style={{ width:32,height:32,borderRadius:"50%",fontSize:"0.75rem" }}>
                {user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:"0.8rem",fontWeight:700,color:dark?"#f8fafc":"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{user.name}</div>
                <div style={{ fontSize:"0.7rem",color:"#64748b",textTransform:"capitalize",fontWeight:500 }}>{user.role}</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main
        className="flex-1 min-w-0 flex flex-col relative"
        style={{ height:"100vh", overflow:"hidden", background: mainBg }}
      >
        {user.plan === 'free' && !isExpired && (
          <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Sparkles size={16} /> Você está no período gratuito. Restam {trialLeft} {trialLeft === 1 ? "dia" : "dias"}.
            </div>
            <button onClick={() => setShowPlans(true)} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold transition">Ver Planos</button>
          </div>
        )}

        {(currentTab === "production" || currentTab === "finalization") ? (
          <div className="flex-1 flex flex-col min-h-0 max-w-6xl w-full mx-auto px-6 py-4" style={{ height:"100%" }}>
            {currentTab === "production" && <ProductionTab data={data} setData={setData} dark={dark} user={user} />}
            {currentTab === "finalization" && <FinalizationTab data={data} setData={setData} dark={dark} user={user} />}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 tab-content" key={currentTab}>
              {currentTab === "orders" && <OrdersTab data={data} setData={setData} dark={dark} />}
              {currentTab === "dashboard" && <DashboardTab data={data} dark={dark} />}
              {currentTab === "clients" && <ClientsTab data={data} setData={setData} dark={dark} />}
              {currentTab === "team" && <TeamTab data={data} setData={setData} dark={dark} user={user} />}
              {currentTab === "routes" && <RoutesTab data={data} dark={dark} />}
            </div>
          </div>
        )}

        {isExpired && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className={`max-w-lg w-full rounded-2xl p-8 text-center shadow-2xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
               <Lock size={48} className="text-orange-500 mx-auto mb-4" />
               <h2 className={`text-2xl font-black mb-2 ${dark ? "text-white" : "text-gray-900"}`}>Seu trial terminou</h2>
               <p className={`text-sm mb-6 ${dark ? "text-gray-400" : "text-gray-600"}`}>Para continuar usando o sistema, gerindo sua produção e faturando ainda mais, selecione um de nossos planos.</p>
               {user.role === 'admin' ? (
                 <button onClick={() => setShowPlans(true)} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition">Assinar Agora</button>
               ) : (
                 <p className="text-red-400 font-bold text-sm">Contate o administrador da empresa para assinar o plano.</p>
               )}
            </div>
          </div>
        )}

        {showPlans && (
          <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
            <div className="max-w-4xl w-full flex flex-col items-center">
              <div className="flex justify-between w-full mb-6">
                 <div>
                   <h2 className="text-3xl font-black text-white">Escolha seu Plano</h2>
                   <p className="text-gray-400 mt-1">Evolua o AGS Brinquedos junto com o seu negócio.</p>
                 </div>
                 <button onClick={() => setShowPlans(false)} className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center"><X size={20}/></button>
              </div>

              <div className="grid md:grid-cols-2 gap-6 w-full">
                {/* Basic Plan */}
                <div className={`p-8 rounded-2xl border flex flex-col ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
                  <h3 className={`text-xl font-black mb-1 ${dark ? "text-white" : "text-gray-900"}`}>Básico</h3>
                  <div className="text-3xl font-black text-orange-500 mb-6">R$ 379,90<span className="text-sm text-gray-500">/mês</span></div>
                  <ul className={`space-y-3 mb-8 flex-1 text-sm font-medium ${dark ? "text-gray-300" : "text-gray-600"}`}>
                    <li className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Extração de Pedidos via IA</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-emerald-500" /> Controle de Produção (Esteira)</li>
                    <li className="flex items-center gap-2 text-gray-400"><X size={16} className="text-gray-500" /> Dashboard Analytics Avançado</li>
                    <li className="flex items-center gap-2 text-gray-400"><X size={16} className="text-gray-500" /> Moderação de Funcionários / Equipe</li>
                  </ul>
                  <a href={`https://www.ggcheckout.com/checkout/v5/rX4Adibo7XVf5LY31Hph?sck=${user.company_id}`} target="_blank" rel="noreferrer" className="w-full text-center bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition border border-gray-700">Assinar Básico</a>
                </div>

                {/* Premium Plan */}
                <div className="p-8 rounded-2xl border flex flex-col bg-gradient-to-b from-orange-500/20 to-orange-900/20 border-orange-500 relative">
                  <div className="absolute top-0 right-6 -translate-y-1/2 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">Recomendado</div>
                  <h3 className={`text-xl font-black mb-1 ${dark ? "text-white" : "text-gray-900"}`}>Completo</h3>
                  <div className="text-3xl font-black text-orange-500 mb-6">R$ 697,00<span className="text-sm text-gray-500">/mês</span></div>
                  <ul className={`space-y-3 mb-8 flex-1 text-sm font-medium ${dark ? "text-gray-200" : "text-gray-700"}`}>
                    <li className="flex items-center gap-2"><Check size={16} className="text-orange-500" /> Extração de Pedidos via IA</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-orange-500" /> Controle de Produção</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-orange-500" /> Dashboard e Relatórios em Tempo Real</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-orange-500" /> Cadastro e Moderação de Funcionários</li>
                    <li className="flex items-center gap-2"><Check size={16} className="text-orange-500" /> Roteirização pelo Mapa Inteligente</li>
                  </ul>
                  <a href={`https://www.ggcheckout.com/checkout/v5/rX4Adibo7XVf5LY31Hph?sck=${user.company_id}`} target="_blank" rel="noreferrer" className="w-full text-center bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 text-white font-bold py-3 rounded-xl transition">Assinar Completo</a>
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