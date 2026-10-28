import React, { useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { OWNER_WHATSAPP, PLANS } from "../lib/plans";

// ── Assistente de dúvidas → WhatsApp ──────────────────────────────────────────
// A pessoa vai escolhendo (assunto → detalhe → pergunta pronta) e chega no
// WhatsApp com a dúvida já filtrada na mensagem.
const PLAN_Q = (p) => [
  `O que está incluído no plano ${p}?`,
  `Quantos usuários posso ter no ${p}? Vendedor conta?`,
  `Quantos pedidos e fotos cabem no ${p}?`,
  `Qual a diferença do ${p} para os outros planos?`,
  `Posso começar no ${p} e trocar depois?`,
];
const FEATURE_Q = (f) => [`Como funciona: ${f}?`, `Em qual plano tem: ${f}?`, `Quero ver uma demonstração de: ${f}`];

const TREE = {
  q: "Sobre o que é a sua dúvida?",
  options: [
    { label: "Planos e o que cada um tem", next: {
      q: "Sobre qual plano?",
      options: [
        ...["essencial", "pro", "ultra"].map(id => ({ label: `${PLANS[id].label} · R$ ${PLANS[id].price}/mês`, short: PLANS[id].label, next: { q: `O que você quer saber do ${PLANS[id].label}?`, options: PLAN_Q(PLANS[id].label).map(t => ({ label: t, final: true })) } })),
        { label: "Teste grátis de 7 dias", short: "Teste grátis", next: { q: "O que você quer saber do teste grátis?", options: ["O que dá para testar no teste grátis?", "O que acontece quando o teste acaba?", "Perco meus dados se não assinar?"].map(t => ({ label: t, final: true })) } },
        { label: "Pacotes extras (pedidos e fotos)", short: "Pacotes extras", next: { q: "Sobre os pacotes extras:", options: ["Como funcionam os pacotes de +50 pedidos e +500 fotos?", "O pacote extra é mensal ou pago uma vez?", "Posso comprar mais de um pacote?"].map(t => ({ label: t, final: true })) } },
        { label: "Não sei qual plano escolher", short: "Escolher plano", next: { q: "Conta um pouco da sua fábrica:", options: ["Só eu e a produção, sem vendedores", "Tenho vendedores e quero mandar foto do brinquedo pronto", "Tenho muitos vendedores e quero CRM, mapa e o Cérebro", "Quero uma recomendação pelo WhatsApp"].map(t => ({ label: t, final: true })) } },
      ] } },
    { label: "Pagamento e cobrança", next: {
      q: "Sobre o pagamento:",
      options: ["Quais as formas de pagamento?", "Quando sou cobrado todo mês?", "Como faço para cancelar?", "Paguei e o plano não liberou", "Como troco de plano?", "Preciso de nota fiscal"].map(t => ({ label: t, final: true })) } },
    { label: "Como funciona o sistema", next: {
      q: "Sobre qual parte do sistema?",
      options: ["Extrair pedido com IA (PDF)", "Produção e finalização", "Foto e aviso ao vendedor", "Pronta entrega", "Dashboard e Cérebro", "Mapa de clientes e rotas", "Área dos vendedores e CRM"].map(f => ({ label: f, next: { q: `O que você quer saber de "${f}"?`, options: FEATURE_Q(f).map(t => ({ label: t, final: true })) } })) } },
    { label: "Conta, equipe e acesso", next: {
      q: "Sobre a conta:",
      options: ["Como crio o login dos funcionários?", "Como funciona o link de acesso da equipe?", "Funcionário esqueceu a senha", "Quero trocar o e-mail de acesso", "Meus dados ficam seguros?"].map(t => ({ label: t, final: true })) } },
    { label: "Outra dúvida", final: true, free: true },
  ],
};

export default function SupportWizard({ onClose, dark, companyName, email, planLabel }) {
  const [path, setPath] = useState([]); // opções escolhidas
  const [note, setNote] = useState("");
  const ticket = useMemo(() => Math.floor(1000 + Math.random() * 9000), []);
  const node = path.reduce((n, o) => o.next || n, TREE);
  const last = path[path.length - 1];
  const done = last?.final;
  const crumbs = path.map(o => o.short || o.label);
  const msg = [
    `Olá! Tenho uma dúvida sobre o Inflatudo.`,
    `Assunto: ${crumbs.join(" › ") || "—"}`,
    note.trim() ? `Detalhe: ${note.trim()}` : null,
    companyName ? `Empresa: ${companyName}${planLabel ? ` (plano atual: ${planLabel})` : ""}` : null,
    email ? `E-mail: ${email}` : null,
    `#duvida${ticket}`,
  ].filter(Boolean).join("\n");
  const T = dark ? { box: "bg-[#1f1f1f] text-white border border-[#333]", opt: "bg-[#2a2a2a] hover:bg-[#333]", soft: "text-[#a3a3a3]", inp: "bg-[#161616] border-[#333] text-white" }
    : { box: "bg-white text-[#1a1a1a]", opt: "bg-[#f3f1ed] hover:bg-[#ebe8e3]", soft: "text-[#6b6b6b]", inp: "bg-white border-[#ddd]" };
  return (
    <div className="fixed inset-0 z-[260] bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className={`w-full max-w-md rounded-3xl p-5 shadow-2xl max-h-[88vh] overflow-y-auto ${T.box}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center"><MessageCircle size={19} /></div>
            <div><div className="font-black leading-tight">Tirar dúvidas</div><div className={`text-[11px] ${T.soft}`}>Resposta pelo WhatsApp</div></div>
          </div>
          <button onClick={onClose} className={T.soft}><X size={20} /></button>
        </div>

        {crumbs.length > 0 && (
          <div className={`mt-4 flex flex-wrap items-center gap-1 text-[11px] font-bold ${T.soft}`}>
            {crumbs.map((c, i) => <React.Fragment key={i}>{i > 0 && <ChevronRight size={11} />}<span className="px-2 py-0.5 rounded-full bg-[#25D366]/15 text-[#1fae55]">{c}</span></React.Fragment>)}
          </div>
        )}

        {!done ? (
          <>
            <div className="mt-4 font-bold">{node.q}</div>
            <div className="mt-3 space-y-2">
              {node.options.map(o => (
                <button key={o.label} onClick={() => setPath([...path, o])} className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${T.opt}`}>
                  <span>{o.label}</span><ChevronRight size={16} className="opacity-50 flex-shrink-0" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 font-bold">{last.free ? "Escreva sua dúvida:" : "Quer acrescentar algum detalhe? (opcional)"}</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder={last.free ? "Ex.: consigo usar com duas fábricas?" : "Ex.: tenho 3 vendedores e 2 costureiras"} className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#25D366] resize-none ${T.inp}`} />
            <div className={`mt-3 rounded-xl p-3 text-xs whitespace-pre-line ${T.opt}`}>{msg}</div>
            <a href={last.free && !note.trim() ? undefined : `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
              onClick={e => { if (last.free && !note.trim()) e.preventDefault(); }}
              className={`mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white ${last.free && !note.trim() ? "bg-[#25D366]/40 cursor-not-allowed" : "bg-[#25D366] hover:bg-[#1fbe5b]"}`}>
              <MessageCircle size={18} />Enviar no WhatsApp
            </a>
          </>
        )}

        {path.length > 0 && <button onClick={() => { setPath(path.slice(0, -1)); setNote(""); }} className={`mt-4 flex items-center gap-1 text-sm font-bold ${T.soft}`}><ChevronLeft size={16} />Voltar</button>}
      </div>
    </div>
  );
}
