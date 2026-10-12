async function boot() {
  rootEl().innerHTML = `<div class="login"><div class="muted">Carregando...</div></div>`;
  try {
    const user = await loadPerfil();
    if (!user) return renderLogin((u) => route(u));
    route(user);
  } catch (e) {
    rootEl().innerHTML = `<div class="login"><div class="card"><div class="error">${esc(e.message)}</div></div></div>`;
  }
}

function route(user) {
  if (user.deve_trocar_senha) return renderTrocaSenha(user, route);
  if (user.role === "admin") return startAdmin(user);
  if (user.role === "vendedor") return startVendedor(user);
  return startDev(user);
}

boot();
