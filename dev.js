const DEV_TABS = [
  { id: "fila", label: "Fila" },
  { id: "andamento", label: "Andamento" },
  { id: "ajustes", label: "Ajustes" },
  { id: "hist", label: "Histórico" },
];

function startDev(user) {
  let page = "fila";
  let chan;
  const go = async (p) => {
    page = p || page;
    try {
      const html = await htmlDev(page);
      renderShell(user, DEV_TABS, page, go, () => location.reload(), html);
      bindDev(page, go);
    } catch (e) {
      renderShell(user, DEV_TABS, page, go, () => location.reload(), `<div class="error">${esc(e.message)}</div>`);
    }
  };
  go("fila");
  chan = getSb().channel("leads-dev").on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => go()).subscribe();
  window._unsub = () => { try { getSb().removeChannel(chan); } catch (_) {} };
}

async function htmlDev(page) {
  const sb = getSb();
  if (page === "fila") {
    const { data, error } = await sb.from("leads").select("id,instagram_handle,nicho,cidade").eq("status", "na_fila").order("criado_em");
    if (error) throw new Error(pgErr(error));
    const cards = (data || []).map((l) => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="handle">@${esc(l.instagram_handle)}</div>
            <div class="muted">${esc(l.nicho || "")} · ${esc(l.cidade || "")}</div>
          </div>
          <button class="btn ghost" data-copy="${esc(l.instagram_handle)}">Copiar</button>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn ok" data-pegar="${esc(l.id)}">Pegar</button>
        </div>
      </div>`).join("") || `<div class="card muted">Nenhum @ na fila agora.</div>`;
    return `
      <div class="grid">
        <form class="card" id="f-lista">
          <b>Adicionar @ à fila</b>
          <div class="field" style="margin-top:10px"><label>Lista (um @ por linha)</label><textarea rows="4" id="lista" required></textarea></div>
          <div class="grid grid-2">
            <div class="field"><label>Nicho</label><input class="input" id="nicho" /></div>
            <div class="field"><label>Cidade</label><input class="input" id="cidade" /></div>
          </div>
          <button class="btn">Adicionar</button>
        </form>
        ${cards}
      </div>`;
  }
  if (page === "andamento") {
    const { data, error } = await sb.from("leads").select("id,instagram_handle,nicho,cidade").eq("status", "em_producao").eq("desenvolvedor_id", (await sb.auth.getUser()).data.user.id).order("atualizado_em", { ascending: false });
    if (error) throw new Error(pgErr(error));
    const cards = (data || []).map((l) => `
      <div class="card">
        <div class="handle">@${esc(l.instagram_handle)}</div>
        <div class="muted">${esc(l.nicho || "")} · ${esc(l.cidade || "")}</div>
        <div class="field" style="margin-top:10px"><label>Link da demo</label><input class="input" data-link="${esc(l.id)}" placeholder="https://..." /></div>
        <div class="row">
          <button class="btn ok" data-pronta="${esc(l.id)}">Demo pronta</button>
          <button class="btn ghost" data-devolver="${esc(l.id)}">Devolver à fila</button>
        </div>
      </div>`).join("") || `<div class="card muted">Nada em andamento.</div>`;
    return `<div class="grid">${cards}</div>`;
  }
  if (page === "ajustes") {
    const { data, error } = await sb.from("ajustes").select("id,descricao,status,leads(instagram_handle)").order("criado_em", { ascending: false });
    if (error) throw new Error(pgErr(error));
    const cards = (data || []).map((a) => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>@${esc(a.leads?.instagram_handle || "")}</b>
          ${badge(a.status)}
        </div>
        <p>${esc(a.descricao)}</p>
        ${a.status === "pendente" ? `<button class="btn" data-aj-pegar="${esc(a.id)}">Pegar</button>` : ""}
        ${a.status === "em_andamento" ? `<button class="btn ok" data-aj-ok="${esc(a.id)}">Concluir</button>` : ""}
      </div>`).join("") || `<div class="card muted">Sem pedidos de ajuste.</div>`;
    return `<div class="grid">${cards}</div>`;
  }
  const uid = (await sb.auth.getUser()).data.user.id;
  const { data, error } = await sb.from("leads").select("atualizado_em,status").eq("desenvolvedor_id", uid);
  if (error) throw new Error(pgErr(error));
  const done = (data || []).filter((l) => l.status !== "na_fila" && l.status !== "em_producao");
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  const sem = Date.now() - 7 * 86400000;
  const hoje = done.filter((l) => new Date(l.atualizado_em) >= hoje0).length;
  const semana = done.filter((l) => new Date(l.atualizado_em) >= sem).length;
  const by = {};
  done.forEach((l) => {
    const d = String(l.atualizado_em).slice(0, 10);
    by[d] = (by[d] || 0) + 1;
  });
  const porDia = Object.keys(by).sort().reverse().slice(0, 14).map((d) => `<div class="row" style="justify-content:space-between"><span>${dataCurta(d)}</span><b>${by[d]}</b></div>`).join("");
  return `
    <div class="grid">
      <div class="grid grid-2">
        <div class="card kpi"><span class="muted">Demos hoje</span><b>${hoje}</b></div>
        <div class="card kpi"><span class="muted">Demos na semana</span><b>${semana}</b></div>
      </div>
      <div class="card">${porDia || `<div class="muted">Sem dados ainda.</div>`}</div>
    </div>`;
}

function bindDev(page, go) {
  on(rootEl(), "[data-copy]", "click", (e) => copyText(e.currentTarget.dataset.copy));
  on(rootEl(), "[data-pegar]", "click", async (e) => {
    try { await rpc("pegar_lead_dev", { p_lead_id: e.currentTarget.dataset.pegar }); flash("ok", "Perfil travado no seu nome."); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-pronta]", "click", async (e) => {
    const id = e.currentTarget.dataset.pronta;
    const link = rootEl().querySelector(`[data-link="${id}"]`)?.value || "";
    try { await rpc("marcar_demo_pronta", { p_lead_id: id, p_link: link }); flash("ok", "Demo liberada para os vendedores."); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-devolver]", "click", async (e) => {
    try { await rpc("devolver_lead_dev", { p_lead_id: e.currentTarget.dataset.devolver }); flash("ok", "Perfil devolvido à fila."); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-aj-pegar]", "click", async (e) => {
    try { await rpc("pegar_ajuste", { p_ajuste_id: e.currentTarget.dataset.ajPegar }); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-aj-ok]", "click", async (e) => {
    try { await rpc("concluir_ajuste", { p_ajuste_id: e.currentTarget.dataset.ajOk }); go(); }
    catch (err) { flash("err", err.message); }
  });
  const form = rootEl().querySelector("#f-lista");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await rpc("adicionar_leads", {
        p_lista: rootEl().querySelector("#lista").value,
        p_nicho: rootEl().querySelector("#nicho").value,
        p_cidade: rootEl().querySelector("#cidade").value,
      });
      flash("ok", `${(r.criados || []).length} @ adicionados. ${(r.ignorados || []).length} duplicados ignorados.`);
      go();
    } catch (err) { flash("err", err.message); }
  });
}
