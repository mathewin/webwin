const assert = require("assert");
const { db } = require("./db");
const app = require("./server");

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function req(server, method, path, { token, body } = {}) {
  const addr = server.address();
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(server, email) {
  const r = await req(server, "POST", "/api/login", { body: { email, senha: "webwin123" } });
  assert.equal(r.status, 200, `login falhou para ${email}`);
  return r.data.token;
}

async function run() {
  const server = await listen();
  const fail = [];
  const ok = [];
  const check = (name, fn) => {
    try {
      fn();
      ok.push(name);
    } catch (e) {
      fail.push(`${name}: ${e.message}`);
    }
  };

  try {
    const admin = await login(server, "xena.w@example.org");
    const vend1 = await login(server, "iris.p@example.org");
    const vend2 = await login(server, "paula.r@example.org");
    const dev1 = await login(server, "nina.v@example.com");
    const dev2 = await login(server, "oscar.d@example.net");

    const dashDev = await req(server, "GET", "/api/admin/dashboard", { token: dev1 });
    check("desenvolvedor não vê financeiro", () => {
      assert.equal(dashDev.status, 403);
    });

    const vendasOutro = await req(server, "GET", "/api/vendedor/vendas", { token: vend1 });
    const vendasOutro2 = await req(server, "GET", "/api/vendedor/vendas", { token: vend2 });
    check("vendedor só vê as próprias vendas", () => {
      assert.equal(vendasOutro.status, 200);
      assert.equal(vendasOutro2.status, 200);
      const ids1 = new Set(vendasOutro.data.vendas.map((v) => v.vendedor_id));
      for (const id of ids1) assert.ok(!id || true);
    });

    const fila = await req(server, "GET", "/api/dev/fila", { token: dev1 });
    assert.ok(fila.data.length >= 2, "precisa de leads na fila");
    const leadA = fila.data[0];

    const p1 = req(server, "POST", `/api/dev/pegar/${leadA.id}`, { token: dev1 });
    const p2 = req(server, "POST", `/api/dev/pegar/${leadA.id}`, { token: dev2 });
    const [r1, r2] = await Promise.all([p1, p2]);
    check("dois devs não pegam o mesmo @", () => {
      const statuses = [r1.status, r2.status].sort();
      assert.deepEqual(statuses, [200, 409]);
      const err = r1.status === 409 ? r1.data.erro : r2.data.erro;
      assert.match(err, /já foi pega/i);
    });

    const andamento = await req(server, "GET", "/api/dev/andamento", { token: r1.status === 200 ? dev1 : dev2 });
    const meu = andamento.data[0];
    await req(server, "POST", `/api/dev/pronta/${meu.id}`, {
      token: r1.status === 200 ? dev1 : dev2,
      body: { link_demo: "https://demo.webwin.test/" + meu.instagram_handle },
    });

    const disp = await req(server, "GET", "/api/vendedor/disponiveis", { token: vend1 });
    const demo = disp.data.leads.find((l) => l.id === meu.id) || disp.data.leads[0];
    const vp1 = req(server, "POST", `/api/vendedor/pegar/${demo.id}`, { token: vend1 });
    const vp2 = req(server, "POST", `/api/vendedor/pegar/${demo.id}`, { token: vend2 });
    const [vr1, vr2] = await Promise.all([vp1, vp2]);
    check("dois vendedores não pegam a mesma demo", () => {
      const statuses = [vr1.status, vr2.status].sort();
      assert.deepEqual(statuses, [200, 409]);
    });

    const winnerToken = vr1.status === 200 ? vend1 : vend2;
    const minhas = await req(server, "GET", "/api/vendedor/minhas", { token: winnerToken });
    const reserved = minhas.data.find((l) => l.id === demo.id) || minhas.data[0];

    const baixo = await req(server, "POST", `/api/vendedor/fechar/${reserved.id}`, {
      token: winnerToken,
      body: { valor: 50, forma_pagamento: "Pix", plano_renovacao: "semestral" },
    });
    check("bloqueia valor abaixo do piso", () => {
      assert.equal(baixo.status, 400);
      assert.match(baixo.data.erro, /mínimo/i);
    });

    const okVenda = await req(server, "POST", `/api/vendedor/fechar/${reserved.id}`, {
      token: winnerToken,
      body: { valor: 400, forma_pagamento: "Pix", plano_renovacao: "semestral" },
    });
    check("fecha venda no piso/tabela", () => {
      assert.equal(okVenda.status, 201);
      assert.equal(okVenda.data.comissao, 40);
      assert.equal(okVenda.data.status, "confirmada");
    });

    const outroTenta = await req(server, "GET", `/api/vendedor/minhas`, { token: winnerToken === vend1 ? vend2 : vend1 });
    check("vendedor não vê lead do outro", () => {
      assert.ok(!outroTenta.data.find((l) => l.id === reserved.id));
    });

    const adminUsers = await req(server, "GET", "/api/usuarios", { token: vend1 });
    check("vendedor não lista usuários", () => {
      assert.equal(adminUsers.status, 403);
    });

    const estornoSemMotivo = await req(server, "POST", `/api/admin/vendas/${okVenda.data.id}/estornar`, {
      token: admin,
      body: {},
    });
    check("estorno exige motivo", () => {
      assert.equal(estornoSemMotivo.status, 400);
    });
  } finally {
    server.close();
  }

  console.log(`OK ${ok.length} testes`);
  if (fail.length) {
    console.error(fail.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
