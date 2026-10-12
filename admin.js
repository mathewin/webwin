const ADMIN_TABS = [
  { id: "dash", label: "Dashboard" },
  { id: "vendas", label: "Vendas" },
  { id: "coms", label: "Comissões" },
  { id: "renov", label: "Renovações" },
  { id: "users", label: "Usuários" },
  { id: "cfg", label: "Config" },
  { id: "aud", label: "Auditoria" },
];

function startAdmin(user) {
  let page = "dash";
  let filtros = { de: "", ate: "", vendedor_id: "", status: "" };
  const go = async (p) => {
    page = p || page;
    try {
      const html = await htmlAdmin(page, filtros);
      renderShell(user, ADMIN_TABS, page, go, () => location.reload(), html);
      bindAdmin(page, go, filtros, (f) => { filtros = f; });
    } catch (e) {
      renderShell(user, ADMIN_TABS, page, go, () => location.reload(), `<div class="error">${esc(e.message)}</div>`);
    }
  };
  go("dash");
}

function somaVendas(rows, pred) {
  const f = rows.filter(pred);
  return { t: f.reduce((s, v) => s + Number(v.valor), 0), n: f.length };
}

function csvDownload(name, header, lines) {
  const body = "\uFEFF" + header + "\n" + lines.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
}

