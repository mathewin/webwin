import React, { useEffect, useState } from "react";
import { api, setToken, getToken, brl, dataBr, dataCurta } from "./api";

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const boot = async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        setUser(await api("/api/me"));
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    boot();
    const out = () => setUser(null);
    window.addEventListener("webwin-logout", out);
    return () => window.removeEventListener("webwin-logout", out);
  }, []);
  return { user, setUser, loading };
}

function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error">{error}</div>;
}

function Badge({ status }) {
  const map = {
    na_fila: "Fila",
    em_producao: "Em produção",
    demo_pronta: "Demo pronta",
    reservada: "Reservada",
    contatado: "Contatado",
    negociando: "Negociando",
    fechado: "Fechado",
    perdido: "Perdido",
    confirmada: "Confirmada",
    em_analise: "Em análise",
    estornada: "Estornada",
    pendente: "Pendente",
    em_andamento: "Em andamento",
    concluido: "Concluído",
    proximo: "Próximo",
    carencia: "Carência",
    vencido: "Vencido",
  };
  const cls = ["fechado", "confirmada", "concluido", "ok"].includes(status)
    ? "ok"
    : ["perdido", "estornada", "vencido", "danger"].includes(status)
      ? "danger"
      : ["em_analise", "negociando", "carencia", "proximo"].includes(status)
        ? "warn"
        : "";
  return <span className={`badge ${cls}`}>{map[status] || status}</span>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/login", { method: "POST", body: JSON.stringify({ email, senha }) });
      setToken(data.token);
      onLogin(data.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 16 }}>
          <div className="logo">W</div>
          <div>
            <div className="h1">WebWin</div>
            <div className="muted">Sites a partir do @ do Instagram</div>
          </div>
        </div>
        <div className="field">
          <label>E-mail</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field">
          <label>Senha</label>
          <input className="input" value={senha} onChange={(e) => setSenha(e.target.value)} type="password" required />
        </div>
        <ErrorBox error={error} />
        <button className="btn" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  );
}

function TrocaSenha({ user, onDone }) {
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/trocar-senha", { method: "POST", body: JSON.stringify({ senha }) });
      setToken(data.token);
      onDone(data.usuario);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="h1">Troque a senha provisória</div>
        <p className="muted">Olá, {user.nome}. Defina uma senha nova para continuar.</p>
        <div className="field">
          <label>Nova senha</label>
          <input className="input" type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <ErrorBox error={error} />
        <button className="btn">Salvar senha</button>
      </form>
    </div>
  );
}

function Shell({ user, tabs, page, setPage, onLogout, children }) {
  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <div className="logo">W</div>
          <div>
            <div>WebWin</div>
            <div className="muted" style={{ fontSize: 12 }}>{user.nome} · {user.role}</div>
          </div>
        </div>
        <button className="btn ghost" onClick={onLogout}>Sair</button>
      </div>
      <nav className="nav">
        {tabs.map((t) => (
          <button key={t.id} className={page === t.id ? "on" : ""} onClick={() => setPage(t.id)}>{t.label}</button>
        ))}
      </nav>
      {children}
    </div>
  );
}

function copyText(text) {
  navigator.clipboard?.writeText(text);
}

