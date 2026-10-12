function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function brl(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function dataCurta(iso) {
  if (!iso) return "—";
  const d = new Date(String(iso).includes("T") ? iso : iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function copyText(text) {
  navigator.clipboard?.writeText(text);
}

function pgErr(e) {
  const m = e && (e.message || e.error_description || e.erro);
  if (!m) return "Não foi possível concluir.";
  return String(m).replace(/^.*ERROR:\s*/i, "").split("\n")[0];
}

function getSb() {
  if (window._sb) return window._sb;
  const cfg = window.WEBWIN_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || cfg.supabaseAnonKey === "COLE_AQUI_A_ANON_KEY") {
    throw new Error("Cole a anon key em config.js antes de usar o site.");
  }
  window._sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return window._sb;
}

async function rpc(name, args) {
  const { data, error } = await getSb().rpc(name, args);
  if (error) throw new Error(pgErr(error));
  return data;
}

function statusRenovacao(vencimento) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(String(vencimento).slice(0, 10) + "T00:00:00");
  const diff = Math.round((v - hoje) / 86400000);
  if (diff < -30) return { label: "vencido", dias: diff };
  if (diff < 0) return { label: "carencia", dias: diff };
  if (diff <= 60) return { label: "proximo", dias: diff };
  return { label: "ok", dias: diff };
}

function badge(status) {
  const map = {
    na_fila: "Fila", em_producao: "Em produção", demo_pronta: "Demo pronta",
    reservada: "Reservada", contatado: "Contatado", negociando: "Negociando",
    fechado: "Fechado", perdido: "Perdido", confirmada: "Confirmada",
    em_analise: "Em análise", estornada: "Estornada", pendente: "Pendente",
    em_andamento: "Em andamento", concluido: "Concluído", proximo: "Próximo",
    carencia: "Carência", vencido: "Vencido",
  };
  const cls = ["fechado", "confirmada", "concluido", "ok"].includes(status)
    ? "ok"
    : ["perdido", "estornada", "vencido", "danger"].includes(status)
      ? "danger"
      : ["em_analise", "negociando", "carencia", "proximo"].includes(status)
        ? "warn"
        : "";
  return `<span class="badge ${cls}">${esc(map[status] || status)}</span>`;
}

function rootEl() {
  return document.getElementById("root");
}

function on(el, sel, ev, fn) {
  el.querySelectorAll(sel).forEach((n) => n.addEventListener(ev, fn));
}