async function htmlAdmin(page, filtros) {
  const sb = getSb();
  if (page === "dash") {
    const [{ data: vendas, error: e1 }, { data: cfg }, { data: users }, { data: leads }] = await Promise.all([
      sb.from("vendas").select("id,valor,comissao,comissao_paga,status,data_venda,vendedor_id"),
      sb.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
      sb.from("profiles").select("id,nome,role"),
      sb.from("leads").select("id,status,desenvolvedor_id,atualizado_em"),
    ]);
    if (e1) throw new Error(pgErr(e1));
    const vs = (vendas || []).filter((v) => v.status !== "estornada");
    const now = new Date();
    const hoje0 = new Date(now); hoje0.setHours(0, 0, 0, 0);
    const sem = now.getTime() - 7 * 86400000;
    const ym = now.toISOString().slice(0, 7);
    const dia = somaVendas(vs, (v) => new Date(v.data_venda) >= hoje0);
    const semana = somaVendas(vs, (v) => new Date(v.data_venda) >= sem);
    const mes = somaVendas(vs, (v) => String(v.data_venda).slice(0, 7) === ym);
    const total = somaVendas(vs, () => true);
    const ticket = total.n ? total.t / total.n : 0;
    const comissoes = (vendas || []).filter((v) => v.status === "confirmada" && !v.comissao_paga).reduce((s, v) => s + Number(v.comissao), 0);
    const liquida = total.t - vs.reduce((s, v) => s + Number(v.comissao), 0);
    const metaQ = cfg?.meta_vendas_mes || 20;
    const metaV = cfg?.meta_valor_mes || 8000;
    const byVend = {};
    vs.forEach((v) => {
      byVend[v.vendedor_id] = byVend[v.vendedor_id] || { qtd: 0, total: 0 };
      byVend[v.vendedor_id].qtd += 1;
      byVend[v.vendedor_id].total += Number(v.valor);
    });
    const rankingVend = (users || []).filter((u) => u.role === "vendedor").map((u) => ({
      nome: u.nome, qtd: byVend[u.id]?.qtd || 0, total: byVend[u.id]?.total || 0,
    })).sort((a, b) => b.total - a.total);
    const byDev = {};
    (leads || []).filter((l) => l.status !== "na_fila" && l.status !== "em_producao" && l.desenvolvedor_id).forEach((l) => {
      byDev[l.desenvolvedor_id] = (byDev[l.desenvolvedor_id] || 0) + 1;
    });
    const rankingDev = (users || []).filter((u) => u.role === "desenvolvedor").map((u) => ({
      nome: u.nome, demos: byDev[u.id] || 0,
    })).sort((a, b) => b.demos - a.demos);
    const byDia = {};
    vs.filter((v) => new Date(v.data_venda) >= now.getTime() - 14 * 86400000).forEach((v) => {
      const d = String(v.data_venda).slice(0, 10);
      byDia[d] = (byDia[d] || 0) + Number(v.valor);
    });
    const dias = Object.keys(byDia).sort();
    const max = Math.max(1, ...dias.map((d) => byDia[d]));
    const bars = dias.map((d) => `<div class="bar" title="${d}: ${brl(byDia[d])}" style="height:${Math.max(8, (byDia[d] / max) * 100)}%"></div>`).join("");
    return `
      <div class="grid">
        <div class="grid grid-3">
          <div class="card kpi"><span class="muted">Hoje</span><b>${brl(dia.t)}</b><span class="muted">${dia.n} vendas</span></div>
          <div class="card kpi"><span class="muted">Semana</span><b>${brl(semana.t)}</b></div>
          <div class="card kpi"><span class="muted">Mês</span><b>${brl(mes.t)}</b></div>
          <div class="card kpi"><span class="muted">Total</span><b>${brl(total.t)}</b></div>
          <div class="card kpi"><span class="muted">Ticket médio</span><b>${brl(ticket)}</b></div>
          <div class="card kpi"><span class="muted">Comissões a pagar</span><b>${brl(comissoes)}</b></div>
          <div class="card kpi"><span class="muted">Receita líquida</span><b>${brl(liquida)}</b></div>
          <div class="card kpi"><span class="muted">Meta qtd</span><b>${mes.n}/${metaQ}</b><span class="muted">faltam ${Math.max(0, metaQ - mes.n)}</span></div>
          <div class="card kpi"><span class="muted">Meta valor</span><b>${brl(mes.t)}</b><span class="muted">faltam ${brl(Math.max(0, metaV - mes.t))}</span></div>
        </div>
        <div class="card"><b>Vendas por dia</b><div class="chart">${bars || `<div class="muted">Sem dados ainda.</div>`}</div></div>
        <div class="grid grid-2">
          <div class="card"><b>Ranking vendedores</b>${rankingVend.map((r) => `<div class="row" style="justify-content:space-between"><span>${esc(r.nome)}</span><span>${r.qtd} · ${brl(r.total)}</span></div>`).join("")}</div>
          <div class="card"><b>Ranking desenvolvedores</b>${rankingDev.map((r) => `<div class="row" style="justify-content:space-between"><span>${esc(r.nome)}</span><span>${r.demos} demos</span></div>`).join("")}</div>
        </div>
      </div>`;
  }
  if (page === "vendas") {
    const [{ data: users }, { data: vendas, error }] = await Promise.all([
      sb.from("profiles").select("id,nome,role").eq("role", "vendedor"),
      sb.from("vendas").select("id,valor,comissao,status,data_venda,vendedor_id,forma_pagamento,plano_renovacao,leads(instagram_handle,link_demo),profiles(nome)").order("data_venda", { ascending: false }),
    ]);
    if (error) throw new Error(pgErr(error));
    let rows = vendas || [];
    if (filtros.de) rows = rows.filter((v) => String(v.data_venda).slice(0, 10) >= filtros.de);
    if (filtros.ate) rows = rows.filter((v) => String(v.data_venda).slice(0, 10) <= filtros.ate);
    if (filtros.vendedor_id) rows = rows.filter((v) => v.vendedor_id === filtros.vendedor_id);
    if (filtros.status) rows = rows.filter((v) => v.status === filtros.status);
    return `
      <div class="grid">
        <div class="card grid grid-2">
          <div class="field"><label>De</label><input class="input" type="date" id="f-de" value="${esc(filtros.de)}" /></div>
          <div class="field"><label>Até</label><input class="input" type="date" id="f-ate" value="${esc(filtros.ate)}" /></div>
          <div class="field"><label>Vendedor</label>
            <select id="f-vend"><option value="">Todos</option>${(users || []).map((u) => `<option value="${esc(u.id)}" ${filtros.vendedor_id === u.id ? "selected" : ""}>${esc(u.nome)}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Status</label>
            <select id="f-st">
              <option value="">Todos</option>
              <option value="confirmada" ${filtros.status === "confirmada" ? "selected" : ""}>Confirmada</option>
              <option value="em_analise" ${filtros.status === "em_analise" ? "selected" : ""}>Em análise</option>
              <option value="estornada" ${filtros.status === "estornada" ? "selected" : ""}>Estornada</option>
            </select>
          </div>
          <button class="btn" id="btn-filtro">Filtrar</button>
          <button class="btn ghost" id="btn-csv-v">Exportar CSV</button>
        </div>
        <div class="card table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Vendedor</th><th>@</th><th>Site</th><th>Valor</th><th>Comissão</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${rows.map((v) => `
                <tr>
                  <td>${dataBr(v.data_venda)}</td>
                  <td>${esc(v.profiles?.nome || "")}</td>
                  <td>@${esc(v.leads?.instagram_handle || "")}</td>
                  <td>${v.leads?.link_demo ? `<a href="${esc(v.leads.link_demo)}" target="_blank" rel="noreferrer">link</a>` : "—"}</td>
                  <td>${brl(v.valor)}</td>
                  <td>${brl(v.comissao)}</td>
                  <td>${badge(v.status)}</td>
                  <td>${v.status !== "estornada" ? `<div class="row"><button class="btn warn" data-cont="${esc(v.id)}">Contestar</button><button class="btn danger" data-est="${esc(v.id)}">Estornar</button></div>` : ""}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }
  if (page === "coms") {
    const [{ data: users }, { data: vendas }] = await Promise.all([
      sb.from("profiles").select("id,nome").eq("role", "vendedor"),
      sb.from("vendas").select("vendedor_id,comissao,comissao_paga,status"),
    ]);
    const rows = (users || []).map((u) => {
      const vs = (vendas || []).filter((v) => v.vendedor_id === u.id);
      const pendente = vs.filter((v) => v.status === "confirmada" && !v.comissao_paga).reduce((s, v) => s + Number(v.comissao), 0);
      const pago = vs.filter((v) => v.comissao_paga && v.status !== "estornada").reduce((s, v) => s + Number(v.comissao), 0);
      return { id: u.id, nome: u.nome, pendente, pago };
    });
    return `
      <div class="grid">
        <button class="btn ghost" id="btn-csv-c">Exportar CSV</button>
        ${rows.map((c) => `
          <div class="card">
            <b>${esc(c.nome)}</b>
            <div class="muted">Pendente ${brl(c.pendente)} · Pago ${brl(c.pago)}</div>
            <button class="btn ok" data-pagar="${esc(c.id)}" ${c.pendente ? "" : "disabled"}>Marcar como pago</button>
          </div>`).join("")}
      </div>`;
  }
  if (page === "renov") {
    const { data, error } = await sb.from("vendas").select("id,plano_renovacao,vencimento_renovacao,status,leads(instagram_handle),profiles(nome)").neq("status", "estornada").order("vencimento_renovacao");
    if (error) throw new Error(pgErr(error));
    const rows = (data || []).map((r) => ({ ...r, renovacao: statusRenovacao(r.vencimento_renovacao) })).filter((r) => r.renovacao.label !== "ok");
    return `
      <div class="grid">
        ${rows.map((r) => `
          <div class="card">
            <div class="row" style="justify-content:space-between">
              <b>@${esc(r.leads?.instagram_handle || "")}</b>
              ${badge(r.renovacao.label)}
            </div>
            <div class="muted">${esc(r.profiles?.nome || "")} · vence ${dataCurta(r.vencimento_renovacao)} · ${esc(r.plano_renovacao)}</div>
          </div>`).join("") || `<div class="card muted">Nenhuma renovação próxima.</div>`}
      </div>`;
  }
  if (page === "users") {
    const { data: users, error } = await sb.from("profiles").select("id,nome,email,role,ativo").order("criado_em", { ascending: false });
    if (error) throw new Error(pgErr(error));
    return `
      <div class="grid">
        <form class="card" id="f-user" method="post" action="#">
          <b>Novo usuário</b>
          <div class="field"><label>Nome</label><input class="input" id="u-nome" required /></div>
          <div class="field"><label>E-mail</label><input class="input" type="email" id="u-email" required /></div>
          <div class="field"><label>Senha provisória</label><input class="input" id="u-senha" value="webwin123" required /></div>
          <div class="field"><label>Perfil</label>
            <select id="u-role"><option value="vendedor">Vendedor</option><option value="desenvolvedor">Desenvolvedor</option></select>
          </div>
          <button class="btn">Criar</button>
        </form>
        ${(users || []).map((u) => `
          <div class="card">
            <div class="row" style="justify-content:space-between">
              <div><b>${esc(u.nome)}</b><div class="muted">${esc(u.email)} · ${esc(u.role)}</div></div>
              ${badge(u.ativo ? "confirmada" : "perdido")}
            </div>
            <div class="row" style="margin-top:8px">
              <button class="btn ghost" data-ativo="${esc(u.id)}" data-on="${u.ativo ? "0" : "1"}">${u.ativo ? "Desativar" : "Ativar"}</button>
            </div>
          </div>`).join("")}
        <form class="card" id="f-lista" method="post" action="#">
          <b>Adicionar @ à fila</b>
          <textarea rows="4" id="lista" placeholder="um @ por linha" required></textarea>
          <button class="btn" style="margin-top:8px">Adicionar</button>
        </form>
      </div>`;
  }
  if (page === "cfg") {
    const [{ data: cfg, error }, { data: leads }] = await Promise.all([
      sb.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
      sb.from("leads").select("id,instagram_handle").order("atualizado_em", { ascending: false }).limit(8),
    ]);
    if (error) throw new Error(pgErr(error));
    const fields = [
      ["preco_tabela", "Preço de tabela"], ["preco_minimo", "Preço mínimo (piso)"],
      ["comissao_fixa", "Comissão fixa (R$)"], ["meta_vendas_mes", "Meta quantidade/mês"],
      ["meta_valor_mes", "Meta valor/mês"], ["limite_reservas", "Limite de reservas"],
      ["dias_para_liberar", "Dias para a demo voltar à fila"],
    ];
    return `
      <form class="card" id="f-cfg" method="post" action="#">
        ${fields.map(([k, lab]) => `<div class="field"><label>${lab}</label><input class="input" type="number" id="c-${k}" value="${esc(cfg?.[k] ?? "")}" /></div>`).join("")}
        <button class="btn">Salvar</button>
        <div style="margin-top:16px">
          <b>LGPD — apagar dados de contato</b>
          ${(leads || []).map((l) => `
            <div class="row" style="justify-content:space-between;margin-top:8px">
              <span>@${esc(l.instagram_handle)}</span>
              <button type="button" class="btn danger" data-lgpd="${esc(l.id)}">Apagar contato</button>
            </div>`).join("")}
        </div>
      </form>`;
  }
  const { data, error } = await sb.from("auditoria").select("id,acao,tabela,registro_id,criado_em,profiles(nome)").order("criado_em", { ascending: false }).limit(300);
  if (error) throw new Error(pgErr(error));
  return `
    <div class="grid">
      ${(data || []).map((a) => `
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <b>${esc(a.acao)}</b>
            <span class="muted">${dataBr(a.criado_em)}</span>
          </div>
          <div class="muted">${esc(a.profiles?.nome || "sistema")} · ${esc(a.tabela || "")} · ${esc(a.registro_id || "")}</div>
        </div>`).join("")}
    </div>`;
}