function DevArea({ user }) {
  const [page, setPage] = useState("fila");
  const [fila, setFila] = useState([]);
  const [andamento, setAndamento] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [hist, setHist] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [lista, setLista] = useState("");
  const [nicho, setNicho] = useState("");
  const [cidade, setCidade] = useState("");
  const [links, setLinks] = useState({});

  const load = async () => {
    try {
      setFila(await api("/api/dev/fila"));
      setAndamento(await api("/api/dev/andamento"));
      setAjustes(await api("/api/dev/ajustes"));
      setHist(await api("/api/dev/historico"));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(getToken())}`);
    es.addEventListener("leads", load);
    return () => es.close();
  }, []);

  const pegar = async (id) => {
    setError("");
    try {
      await api(`/api/dev/pegar/${id}`, { method: "POST" });
      setMsg("Perfil travado no seu nome.");
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const pronta = async (id) => {
    setError("");
    try {
      await api(`/api/dev/pronta/${id}`, { method: "POST", body: JSON.stringify({ link_demo: links[id] }) });
      setMsg("Demo liberada para os vendedores.");
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const addLista = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/api/leads", { method: "POST", body: JSON.stringify({ lista, nicho, cidade }) });
      setMsg(`${r.criados.length} @ adicionados. ${r.ignorados.length} duplicados ignorados.`);
      setLista("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Shell user={user} page={page} setPage={setPage} onLogout={() => { setToken(""); location.reload(); }}
      tabs={[{ id: "fila", label: "Fila" }, { id: "andamento", label: "Andamento" }, { id: "ajustes", label: "Ajustes" }, { id: "hist", label: "Histórico" }]}>
      <ErrorBox error={error} />
      {msg && <div className="okmsg">{msg}</div>}
      {page === "fila" && (
        <div className="grid">
          <form className="card" onSubmit={addLista}>
            <b>Adicionar @ à fila</b>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Lista (um @ por linha)</label>
              <textarea rows={4} value={lista} onChange={(e) => setLista(e.target.value)} required />
            </div>
            <div className="grid grid-2">
              <div className="field"><label>Nicho</label><input className="input" value={nicho} onChange={(e) => setNicho(e.target.value)} /></div>
              <div className="field"><label>Cidade</label><input className="input" value={cidade} onChange={(e) => setCidade(e.target.value)} /></div>
            </div>
            <button className="btn">Adicionar</button>
          </form>
          {fila.map((l) => (
            <div className="card" key={l.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="handle">@{l.instagram_handle}</div>
                  <div className="muted">{l.nicho} · {l.cidade}</div>
                </div>
                <button className="btn ghost" onClick={() => copyText(l.instagram_handle)}>Copiar</button>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn ok" onClick={() => pegar(l.id)}>Pegar</button>
              </div>
            </div>
          ))}
          {!fila.length && <div className="card muted">Nenhum @ na fila agora.</div>}
        </div>
      )}
      {page === "andamento" && (
        <div className="grid">
          {andamento.map((l) => (
            <div className="card" key={l.id}>
              <div className="handle">@{l.instagram_handle}</div>
              <div className="muted">{l.nicho} · {l.cidade}</div>
              <div className="field" style={{ marginTop: 10 }}>
                <label>Link da demo</label>
                <input className="input" placeholder="https://..." value={links[l.id] || ""} onChange={(e) => setLinks({ ...links, [l.id]: e.target.value })} />
              </div>
              <button className="btn ok" onClick={() => pronta(l.id)}>Demo pronta</button>
            </div>
          ))}
          {!andamento.length && <div className="card muted">Nada em andamento.</div>}
        </div>
      )}
      {page === "ajustes" && (
        <div className="grid">
          {ajustes.map((a) => (
            <div className="card" key={a.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>@{a.instagram_handle}</b>
                <Badge status={a.status} />
              </div>
              <p>{a.descricao}</p>
              {a.status !== "concluido" && (
                <div className="row">
                  {a.status === "pendente" && <button className="btn" onClick={async () => { await api(`/api/dev/ajustes/${a.id}/pegar`, { method: "POST" }); load(); }}>Pegar</button>}
                  {a.status === "em_andamento" && <button className="btn ok" onClick={async () => { await api(`/api/dev/ajustes/${a.id}/concluir`, { method: "POST" }); load(); }}>Concluir</button>}
                </div>
              )}
            </div>
          ))}
          {!ajustes.length && <div className="card muted">Sem pedidos de ajuste.</div>}
        </div>
      )}
      {page === "hist" && hist && (
        <div className="grid">
          <div className="grid grid-2">
            <div className="card kpi"><span className="muted">Demos hoje</span><b>{hist.hoje}</b></div>
            <div className="card kpi"><span className="muted">Demos na semana</span><b>{hist.semana}</b></div>
          </div>
          <div className="card">
            {hist.porDia.map((d) => <div key={d.dia} className="row" style={{ justifyContent: "space-between" }}><span>{dataCurta(d.dia)}</span><b>{d.n}</b></div>)}
          </div>
        </div>
      )}
    </Shell>
  );
}

function VendedorArea({ user }) {
  const [page, setPage] = useState("disp");
  const [disp, setDisp] = useState({ leads: [], podePegar: true, reservas: 0, limite: 20 });
  const [minhas, setMinhas] = useState([]);
  const [vendas, setVendas] = useState({ vendas: [], total: 0, comissao_receber: 0, comissao_paga: 0 });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [fechar, setFechar] = useState(null);
  const [form, setForm] = useState({ valor: 400, forma_pagamento: "Pix", plano_renovacao: "semestral" });
  const [cfg, setCfg] = useState({ preco_minimo: 150, preco_tabela: 400 });

  const load = async () => {
    try {
      setDisp(await api("/api/vendedor/disponiveis"));
      setMinhas(await api("/api/vendedor/minhas"));
      setVendas(await api("/api/vendedor/vendas"));
      setCfg(await api("/api/config"));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(getToken())}`);
    es.addEventListener("leads", load);
    es.addEventListener("vendas", load);
    return () => es.close();
  }, []);

  const pegar = async (id) => {
    setError("");
    try {
      await api(`/api/vendedor/pegar/${id}`, { method: "POST" });
      setMsg("Demo reservada para você.");
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const salvar = async (lead, patch) => {
    try {
      await api(`/api/vendedor/leads/${lead.id}`, { method: "PUT", body: JSON.stringify(patch) });
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const confirmarVenda = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/vendedor/fechar/${fechar.id}`, { method: "POST", body: JSON.stringify(form) });
      setMsg("Venda gravada na contabilidade.");
      setFechar(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Shell user={user} page={page} setPage={setPage} onLogout={() => { setToken(""); location.reload(); }}
      tabs={[{ id: "disp", label: "Disponíveis" }, { id: "minhas", label: "Minhas" }, { id: "vendas", label: "Vendas" }]}>
      <ErrorBox error={error} />
      {msg && <div className="okmsg">{msg}</div>}
      {page === "disp" && (
        <div className="grid">
          <div className="card muted">Reservas {disp.reservas}/{disp.limite}</div>
          {disp.leads.map((l) => (
            <div className="card" key={l.id}>
              <img className="cover" src={l.foto_capa} alt="" />
              <div className="handle" style={{ marginTop: 8 }}>@{l.instagram_handle}</div>
              <div className="muted">{l.nicho} · {l.cidade}</div>
              {l.link_demo && <a href={l.link_demo} target="_blank" rel="noreferrer">Abrir demo</a>}
              <div style={{ marginTop: 10 }}>
                <button className="btn ok" disabled={!disp.podePegar} onClick={() => pegar(l.id)}>Pegar</button>
                {!disp.podePegar && <div className="muted" style={{ marginTop: 8 }}>Limite de reservas atingido.</div>}
              </div>
            </div>
          ))}
          {!disp.leads.length && <div className="card muted">Nenhuma demo disponível.</div>}
        </div>
      )}
      {page === "minhas" && (
        <div className="grid">
          {minhas.map((l) => (
            <div className="card" key={l.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="handle">@{l.instagram_handle}</div>
                <Badge status={l.status} />
              </div>
              {l.link_demo && <a href={l.link_demo} target="_blank" rel="noreferrer">Abrir demo</a>}
              <div className="field" style={{ marginTop: 8 }}>
                <label>WhatsApp do cliente</label>
                <input className="input" value={l.whatsapp || ""} onChange={(e) => setMinhas(minhas.map((x) => x.id === l.id ? { ...x, whatsapp: e.target.value } : x))} onBlur={() => salvar(l, { whatsapp: l.whatsapp, status: l.status, anotacoes: l.anotacoes })} />
              </div>
              <div className="field">
                <label>Anotações</label>
                <textarea rows={2} value={l.anotacoes || ""} onChange={(e) => setMinhas(minhas.map((x) => x.id === l.id ? { ...x, anotacoes: e.target.value } : x))} onBlur={() => salvar(l, { whatsapp: l.whatsapp, status: l.status, anotacoes: l.anotacoes })} />
              </div>
              <div className="row">
                {["contatado", "negociando", "perdido"].map((s) => (
                  <button key={s} className="btn ghost" onClick={() => salvar(l, { status: s, whatsapp: l.whatsapp, anotacoes: l.anotacoes })}>{s}</button>
                ))}
                {l.whatsapp && <a className="btn" href={`https://wa.me/55${String(l.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                <button className="btn ok" onClick={() => { setFechar(l); setForm({ valor: cfg.preco_tabela, forma_pagamento: "Pix", plano_renovacao: "semestral" }); }}>Fechar venda</button>
              </div>
            </div>
          ))}
          {!minhas.length && <div className="card muted">Você ainda não reservou demos.</div>}
        </div>
      )}
      {page === "vendas" && (
        <div className="grid">
          <div className="grid grid-3">
            <div className="card kpi"><span className="muted">Total vendido</span><b>{brl(vendas.total)}</b></div>
            <div className="card kpi"><span className="muted">Comissão a receber</span><b>{brl(vendas.comissao_receber)}</b></div>
            <div className="card kpi"><span className="muted">Comissão paga</span><b>{brl(vendas.comissao_paga)}</b></div>
          </div>
          {vendas.vendas.map((v) => (
            <div className="card" key={v.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>@{v.instagram_handle}</b>
                <Badge status={v.status} />
              </div>
              <div className="muted">{dataBr(v.data_venda)} · {brl(v.valor)} · comissão {brl(v.comissao)}</div>
            </div>
          ))}
        </div>
      )}
      {fechar && (
        <div className="modal-bg" onClick={() => setFechar(null)}>
          <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={confirmarVenda}>
            <div className="h1">Fechar venda</div>
            <p className="muted">@{fechar.instagram_handle} · piso {brl(cfg.preco_minimo)}</p>
            <div className="field"><label>Valor (R$)</label><input className="input" type="number" min={cfg.preco_minimo} step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required /></div>
            <div className="field"><label>Forma de pagamento</label>
              <select value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}>
                <option>Pix</option><option>Cartão</option><option>Boleto</option><option>Dinheiro</option>
              </select>
            </div>
            <div className="field"><label>Plano de renovação</label>
              <select value={form.plano_renovacao} onChange={(e) => setForm({ ...form, plano_renovacao: e.target.value })}>
                <option value="semestral">Semestral (R$ 200)</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div className="row">
              <button className="btn ok" type="submit">Confirmar</button>
              <button className="btn ghost" type="button" onClick={() => setFechar(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
}

function Chart({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="card">
      <b>Vendas por dia</b>
      <div className="chart">
        {rows.map((r) => (
          <div key={r.dia} className="bar" title={`${r.dia}: ${brl(r.total)}`} style={{ height: `${Math.max(8, (r.total / max) * 100)}%` }} />
        ))}
        {!rows.length && <div className="muted">Sem dados ainda.</div>}
      </div>
    </div>
  );
}

function AdminArea({ user }) {
  const [page, setPage] = useState("dash");
  const [dash, setDash] = useState(null);
  const [vendas, setVendas] = useState([]);
  const [filtros, setFiltros] = useState({ de: "", ate: "", vendedor_id: "", status: "" });
  const [users, setUsers] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [coms, setComs] = useState([]);
  const [renov, setRenov] = useState([]);
  const [aud, setAud] = useState([]);
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "webwin123", role: "vendedor" });
  const [lista, setLista] = useState("");

  const load = async () => {
    try {
      setDash(await api("/api/admin/dashboard"));
      const q = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v))).toString();
      setVendas(await api("/api/admin/vendas" + (q ? `?${q}` : "")));
      setUsers(await api("/api/usuarios"));
      setCfg(await api("/api/config"));
      setComs(await api("/api/admin/comissoes"));
      setRenov(await api("/api/admin/renovacoes"));
      setAud(await api("/api/admin/auditoria"));
      setLeads(await api("/api/admin/leads"));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, [page]);

  const download = async (path, name) => {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  return (
    <Shell user={user} page={page} setPage={setPage} onLogout={() => { setToken(""); location.reload(); }}
      tabs={[{ id: "dash", label: "Dashboard" }, { id: "vendas", label: "Vendas" }, { id: "coms", label: "Comissões" }, { id: "renov", label: "Renovações" }, { id: "users", label: "Usuários" }, { id: "cfg", label: "Config" }, { id: "aud", label: "Auditoria" }]}>
      <ErrorBox error={error} />
      {msg && <div className="okmsg">{msg}</div>}
      {page === "dash" && dash && (
        <div className="grid">
          <div className="grid grid-3">
            <div className="card kpi"><span className="muted">Hoje</span><b>{brl(dash.dia.t)}</b><span className="muted">{dash.dia.n} vendas</span></div>
            <div className="card kpi"><span className="muted">Semana</span><b>{brl(dash.semana.t)}</b></div>
            <div className="card kpi"><span className="muted">Mês</span><b>{brl(dash.mes.t)}</b></div>
            <div className="card kpi"><span className="muted">Total</span><b>{brl(dash.total.t)}</b></div>
            <div className="card kpi"><span className="muted">Ticket médio</span><b>{brl(dash.ticket)}</b></div>
            <div className="card kpi"><span className="muted">Comissões a pagar</span><b>{brl(dash.comissoes_pagar)}</b></div>
            <div className="card kpi"><span className="muted">Receita líquida</span><b>{brl(dash.receita_liquida)}</b></div>
            <div className="card kpi"><span className="muted">Meta qtd</span><b>{dash.mes.n}/{dash.meta_qtd}</b><span className="muted">faltam {dash.faltam_qtd}</span></div>
            <div className="card kpi"><span className="muted">Meta valor</span><b>{brl(dash.mes.t)}</b><span className="muted">faltam {brl(dash.faltam_valor)}</span></div>
          </div>
          <Chart rows={dash.porDia} />
          <div className="grid grid-2">
            <div className="card">
              <b>Ranking vendedores</b>
              {dash.rankingVend.map((r) => <div key={r.nome} className="row" style={{ justifyContent: "space-between" }}><span>{r.nome}</span><span>{r.qtd} · {brl(r.total)}</span></div>)}
            </div>
            <div className="card">
              <b>Ranking desenvolvedores</b>
              {dash.rankingDev.map((r) => <div key={r.nome} className="row" style={{ justifyContent: "space-between" }}><span>{r.nome}</span><span>{r.demos} demos</span></div>)}
            </div>
          </div>
        </div>
      )}
      {page === "vendas" && (
        <div className="grid">
          <div className="card grid grid-2">
            <div className="field"><label>De</label><input className="input" type="date" value={filtros.de} onChange={(e) => setFiltros({ ...filtros, de: e.target.value })} /></div>
            <div className="field"><label>Até</label><input className="input" type="date" value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} /></div>
            <div className="field"><label>Vendedor</label>
              <select value={filtros.vendedor_id} onChange={(e) => setFiltros({ ...filtros, vendedor_id: e.target.value })}>
                <option value="">Todos</option>
                {users.filter((u) => u.role === "vendedor").map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="field"><label>Status</label>
              <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
                <option value="">Todos</option>
                <option value="confirmada">Confirmada</option>
                <option value="em_analise">Em análise</option>
                <option value="estornada">Estornada</option>
              </select>
            </div>
            <button className="btn" onClick={load}>Filtrar</button>
            <button className="btn ghost" onClick={() => download("/api/admin/export/vendas.csv", "vendas.csv")}>Exportar CSV</button>
          </div>
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Vendedor</th><th>@</th><th>Site</th><th>Valor</th><th>Comissão</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id}>
                    <td>{dataBr(v.data_venda)}</td>
                    <td>{v.vendedor_nome}</td>
                    <td>@{v.instagram_handle}</td>
                    <td>{v.link_demo ? <a href={v.link_demo} target="_blank" rel="noreferrer">link</a> : "—"}</td>
                    <td>{brl(v.valor)}</td>
                    <td>{brl(v.comissao)}</td>
                    <td><Badge status={v.status} /></td>
                    <td>
                      {v.status !== "estornada" && (
                        <div className="row">
                          <button className="btn warn" onClick={async () => { await api(`/api/admin/vendas/${v.id}/contestar`, { method: "POST" }); load(); }}>Contestar</button>
                          <button className="btn danger" onClick={async () => {
                            const motivo = prompt("Motivo do estorno (obrigatório)");
                            if (!motivo) return;
                            try { await api(`/api/admin/vendas/${v.id}/estornar`, { method: "POST", body: JSON.stringify({ motivo }) }); load(); }
                            catch (e) { setError(e.message); }
                          }}>Estornar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {page === "coms" && (
        <div className="grid">
          <button className="btn ghost" onClick={() => download("/api/admin/export/comissoes.csv", "comissoes.csv")}>Exportar CSV</button>
          {coms.map((c) => (
            <div className="card" key={c.vendedor_id}>
              <b>{c.nome}</b>
              <div className="muted">Pendente {brl(c.pendente)} · Pago {brl(c.pago)}</div>
              <button className="btn ok" disabled={!c.pendente} onClick={async () => { await api(`/api/admin/comissoes/${c.vendedor_id}/pagar`, { method: "POST" }); load(); }}>Marcar como pago</button>
            </div>
          ))}
        </div>
      )}
      {page === "renov" && (
        <div className="grid">
          {renov.map((r) => (
            <div className="card" key={r.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>@{r.instagram_handle}</b>
                <Badge status={r.renovacao.label} />
              </div>
              <div className="muted">{r.vendedor_nome} · vence {dataCurta(r.vencimento_renovacao)} · {r.plano_renovacao}</div>
            </div>
          ))}
          {!renov.length && <div className="card muted">Nenhuma renovação próxima.</div>}
        </div>
      )}
      {page === "users" && (
        <div className="grid">
          <form className="card" onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/usuarios", { method: "POST", body: JSON.stringify(novo) });
              setMsg("Usuário criado com senha provisória.");
              setNovo({ nome: "", email: "", senha: "webwin123", role: "vendedor" });
              load();
            } catch (err) { setError(err.message); }
          }}>
            <b>Novo usuário</b>
            <div className="field"><label>Nome</label><input className="input" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required /></div>
            <div className="field"><label>E-mail</label><input className="input" type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required /></div>
            <div className="field"><label>Senha provisória</label><input className="input" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} required /></div>
            <div className="field"><label>Perfil</label>
              <select value={novo.role} onChange={(e) => setNovo({ ...novo, role: e.target.value })}>
                <option value="vendedor">Vendedor</option>
                <option value="desenvolvedor">Desenvolvedor</option>
              </select>
            </div>
            <button className="btn">Criar</button>
          </form>
          {users.map((u) => (
            <div className="card" key={u.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div><b>{u.nome}</b><div className="muted">{u.email} · {u.role}</div></div>
                <Badge status={u.ativo ? "confirmada" : "perdido"} />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn ghost" onClick={async () => { await api(`/api/usuarios/${u.id}`, { method: "PUT", body: JSON.stringify({ ativo: !u.ativo }) }); load(); }}>{u.ativo ? "Desativar" : "Ativar"}</button>
              </div>
            </div>
          ))}
          <form className="card" onSubmit={async (e) => {
            e.preventDefault();
            const r = await api("/api/leads", { method: "POST", body: JSON.stringify({ lista }) });
            setMsg(`${r.criados.length} @ adicionados. ${r.ignorados.length} duplicados ignorados.`);
            setLista("");
            load();
          }}>
            <b>Adicionar @ à fila</b>
            <textarea rows={4} value={lista} onChange={(e) => setLista(e.target.value)} placeholder={"um @ por linha"} required />
            <button className="btn" style={{ marginTop: 8 }}>Adicionar</button>
          </form>
        </div>
      )}
      {page === "cfg" && cfg && (
        <form className="card" onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/config", { method: "PUT", body: JSON.stringify(cfg) });
          setMsg("Configurações salvas.");
        }}>
          {[["preco_tabela", "Preço de tabela"], ["preco_minimo", "Preço mínimo (piso)"], ["comissao_fixa", "Comissão fixa (R$)"], ["meta_vendas_mes", "Meta quantidade/mês"], ["meta_valor_mes", "Meta valor/mês"], ["limite_reservas", "Limite de reservas"], ["dias_para_liberar", "Dias para a demo voltar à fila"]].map(([k, lab]) => (
            <div className="field" key={k}><label>{lab}</label><input className="input" type="number" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} /></div>
          ))}
          <button className="btn">Salvar</button>
          <div style={{ marginTop: 16 }}>
            <b>LGPD — apagar dados de contato</b>
            {leads.slice(0, 8).map((l) => (
              <div key={l.id} className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                <span>@{l.instagram_handle}</span>
                <button type="button" className="btn danger" onClick={async () => { await api(`/api/admin/lgpd/${l.id}`, { method: "POST" }); setMsg("Dados de contato apagados."); }}>Apagar contato</button>
              </div>
            ))}
          </div>
        </form>
      )}
      {page === "aud" && (
        <div className="grid">
          {aud.map((a) => (
            <div className="card" key={a.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{a.acao}</b>
                <span className="muted">{dataBr(a.criado_em)}</span>
              </div>
              <div className="muted">{a.usuario_nome || "sistema"} · {a.tabela} · {a.registro_id}</div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

export default function App() {
  const { user, setUser, loading } = useAuth();
  if (loading) return <div className="login"><div className="muted">Carregando...</div></div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.deve_trocar_senha) return <TrocaSenha user={user} onDone={setUser} />;
  if (user.role === "admin") return <AdminArea user={user} />;
  if (user.role === "vendedor") return <VendedorArea user={user} />;
  return <DevArea user={user} />;
}
