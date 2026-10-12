async function loadPerfil() {
  const sb = getSb();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return null;
  const uid = sess.session.user.id;
  const { data, error } = await sb.from("profiles").select("id,nome,email,role,ativo,deve_trocar_senha").eq("id", uid).maybeSingle();
  if (error) throw new Error(pgErr(error));
  if (!data) return null;
  if (!data.ativo) {
    await sb.auth.signOut();
    throw new Error("Esta conta está desativada.");
  }
  return data;
}

function renderLogin(onOk) {
  rootEl().innerHTML = `
    <div class="login">
      <form class="card" id="f-login">
        <div class="brand" style="margin-bottom:16px">
          <div class="logo">W</div>
          <div>
            <div class="h1">WebWin</div>
            <div class="muted">Sites a partir do @ do Instagram</div>
          </div>
        </div>
        <div class="field"><label>E-mail</label><input class="input" id="email" type="email" required /></div>
        <div class="field"><label>Senha</label><input class="input" id="senha" type="password" required /></div>
        <div id="err"></div>
        <button class="btn" type="submit">Entrar</button>
      </form>
    </div>`;
  rootEl().querySelector("#f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Entrando...";
    rootEl().querySelector("#err").innerHTML = "";
    try {
      const email = rootEl().querySelector("#email").value.trim().toLowerCase();
      const senha = rootEl().querySelector("#senha").value;
      const { error } = await getSb().auth.signInWithPassword({ email, password: senha });
      if (error) {
        const msg = String(error.message || "");
        if (/invalid login|invalid credentials|email or password/i.test(msg)) {
          throw new Error("E-mail ou senha inválidos.");
        }
        throw new Error(msg || "E-mail ou senha inválidos.");
      }
      const user = await loadPerfil();
      if (!user) throw new Error("Perfil não encontrado.");
      onOk(user);
    } catch (err) {
      rootEl().querySelector("#err").innerHTML = `<div class="error">${esc(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });
}

function renderTrocaSenha(user, onOk) {
  rootEl().innerHTML = `
    <div class="login">
      <form class="card" id="f-senha">
        <div class="h1">Troque a senha provisória</div>
        <p class="muted">Olá, ${esc(user.nome)}. Defina uma senha nova para continuar.</p>
        <div class="field"><label>Nova senha</label><input class="input" id="senha" type="password" minlength="6" required /></div>
        <div id="err"></div>
        <button class="btn" type="submit">Salvar senha</button>
      </form>
    </div>`;
  rootEl().querySelector("#f-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    rootEl().querySelector("#err").innerHTML = "";
    try {
      const senha = rootEl().querySelector("#senha").value;
      if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      const { error } = await getSb().auth.updateUser({ password: senha });
      if (error) throw new Error(pgErr(error));
      await rpc("concluir_troca_senha");
      const next = await loadPerfil();
      onOk(next);
    } catch (err) {
      rootEl().querySelector("#err").innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
  });
}

function renderShell(user, tabs, page, onPage, onLogout, html) {
  rootEl().innerHTML = `
    <div class="app-shell">
      <div class="topbar">
        <div class="brand">
          <div class="logo">W</div>
          <div>
            <div>WebWin</div>
            <div class="muted" style="font-size:12px">${esc(user.nome)} · ${esc(user.role)}</div>
          </div>
        </div>
        <button class="btn ghost" id="btn-sair">Sair</button>
      </div>
      <nav class="nav">
        ${tabs.map((t) => `<button data-p="${esc(t.id)}" class="${t.id === page ? "on" : ""}">${esc(t.label)}</button>`).join("")}
      </nav>
      <div id="flash"></div>
      <div id="area">${html}</div>
    </div>`;
  rootEl().querySelector("#btn-sair").addEventListener("click", async () => {
    await getSb().auth.signOut();
    onLogout();
  });
  on(rootEl(), ".nav button", "click", (e) => onPage(e.currentTarget.dataset.p));
}

function flash(tipo, msg) {
  const el = document.getElementById("flash");
  if (!el) return;
  el.innerHTML = msg ? `<div class="${tipo === "ok" ? "okmsg" : "error"}">${esc(msg)}</div>` : "";
}

function areaEl() {
  return document.getElementById("area");
}