function bindAdmin(page, go, filtros, setFiltros) {
  const filtroBtn = rootEl().querySelector("#btn-filtro");
  if (filtroBtn) filtroBtn.addEventListener("click", () => {
    setFiltros({
      de: rootEl().querySelector("#f-de").value,
      ate: rootEl().querySelector("#f-ate").value,
      vendedor_id: rootEl().querySelector("#f-vend").value,
      status: rootEl().querySelector("#f-st").value,
    });
    go();
  });
  const csvV = rootEl().querySelector("#btn-csv-v");
  if (csvV) csvV.addEventListener("click", async () => {
    const { data } = await getSb().from("vendas").select("data_venda,valor,comissao,status,plano_renovacao,forma_pagamento,leads(instagram_handle,link_demo),profiles(nome)").order("data_venda", { ascending: false });
    csvDownload("vendas.csv", "data,vendedor,instagram,link,valor,comissao,status,plano,pagamento",
      (data || []).map((r) => [r.data_venda, r.profiles?.nome, r.leads?.instagram_handle, r.leads?.link_demo, r.valor, r.comissao, r.status, r.plano_renovacao, r.forma_pagamento].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")));
  });
  const csvC = rootEl().querySelector("#btn-csv-c");
  if (csvC) csvC.addEventListener("click", async () => {
    const [{ data: users }, { data: vendas }] = await Promise.all([
      getSb().from("profiles").select("id,nome").eq("role", "vendedor"),
      getSb().from("vendas").select("vendedor_id,comissao,comissao_paga,status"),
    ]);
    const lines = (users || []).map((u) => {
      const vs = (vendas || []).filter((v) => v.vendedor_id === u.id);
      const pendente = vs.filter((v) => v.status === "confirmada" && !v.comissao_paga).reduce((s, v) => s + Number(v.comissao), 0);
      const pago = vs.filter((v) => v.comissao_paga && v.status !== "estornada").reduce((s, v) => s + Number(v.comissao), 0);
      return `"${u.nome}",${pendente},${pago}`;
    });
    csvDownload("comissoes.csv", "vendedor,pendente,pago", lines);
  });
  on(rootEl(), "[data-cont]", "click", async (e) => {
    try { await rpc("contestar_venda", { p_venda_id: e.currentTarget.dataset.cont }); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-est]", "click", async (e) => {
    const motivo = prompt("Motivo do estorno (obrigatório)");
    if (!motivo) return;
    try { await rpc("estornar_venda", { p_venda_id: e.currentTarget.dataset.est, p_motivo: motivo }); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-pagar]", "click", async (e) => {
    try { await rpc("pagar_comissao", { p_vendedor_id: e.currentTarget.dataset.pagar }); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-ativo]", "click", async (e) => {
    try { await rpc("atualizar_usuario", { p_id: e.currentTarget.dataset.ativo, p_ativo: e.currentTarget.dataset.on === "1" }); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-lgpd]", "click", async (e) => {
    try { await rpc("lgpd_apagar", { p_lead_id: e.currentTarget.dataset.lgpd }); flash("ok", "Dados de contato apagados."); go(); }
    catch (err) { flash("err", err.message); }
  });
  const fUser = rootEl().querySelector("#f-user");
  if (fUser) fUser.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { data: sess } = await getSb().auth.getSession();
      const res = await fetch(`${window.WEBWIN_CONFIG.supabaseUrl}/functions/v1/criar-usuario`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` },
        body: JSON.stringify({
          nome: rootEl().querySelector("#u-nome").value,
          email: rootEl().querySelector("#u-email").value,
          senha: rootEl().querySelector("#u-senha").value,
          role: rootEl().querySelector("#u-role").value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || "Não foi possível criar o usuário.");
      flash("ok", "Usuário criado com senha provisória.");
      go();
    } catch (err) { flash("err", err.message); }
  });
  const fLista = rootEl().querySelector("#f-lista");
  if (fLista) fLista.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await rpc("adicionar_leads", { p_lista: rootEl().querySelector("#lista").value, p_nicho: "", p_cidade: "" });
      flash("ok", `${(r.criados || []).length} @ adicionados. ${(r.ignorados || []).length} duplicados ignorados.`);
      go();
    } catch (err) { flash("err", err.message); }
  });
  const fCfg = rootEl().querySelector("#f-cfg");
  if (fCfg) fCfg.addEventListener("submit", async (e) => {
    e.preventDefault();
    const patch = {};
    ["preco_tabela", "preco_minimo", "comissao_fixa", "meta_vendas_mes", "meta_valor_mes", "limite_reservas", "dias_para_liberar"].forEach((k) => {
      patch[k] = Number(rootEl().querySelector("#c-" + k).value);
    });
    const { error } = await getSb().from("configuracoes").update(patch).eq("id", 1);
    if (error) { flash("err", pgErr(error)); return; }
    flash("ok", "Configurações salvas.");
  });
}
