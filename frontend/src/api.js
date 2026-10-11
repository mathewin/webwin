const KEY = "webwin_token";

export function getToken() {
  return localStorage.getItem(KEY) || "";
}

export function setToken(t) {
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    setToken("");
    if (!path.includes("/login")) window.dispatchEvent(new Event("webwin-logout"));
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/csv")) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || "Não foi possível concluir.");
  return data;
}

export function brl(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBr(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function dataCurta(iso) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}
