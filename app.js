async function boot() {
  document.title = siteMeta().nome;
  rootEl().innerHTML = `<div class="login"><div class="muted">Carregando...</div></div>`;
  try {
    const user = await loadPerfil();
    if (!user) return renderLogin((u) => route(u));
    route(user);
  } catch (e) {
    rootEl().innerHTML = `<div class="login"><div class="card"><div class="error">${esc(e.message)}</div></div></div>`;
  }
}

async function acessoNegado() {
  try { await getSb().auth.signOut(); } catch (_) {}
  rootEl().innerHTML = `
    <div class="login">
      <div class="card">
        <div class="h1">Acesso não autorizado</div>
        <p class="muted">Este site é só para ${esc(siteMeta().sub.toLowerCase())}.</p>
        <button class="btn" id="btn-ok">Entendi</button>
      </div>
    </div>`;
  document.getElementById("btn-ok").addEventListener("click", () => location.reload());
}

function route(user) {
  const need = getSite();
  if (user.role !== need) return acessoNegado();
  if (user.deve_trocar_senha) return renderTrocaSenha(user, route);
  if (user.role === "admin") return startAdmin(user);
  if (user.role === "vendedor") return startVendedor(user);
  return startDev(user);
}

boot();
