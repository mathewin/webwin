const VEND_TABS = [
  { id: "disp", label: "Disponíveis" },
  { id: "minhas", label: "Minhas" },
  { id: "vendas", label: "Vendas" },
];

function startVendedor(user) {
  let page = "disp";
  let cfg = { preco_minimo: 150, preco_tabela: 400 };
  let fechar = null;
  const go = async (p) => {
    page = p || page;
    try {
      const { data: c } = await getSb().from("configuracoes").select("preco_minimo,preco_tabela,comissao_fixa,limite_reservas").eq("id", 1).maybeSingle();
      if (c) cfg = c;
      await rpc("liberar_reservas_expiradas");
      const html = await htmlVend(page, cfg, fechar);
      renderShell(user, VEND_TABS, page, go, () => location.reload(), html);
      bindVend(page, go, cfg, (l) => { fechar = l; go("minhas"); }, () => { fechar = null; go("minhas"); });
    } catch (e) {
      renderShell(user, VEND_TABS, page, go, () => location.reload(), `<div class="error">${esc(e.message)}</div>`);
    }
  };
  go("disp");
  const chan = getSb().channel("leads-vend").on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => go()).subscribe();
  window._unsub = () => { try { getSb().removeChannel(chan); } catch (_) {} };
}

async function htmlVend(page, cfg, fechar) {
  const sb = getSb();
  const uid = (await sb.auth.getUser()).data.user.id;
  if (page === "disp") {
    const { data: abertas } = await sb.from("leads").select("id").eq("vendedor_id", uid).in("status", ["reservada", "contatado", "negociando"]);
    const reservas = (abertas || []).length;
    const limite = cfg.limite_reservas || 20;
    const pode = reservas < limite;
    const { data, error } = await sb.from("leads").select("id,instagram_handle,nicho,cidade,foto_capa,link_demo").eq("status", "demo_pronta").order("atualizado_em", { ascending: false });
    if (error) throw new Error(pgErr(error));
    const cards = (data || []).map((l) => `
      <div class="card">
        <img class="cover" src="${esc(l.foto_capa || "")}" alt="" />
        <div class="handle" style="margin-top:8px">@${esc(l.instagram_handle)}</div>
        <div class="muted">${esc(l.nicho || "")} · ${esc(l.cidade || "")}</div>
        ${l.link_demo ? `<a href="${esc(l.link_demo)}" target="_blank" rel="noreferrer">Abrir demo</a>` : ""}
        <div style="margin-top:10px">
          <button class="btn ok" data-pegar="${esc(l.id)}" ${pode ? "" : "disabled"}>Pegar</button>
          ${pode ? "" : `<div class="muted" style="margin-top:8px">Limite de reservas atingido.</div>`}
        </div>
      </div>`).join("") || `<div class="card muted">Nenhuma demo disponível.</div>`;
    return `<div class="grid"><div class="card muted">Reservas ${reservas}/${limite}</div>${cards}</div>`;
  }
  if (page === "minhas") {
    const { data, error } = await sb.from("leads").select("id,instagram_handle,status,link_demo").eq("vendedor_id", uid).in("status", ["reservada", "contatado", "negociando"]).order("atualizado_em", { ascending: false });
    if (error) throw new Error(pgErr(error));
    const ids = (data || []).map((l) => l.id);
    const { data: contatos } = ids.length
      ? await sb.from("leads_contato").select("id,whatsapp,anotacoes").in("id", ids)
      : { data: [] };
    const cmap = Object.fromEntries((contatos || []).map((c) => [c.id, c]));
    const cards = (data || []).map((l) => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div class="handle">@${esc(l.instagram_handle)}</div>
          ${badge(l.status)}
        </div>
        ${l.link_demo ? `<a href="${esc(l.link_demo)}" target="_blank" rel="noreferrer">Abrir demo</a>` : ""}
        <div class="field" style="margin-top:8px"><label>WhatsApp do cliente</label><input class="input" data-wa="${esc(l.id)}" data-cur="${esc(l.status)}" value="${esc(cmap[l.id]?.whatsapp || "")}" /></div>
        <div class="field"><label>Anotações</label><textarea rows="2" data-an="${esc(l.id)}" data-cur="${esc(l.status)}">${esc(cmap[l.id]?.anotacoes || "")}</textarea></div>
        <div class="row">
          ${["contatado", "negociando", "perdido"].map((s) => `<button class="btn ghost" data-st="${esc(l.id)}" data-s="${s}">${s}</button>`).join("")}
          ${cmap[l.id]?.whatsapp ? `<a class="btn" href="https://wa.me/55${String(cmap[l.id].whatsapp).replace(/\D/g, "")}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}
          <button class="btn ok" data-fechar='${JSON.stringify({ id: l.id, instagram_handle: l.instagram_handle })}'>Fechar venda</button>
        </div>
      </div>`).join("") || `<div class="card muted">Você ainda não reservou demos.</div>`;
    const modal = fechar ? `
      <div class="modal-bg" id="modal-bg">
        <form class="card modal" id="f-fechar" data-lead="${esc(fechar.id)}">
          <div class="h1">Fechar venda</div>
          <p class="muted">@${esc(fechar.instagram_handle)} · piso ${brl(cfg.preco_minimo)}</p>
          <div class="field"><label>Valor (R$)</label><input class="input" id="valor" type="number" min="${cfg.preco_minimo}" step="0.01" value="${cfg.preco_tabela}" required /></div>
          <div class="field"><label>Forma de pagamento</label>
            <select id="forma"><option>Pix</option><option>Cartão</option><option>Boleto</option><option>Dinheiro</option></select>
          </div>
          <div class="field"><label>Plano de renovação</label>
            <select id="plano">
              <option value="semestral">Semestral (R$ 200)</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <div class="row">
            <button class="btn ok" type="submit">Confirmar</button>
            <button class="btn ghost" type="button" id="cancelar">Cancelar</button>
          </div>
        </form>
      </div>` : "";
    return `<div class="grid">${cards}</div>${modal}`;
  }
  const { data, error } = await sb.from("vendas").select("id,valor,comissao,comissao_paga,status,data_venda,leads(instagram_handle)").eq("vendedor_id", uid).order("data_venda", { ascending: false });
  if (error) throw new Error(pgErr(error));
  const vendas = data || [];
  const total = vendas.filter((v) => v.status !== "estornada").reduce((s, v) => s + Number(v.valor), 0);
  const rec = vendas.filter((v) => v.status === "confirmada" && !v.comissao_paga).reduce((s, v) => s + Number(v.comissao), 0);
  const paga = vendas.filter((v) => v.comissao_paga && v.status !== "estornada").reduce((s, v) => s + Number(v.comissao), 0);
  const cards = vendas.map((v) => `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <b>@${esc(v.leads?.instagram_handle || "")}</b>
        ${badge(v.status)}
      </div>
      <div class="muted">${dataBr(v.data_venda)} · ${brl(v.valor)} · comissão ${brl(v.comissao)}</div>
    </div>`).join("");
  return `
    <div class="grid">
      <div class="grid grid-3">
        <div class="card kpi"><span class="muted">Total vendido</span><b>${brl(total)}</b></div>
        <div class="card kpi"><span class="muted">Comissão a receber</span><b>${brl(rec)}</b></div>
        <div class="card kpi"><span class="muted">Comissão paga</span><b>${brl(paga)}</b></div>
      </div>
      ${cards}
    </div>`;
}

function patchLead(id, go) {
  const wa = rootEl().querySelector(`[data-wa="${id}"]`)?.value || "";
  const an = rootEl().querySelector(`[data-an="${id}"]`)?.value || "";
  return { wa, an };
}

function bindVend(page, go, cfg, openFechar, closeFechar) {
  on(rootEl(), "[data-pegar]", "click", async (e) => {
    try { await rpc("pegar_lead_vendedor", { p_lead_id: e.currentTarget.dataset.pegar }); flash("ok", "Demo reservada para você."); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-wa]", "blur", async (e) => {
    const id = e.currentTarget.dataset.wa;
    const { wa, an } = patchLead(id);
    try { await rpc("atualizar_lead_vendedor", { p_lead_id: id, p_status: e.currentTarget.dataset.cur || "reservada", p_whatsapp: wa, p_anotacoes: an }); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-an]", "blur", async (e) => {
    const id = e.currentTarget.dataset.an;
    const { wa, an } = patchLead(id);
    try { await rpc("atualizar_lead_vendedor", { p_lead_id: id, p_status: e.currentTarget.dataset.cur || "reservada", p_whatsapp: wa, p_anotacoes: an }); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-st]", "click", async (e) => {
    const id = e.currentTarget.dataset.st;
    const { wa, an } = patchLead(id);
    try { await rpc("atualizar_lead_vendedor", { p_lead_id: id, p_status: e.currentTarget.dataset.s, p_whatsapp: wa, p_anotacoes: an }); go(); }
    catch (err) { flash("err", err.message); }
  });
  on(rootEl(), "[data-fechar]", "click", (e) => {
    try { openFechar(JSON.parse(e.currentTarget.dataset.fechar)); } catch (_) {}
  });
  const bg = rootEl().querySelector("#modal-bg");
  if (bg) bg.addEventListener("click", (e) => { if (e.target === bg) closeFechar(); });
  const cancel = rootEl().querySelector("#cancelar");
  if (cancel) cancel.addEventListener("click", closeFechar);
  const form = rootEl().querySelector("#f-fechar");
  if (form) {
    form.addEventListener("click", (e) => e.stopPropagation());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await rpc("fechar_venda", {
          p_lead_id: form.dataset.lead,
          p_valor: Number(rootEl().querySelector("#valor").value),
          p_forma: rootEl().querySelector("#forma").value,
          p_plano: rootEl().querySelector("#plano").value,
        });
        flash("ok", "Venda gravada na contabilidade.");
        closeFechar();
      } catch (err) { flash("err", err.message); }
    });
  }
}
