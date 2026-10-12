const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { db, uuid, now, audit, getConfig, liberarReservasExpiradas, sanitizeLeadForRole, bcrypt } = require("./db");

const SECRET = process.env.WEBWIN_JWT_SECRET || "webwin-dev-secret-change-me";
const PORT = Number(process.env.PORT || 3001);
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, "..", "..", "frontend", "dist");
const clients = new Set();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function sign(profile) {
  return jwt.sign(
    { id: profile.id, role: profile.role, email: profile.email },
    SECRET,
    { expiresIn: "12h" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: "Faça login para continuar." });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare("SELECT * FROM profiles WHERE id = ?").get(payload.id);
    if (!user || !user.ativo) return res.status(401).json({ erro: "Conta inativa ou inexistente." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ erro: "Sessão expirada. Entre novamente." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ erro: "Você não tem permissão para essa ação." });
    }
    next();
  };
}

function publicProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    nome: p.nome,
    email: p.email,
    role: p.role,
    ativo: Boolean(p.ativo),
    deve_trocar_senha: Boolean(p.deve_trocar_senha),
    criado_em: p.criado_em,
  };
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function statusRenovacao(vencimento) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(vencimento + "T00:00:00");
  const diff = Math.round((v - hoje) / 86400000);
  if (diff < -30) return { label: "vencido", dias: diff };
  if (diff < 0) return { label: "carencia", dias: diff };
  if (diff <= 60) return { label: "proximo", dias: diff };
  return { label: "ok", dias: diff };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

function authFromQuery(req, res, next) {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return auth(req, res, next);
}

app.get("/api/stream", authFromQuery, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ role: req.user.role })}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const senha = String(req.body.senha || "");
  const user = db.prepare("SELECT * FROM profiles WHERE lower(email) = ?").get(email);
  if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
    return res.status(401).json({ erro: "E-mail ou senha inválidos." });
  }
  if (!user.ativo) return res.status(403).json({ erro: "Esta conta está desativada." });
  audit(user.id, "login", "profiles", user.id, {});
  res.json({ token: sign(user), usuario: publicProfile(user) });
});

app.get("/api/me", auth, (req, res) => {
  res.json(publicProfile(req.user));
});

app.post("/api/trocar-senha", auth, (req, res) => {
  const senha = String(req.body.senha || "");
  if (senha.length < 6) return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
  db.prepare("UPDATE profiles SET senha_hash = ?, deve_trocar_senha = 0 WHERE id = ?").run(
    bcrypt.hashSync(senha, 10),
    req.user.id
  );
  audit(req.user.id, "trocar_senha", "profiles", req.user.id, {});
  const user = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.user.id);
  res.json({ usuario: publicProfile(user), token: sign(user) });
});

app.get("/api/config", auth, (req, res) => {
  const cfg = getConfig();
  if (req.user.role !== "admin") {
    return res.json({
      preco_tabela: cfg.preco_tabela,
      preco_minimo: cfg.preco_minimo,
      comissao_fixa: cfg.comissao_fixa,
      limite_reservas: cfg.limite_reservas,
      dias_para_liberar: cfg.dias_para_liberar,
    });
  }
  res.json(cfg);
});

app.put("/api/config", auth, requireRole("admin"), (req, res) => {
  const c = getConfig();
  const n = {
    preco_tabela: Number(req.body.preco_tabela ?? c.preco_tabela),
    preco_minimo: Number(req.body.preco_minimo ?? c.preco_minimo),
    comissao_fixa: Number(req.body.comissao_fixa ?? c.comissao_fixa),
    meta_vendas_mes: Number(req.body.meta_vendas_mes ?? c.meta_vendas_mes),
    meta_valor_mes: Number(req.body.meta_valor_mes ?? c.meta_valor_mes),
    limite_reservas: Number(req.body.limite_reservas ?? c.limite_reservas),
    dias_para_liberar: Number(req.body.dias_para_liberar ?? c.dias_para_liberar),
  };
  db.prepare(
    `UPDATE configuracoes SET preco_tabela=?, preco_minimo=?, comissao_fixa=?, meta_vendas_mes=?,
     meta_valor_mes=?, limite_reservas=?, dias_para_liberar=? WHERE id=1`
  ).run(n.preco_tabela, n.preco_minimo, n.comissao_fixa, n.meta_vendas_mes, n.meta_valor_mes, n.limite_reservas, n.dias_para_liberar);
  audit(req.user.id, "atualizar_config", "configuracoes", "1", n);
  res.json(getConfig());
});

app.get("/api/usuarios", auth, requireRole("admin"), (_req, res) => {
  const rows = db.prepare("SELECT * FROM profiles ORDER BY criado_em DESC").all().map(publicProfile);
  res.json(rows);
});

app.post("/api/usuarios", auth, requireRole("admin"), (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const senha = String(req.body.senha || "");
  const role = String(req.body.role || "");
  if (!nome || !email || senha.length < 6) {
    return res.status(400).json({ erro: "Informe nome, e-mail e senha provisória (mín. 6 caracteres)." });
  }
  if (!["vendedor", "desenvolvedor", "admin"].includes(role)) {
    return res.status(400).json({ erro: "Perfil inválido." });
  }
  const exists = db.prepare("SELECT id FROM profiles WHERE lower(email) = ?").get(email);
  if (exists) return res.status(409).json({ erro: "Já existe um usuário com este e-mail." });
  const id = uuid();
  db.prepare(
    `INSERT INTO profiles (id, nome, email, senha_hash, role, ativo, deve_trocar_senha, criado_em)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?)`
  ).run(id, nome, email, bcrypt.hashSync(senha, 10), role, now());
  audit(req.user.id, "criar_usuario", "profiles", id, { email, role });
  res.status(201).json(publicProfile(db.prepare("SELECT * FROM profiles WHERE id = ?").get(id)));
});

app.put("/api/usuarios/:id", auth, requireRole("admin"), (req, res) => {
  const u = db.prepare("SELECT * FROM profiles WHERE id = ?").get(req.params.id);
  if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
  const nome = String(req.body.nome ?? u.nome).trim();
  const email = String(req.body.email ?? u.email).trim().toLowerCase();
  const role = String(req.body.role ?? u.role);
  const ativo = req.body.ativo === undefined ? u.ativo : req.body.ativo ? 1 : 0;
  if (!["admin", "vendedor", "desenvolvedor"].includes(role)) {
    return res.status(400).json({ erro: "Perfil inválido." });
  }
  db.prepare("UPDATE profiles SET nome=?, email=?, role=?, ativo=? WHERE id=?").run(nome, email, role, ativo, u.id);
  if (req.body.senha) {
    const senha = String(req.body.senha);
    if (senha.length < 6) return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
    db.prepare("UPDATE profiles SET senha_hash=?, deve_trocar_senha=1 WHERE id=?").run(bcrypt.hashSync(senha, 10), u.id);
  }
  audit(req.user.id, "editar_usuario", "profiles", u.id, { nome, email, role, ativo });
  res.json(publicProfile(db.prepare("SELECT * FROM profiles WHERE id = ?").get(u.id)));
});

function normalizeHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");
}

app.post("/api/leads", auth, requireRole("admin", "desenvolvedor"), (req, res) => {
  const lista = Array.isArray(req.body.handles)
    ? req.body.handles
    : String(req.body.lista || req.body.instagram_handle || "")
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
  const nicho = String(req.body.nicho || "").trim();
  const cidade = String(req.body.cidade || "").trim();
  const criados = [];
  const ignorados = [];
  const ins = db.prepare(
    `INSERT INTO leads (id, instagram_handle, nicho, cidade, status, foto_capa, atualizado_em, criado_em)
     VALUES (?, ?, ?, ?, 'na_fila', ?, ?, ?)`
  );
  for (const raw of lista) {
    const handle = normalizeHandle(raw);
    if (!handle) continue;
    const dup = db.prepare("SELECT id FROM leads WHERE instagram_handle = ?").get(handle);
    if (dup) {
      ignorados.push(handle);
      continue;
    }
    const id = uuid();
    const t = now();
    ins.run(id, handle, nicho, cidade, `https://picsum.photos/seed/${handle}/640/360`, t, t);
    audit(req.user.id, "criar_lead", "leads", id, { handle });
    criados.push(handle);
  }
  broadcast("leads", { tipo: "fila" });
  res.status(201).json({ criados, ignorados });
});

app.get("/api/dev/fila", auth, requireRole("desenvolvedor"), (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM leads WHERE status = 'na_fila' ORDER BY criado_em ASC")
    .all()
    .map((l) => sanitizeLeadForRole(l, "desenvolvedor"));
  res.json(rows);
});

app.post("/api/dev/pegar/:id", auth, requireRole("desenvolvedor"), (req, res) => {
  const t = now();
  const r = db
    .prepare(
      `UPDATE leads SET status='em_producao', desenvolvedor_id=?, atualizado_em=?
       WHERE id=? AND status='na_fila'`
    )
    .run(req.user.id, t, req.params.id);
  if (r.changes === 0) {
    return res.status(409).json({ erro: "Essa demo já foi pega por outro desenvolvedor." });
  }
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  audit(req.user.id, "pegar_lead_dev", "leads", lead.id, { handle: lead.instagram_handle });
  broadcast("leads", { tipo: "dev_pegar", id: lead.id });
  res.json(sanitizeLeadForRole(lead, "desenvolvedor"));
});

app.get("/api/dev/andamento", auth, requireRole("desenvolvedor"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM leads WHERE desenvolvedor_id = ? AND status = 'em_producao' ORDER BY atualizado_em DESC")
    .all(req.user.id)
    .map((l) => sanitizeLeadForRole(l, "desenvolvedor"));
  res.json(rows);
});

app.post("/api/dev/pronta/:id", auth, requireRole("desenvolvedor"), (req, res) => {
  const link = String(req.body.link_demo || "").trim();
  if (!link) return res.status(400).json({ erro: "Cole o link da demo para marcar como pronta." });
  const t = now();
  const r = db
    .prepare(
      `UPDATE leads SET status='demo_pronta', link_demo=?, atualizado_em=?
       WHERE id=? AND desenvolvedor_id=? AND status='em_producao'`
    )
    .run(link, t, req.params.id, req.user.id);
  if (r.changes === 0) {
    return res.status(409).json({ erro: "Não foi possível marcar esta demo. Ela pode não ser sua." });
  }
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  audit(req.user.id, "demo_pronta", "leads", lead.id, { handle: lead.instagram_handle, link });
  broadcast("leads", { tipo: "demo_pronta", id: lead.id });
  res.json(sanitizeLeadForRole(lead, "desenvolvedor"));
});

app.get("/api/dev/ajustes", auth, requireRole("desenvolvedor"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, l.instagram_handle, l.link_demo
       FROM ajustes a JOIN leads l ON l.id = a.lead_id
       WHERE a.desenvolvedor_id = ? OR a.desenvolvedor_id IS NULL
       ORDER BY a.criado_em DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

app.post("/api/dev/ajustes/:id/pegar", auth, requireRole("desenvolvedor"), (req, res) => {
  const r = db
    .prepare(`UPDATE ajustes SET desenvolvedor_id=?, status='em_andamento' WHERE id=? AND (desenvolvedor_id IS NULL OR desenvolvedor_id=?)`)
    .run(req.user.id, req.params.id, req.user.id);
  if (r.changes === 0) return res.status(409).json({ erro: "Este ajuste já foi pego." });
  audit(req.user.id, "pegar_ajuste", "ajustes", req.params.id, {});
  res.json(db.prepare("SELECT * FROM ajustes WHERE id = ?").get(req.params.id));
});

app.post("/api/dev/ajustes/:id/concluir", auth, requireRole("desenvolvedor"), (req, res) => {
  const r = db
    .prepare(`UPDATE ajustes SET status='concluido' WHERE id=? AND desenvolvedor_id=?`)
    .run(req.params.id, req.user.id);
  if (r.changes === 0) return res.status(409).json({ erro: "Ajuste não encontrado." });
  audit(req.user.id, "concluir_ajuste", "ajustes", req.params.id, {});
  res.json(db.prepare("SELECT * FROM ajustes WHERE id = ?").get(req.params.id));
});

app.get("/api/dev/historico", auth, requireRole("desenvolvedor"), (req, res) => {
  const dia = db
    .prepare(
      `SELECT COUNT(*) as n FROM leads
       WHERE desenvolvedor_id=? AND status IN ('demo_pronta','reservada','contatado','negociando','fechado','perdido')
         AND date(atualizado_em) = date('now')`
    )
    .get(req.user.id).n;
  const semana = db
    .prepare(
      `SELECT COUNT(*) as n FROM leads
       WHERE desenvolvedor_id=? AND status IN ('demo_pronta','reservada','contatado','negociando','fechado','perdido')
         AND datetime(atualizado_em) >= datetime('now','-7 days')`
    )
    .get(req.user.id).n;
  const porDia = db
    .prepare(
      `SELECT date(atualizado_em) as dia, COUNT(*) as n FROM leads
       WHERE desenvolvedor_id=? AND status != 'em_producao' AND status != 'na_fila'
       GROUP BY date(atualizado_em) ORDER BY dia DESC LIMIT 14`
    )
    .all(req.user.id);
  res.json({ hoje: dia, semana, porDia });
});

app.get("/api/vendedor/disponiveis", auth, requireRole("vendedor"), (req, res) => {
  liberarReservasExpiradas();
  const cfg = getConfig();
  const abertas = db
    .prepare(
      `SELECT COUNT(*) as n FROM leads WHERE vendedor_id=? AND status IN ('reservada','contatado','negociando')`
    )
    .get(req.user.id).n;
  const rows = db
    .prepare("SELECT * FROM leads WHERE status='demo_pronta' ORDER BY atualizado_em DESC")
    .all()
    .map((l) => sanitizeLeadForRole(l, "vendedor"));
  res.json({
    leads: rows,
    reservas: abertas,
    limite: cfg.limite_reservas,
    podePegar: abertas < cfg.limite_reservas,
  });
});

app.post("/api/vendedor/pegar/:id", auth, requireRole("vendedor"), (req, res) => {
  liberarReservasExpiradas();
  const cfg = getConfig();
  const abertas = db
    .prepare(
      `SELECT COUNT(*) as n FROM leads WHERE vendedor_id=? AND status IN ('reservada','contatado','negociando')`
    )
    .get(req.user.id).n;
  if (abertas >= cfg.limite_reservas) {
    return res.status(409).json({
      erro: `Você atingiu o limite de ${cfg.limite_reservas} demos reservadas.`,
    });
  }
  const t = now();
  const r = db
    .prepare(
      `UPDATE leads SET status='reservada', vendedor_id=?, reservado_em=?, atualizado_em=?
       WHERE id=? AND status='demo_pronta'`
    )
    .run(req.user.id, t, t, req.params.id);
  if (r.changes === 0) {
    return res.status(409).json({ erro: "Essa demo já foi pega por outro vendedor." });
  }
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
  audit(req.user.id, "pegar_lead_vendedor", "leads", lead.id, { handle: lead.instagram_handle });
  broadcast("leads", { tipo: "vendedor_pegar", id: lead.id });
  res.json(lead);
});

app.get("/api/vendedor/minhas", auth, requireRole("vendedor"), (req, res) => {
  liberarReservasExpiradas();
  const rows = db
    .prepare(
      `SELECT * FROM leads WHERE vendedor_id=? AND status IN ('reservada','contatado','negociando')
       ORDER BY atualizado_em DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

app.put("/api/vendedor/leads/:id", auth, requireRole("vendedor"), (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id=? AND vendedor_id=?").get(req.params.id, req.user.id);
  if (!lead) return res.status(404).json({ erro: "Lead não encontrado." });
  if (["fechado", "perdido"].includes(lead.status)) {
    return res.status(409).json({ erro: "Este lead já foi encerrado." });
  }
  const status = req.body.status ? String(req.body.status) : lead.status;
  const permitidos = ["reservada", "contatado", "negociando", "perdido"];
  if (!permitidos.includes(status)) {
    return res.status(400).json({ erro: "Status inválido." });
  }
  const whatsapp = req.body.whatsapp !== undefined ? String(req.body.whatsapp || "").replace(/\D/g, "") : lead.whatsapp;
  const anotacoes = req.body.anotacoes !== undefined ? String(req.body.anotacoes || "") : lead.anotacoes;
  db.prepare("UPDATE leads SET status=?, whatsapp=?, anotacoes=?, atualizado_em=? WHERE id=?").run(
    status,
    whatsapp,
    anotacoes,
    now(),
    lead.id
  );
  audit(req.user.id, "atualizar_lead", "leads", lead.id, { status });
  res.json(db.prepare("SELECT * FROM leads WHERE id=?").get(lead.id));
});

app.post("/api/vendedor/fechar/:id", auth, requireRole("vendedor"), (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id=? AND vendedor_id=?").get(req.params.id, req.user.id);
  if (!lead) return res.status(404).json({ erro: "Lead não encontrado." });
  if (lead.status === "fechado") return res.status(409).json({ erro: "Esta venda já foi fechada." });
  const valor = Number(req.body.valor);
  const forma = String(req.body.forma_pagamento || "").trim();
  const plano = String(req.body.plano_renovacao || "");
  if (!valor || !forma || !["semestral", "anual"].includes(plano)) {
    return res.status(400).json({ erro: "Informe valor, forma de pagamento e plano de renovação." });
  }
  const cfg = getConfig();
  if (valor < cfg.preco_minimo) {
    return res.status(400).json({
      erro: `O valor mínimo permitido é R$ ${cfg.preco_minimo.toFixed(2).replace(".", ",")}.`,
    });
  }
  const meses = 6;
  const t = now();
  const venc = addMonths(t, meses);
  const vendaId = uuid();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO vendas (id, lead_id, vendedor_id, valor, forma_pagamento, plano_renovacao, comissao, comissao_paga, status, data_venda, vencimento_renovacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'confirmada', ?, ?)`
    ).run(vendaId, lead.id, req.user.id, valor, forma, plano, cfg.comissao_fixa, t, venc);
    db.prepare("UPDATE leads SET status='fechado', atualizado_em=? WHERE id=?").run(t, lead.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  audit(req.user.id, "fechar_venda", "vendas", vendaId, {
    handle: lead.instagram_handle,
    valor,
    comissao: cfg.comissao_fixa,
  });
  broadcast("vendas", { tipo: "fechada", id: vendaId });
  res.status(201).json(db.prepare("SELECT * FROM vendas WHERE id=?").get(vendaId));
});

app.get("/api/vendedor/vendas", auth, requireRole("vendedor"), (req, res) => {
  const vendas = db
    .prepare(
      `SELECT v.*, l.instagram_handle, l.link_demo
       FROM vendas v JOIN leads l ON l.id = v.lead_id
       WHERE v.vendedor_id=? ORDER BY v.data_venda DESC`
    )
    .all(req.user.id);
  const total = vendas.filter((v) => v.status !== "estornada").reduce((s, v) => s + v.valor, 0);
  const aReceber = vendas.filter((v) => v.status === "confirmada" && !v.comissao_paga).reduce((s, v) => s + v.comissao, 0);
  const paga = vendas.filter((v) => v.comissao_paga && v.status !== "estornada").reduce((s, v) => s + v.comissao, 0);
  res.json({ vendas, total, comissao_receber: aReceber, comissao_paga: paga });
});

function periodoWhere(periodo) {
  if (periodo === "dia") return "date(data_venda) = date('now')";
  if (periodo === "semana") return "datetime(data_venda) >= datetime('now','-7 days')";
  if (periodo === "mes") return "strftime('%Y-%m', data_venda) = strftime('%Y-%m','now')";
  return "1=1";
}

app.get("/api/admin/dashboard", auth, requireRole("admin"), (_req, res) => {
  const cfg = getConfig();
  const soma = (filtro) =>
    db.prepare(`SELECT COALESCE(SUM(valor),0) as t, COUNT(*) as n FROM vendas WHERE status != 'estornada' AND ${filtro}`).get();
  const dia = soma(periodoWhere("dia"));
  const semana = soma(periodoWhere("semana"));
  const mes = soma(periodoWhere("mes"));
  const total = soma("1=1");
  const ticket = total.n ? total.t / total.n : 0;
  const comissoes = db
    .prepare(
      `SELECT COALESCE(SUM(comissao),0) as t FROM vendas WHERE status='confirmada' AND comissao_paga=0`
    )
    .get().t;
  const liquida = total.t - db.prepare(`SELECT COALESCE(SUM(comissao),0) as t FROM vendas WHERE status != 'estornada'`).get().t;
  const rankingVend = db
    .prepare(
      `SELECT p.nome, COUNT(v.id) as qtd, COALESCE(SUM(v.valor),0) as total
       FROM profiles p LEFT JOIN vendas v ON v.vendedor_id=p.id AND v.status!='estornada'
       WHERE p.role='vendedor' GROUP BY p.id ORDER BY total DESC`
    )
    .all();
  const rankingDev = db
    .prepare(
      `SELECT p.nome, COUNT(l.id) as demos
       FROM profiles p LEFT JOIN leads l ON l.desenvolvedor_id=p.id AND l.status != 'na_fila' AND l.status != 'em_producao'
       WHERE p.role='desenvolvedor' GROUP BY p.id ORDER BY demos DESC`
    )
    .all();
  const porDia = db
    .prepare(
      `SELECT date(data_venda) as dia, COALESCE(SUM(valor),0) as total, COUNT(*) as qtd
       FROM vendas WHERE status!='estornada' AND datetime(data_venda) >= datetime('now','-14 days')
       GROUP BY date(data_venda) ORDER BY dia ASC`
    )
    .all();
  res.json({
    dia,
    semana,
    mes,
    total,
    ticket,
    comissoes_pagar: comissoes,
    receita_liquida: liquida,
    meta_qtd: cfg.meta_vendas_mes,
    meta_valor: cfg.meta_valor_mes,
    faltam_qtd: Math.max(0, cfg.meta_vendas_mes - mes.n),
    faltam_valor: Math.max(0, cfg.meta_valor_mes - mes.t),
    rankingVend,
    rankingDev,
    porDia,
  });
});

app.get("/api/admin/vendas", auth, requireRole("admin"), (req, res) => {
  const { de, ate, vendedor_id, status } = req.query;
  let sql = `SELECT v.*, l.instagram_handle, l.link_demo, p.nome as vendedor_nome
             FROM vendas v JOIN leads l ON l.id=v.lead_id JOIN profiles p ON p.id=v.vendedor_id WHERE 1=1`;
  const args = [];
  if (de) {
    sql += " AND date(v.data_venda) >= date(?)";
    args.push(de);
  }
  if (ate) {
    sql += " AND date(v.data_venda) <= date(?)";
    args.push(ate);
  }
  if (vendedor_id) {
    sql += " AND v.vendedor_id = ?";
    args.push(vendedor_id);
  }
  if (status) {
    sql += " AND v.status = ?";
    args.push(status);
  }
  sql += " ORDER BY v.data_venda DESC";
  res.json(db.prepare(sql).all(...args));
});

app.post("/api/admin/vendas/:id/contestar", auth, requireRole("admin"), (req, res) => {
  const v = db.prepare("SELECT * FROM vendas WHERE id=?").get(req.params.id);
  if (!v) return res.status(404).json({ erro: "Venda não encontrada." });
  db.prepare("UPDATE vendas SET status='em_analise' WHERE id=?").run(v.id);
  audit(req.user.id, "contestar_venda", "vendas", v.id, {});
  res.json(db.prepare("SELECT * FROM vendas WHERE id=?").get(v.id));
});

app.post("/api/admin/vendas/:id/estornar", auth, requireRole("admin"), (req, res) => {
  const motivo = String(req.body.motivo || "").trim();
  if (!motivo) return res.status(400).json({ erro: "Informe o motivo do estorno." });
  const v = db.prepare("SELECT * FROM vendas WHERE id=?").get(req.params.id);
  if (!v) return res.status(404).json({ erro: "Venda não encontrada." });
  db.prepare("UPDATE vendas SET status='estornada', motivo_estorno=? WHERE id=?").run(motivo, v.id);
  audit(req.user.id, "estornar_venda", "vendas", v.id, { motivo });
  res.json(db.prepare("SELECT * FROM vendas WHERE id=?").get(v.id));
});

app.get("/api/admin/comissoes", auth, requireRole("admin"), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id as vendedor_id, p.nome,
        COALESCE(SUM(CASE WHEN v.status='confirmada' AND v.comissao_paga=0 THEN v.comissao ELSE 0 END),0) as pendente,
        COALESCE(SUM(CASE WHEN v.comissao_paga=1 AND v.status!='estornada' THEN v.comissao ELSE 0 END),0) as pago
       FROM profiles p LEFT JOIN vendas v ON v.vendedor_id=p.id
       WHERE p.role='vendedor' GROUP BY p.id ORDER BY p.nome`
    )
    .all();
  res.json(rows);
});

app.post("/api/admin/comissoes/:vendedorId/pagar", auth, requireRole("admin"), (req, res) => {
  db.prepare(
    `UPDATE vendas SET comissao_paga=1 WHERE vendedor_id=? AND status='confirmada' AND comissao_paga=0`
  ).run(req.params.vendedorId);
  audit(req.user.id, "pagar_comissao", "vendas", req.params.vendedorId, {});
  res.json({ ok: true });
});

app.get("/api/admin/renovacoes", auth, requireRole("admin"), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT v.*, l.instagram_handle, l.link_demo, p.nome as vendedor_nome
       FROM vendas v JOIN leads l ON l.id=v.lead_id JOIN profiles p ON p.id=v.vendedor_id
       WHERE v.status!='estornada' ORDER BY v.vencimento_renovacao ASC`
    )
    .all()
    .map((v) => ({ ...v, renovacao: statusRenovacao(v.vencimento_renovacao) }))
    .filter((v) => v.renovacao.label !== "ok");
  res.json(rows);
});

app.get("/api/admin/auditoria", auth, requireRole("admin"), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, p.nome as usuario_nome, p.email as usuario_email
       FROM auditoria a LEFT JOIN profiles p ON p.id=a.usuario_id
       ORDER BY a.criado_em DESC LIMIT 300`
    )
    .all();
  res.json(rows);
});

app.post("/api/admin/ajustes", auth, requireRole("admin"), (req, res) => {
  const lead_id = String(req.body.lead_id || "");
  const descricao = String(req.body.descricao || "").trim();
  const lead = db.prepare("SELECT * FROM leads WHERE id=?").get(lead_id);
  if (!lead) return res.status(404).json({ erro: "Lead não encontrado." });
  if (!descricao) return res.status(400).json({ erro: "Descreva o ajuste." });
  const id = uuid();
  db.prepare(
    `INSERT INTO ajustes (id, lead_id, descricao, status, desenvolvedor_id, criado_em) VALUES (?, ?, ?, 'pendente', ?, ?)`
  ).run(id, lead_id, descricao, lead.desenvolvedor_id || null, now());
  audit(req.user.id, "criar_ajuste", "ajustes", id, { lead_id });
  res.status(201).json(db.prepare("SELECT * FROM ajustes WHERE id=?").get(id));
});

app.post("/api/admin/lgpd/:id", auth, requireRole("admin"), (req, res) => {
  const lead = db.prepare("SELECT * FROM leads WHERE id=?").get(req.params.id);
  if (!lead) return res.status(404).json({ erro: "Lead não encontrado." });
  db.prepare("UPDATE leads SET whatsapp=NULL, anotacoes=NULL, atualizado_em=? WHERE id=?").run(now(), lead.id);
  audit(req.user.id, "lgpd_apagar", "leads", lead.id, { handle: lead.instagram_handle });
  res.json({ ok: true });
});

app.get("/api/admin/export/vendas.csv", auth, requireRole("admin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT v.data_venda, p.nome as vendedor, l.instagram_handle, l.link_demo, v.valor, v.comissao, v.status, v.plano_renovacao, v.forma_pagamento
       FROM vendas v JOIN leads l ON l.id=v.lead_id JOIN profiles p ON p.id=v.vendedor_id ORDER BY v.data_venda DESC`
    )
    .all();
  const header = "data,vendedor,instagram,link,valor,comissao,status,plano,pagamento";
  const body = rows
    .map((r) =>
      [r.data_venda, r.vendedor, r.instagram_handle, r.link_demo, r.valor, r.comissao, r.status, r.plano_renovacao, r.forma_pagamento]
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=vendas.csv");
  res.send("\uFEFF" + header + "\n" + body);
});

app.get("/api/admin/export/comissoes.csv", auth, requireRole("admin"), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.nome,
        COALESCE(SUM(CASE WHEN v.status='confirmada' AND v.comissao_paga=0 THEN v.comissao ELSE 0 END),0) as pendente,
        COALESCE(SUM(CASE WHEN v.comissao_paga=1 AND v.status!='estornada' THEN v.comissao ELSE 0 END),0) as pago
       FROM profiles p LEFT JOIN vendas v ON v.vendedor_id=p.id
       WHERE p.role='vendedor' GROUP BY p.id`
    )
    .all();
  const header = "vendedor,pendente,pago";
  const body = rows.map((r) => `"${r.nome}",${r.pendente},${r.pago}`).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=comissoes.csv");
  res.send("\uFEFF" + header + "\n" + body);
});

app.get("/api/admin/leads", auth, requireRole("admin"), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT l.id, l.instagram_handle, l.nicho, l.cidade, l.status, l.link_demo, l.desenvolvedor_id, l.vendedor_id,
              d.nome as desenvolvedor_nome, v.nome as vendedor_nome, l.atualizado_em
       FROM leads l
       LEFT JOIN profiles d ON d.id=l.desenvolvedor_id
       LEFT JOIN profiles v ON v.id=l.vendedor_id
       ORDER BY l.atualizado_em DESC`
    )
    .all();
  res.json(rows);
});

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.method !== "GET") return next();
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

if (require.main === module) {
  setInterval(() => {
    try {
      const n = liberarReservasExpiradas();
      if (n) broadcast("leads", { tipo: "liberacao", n });
    } catch {
      /* ignore */
    }
  }, 60 * 1000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WebWin em http://localhost:${PORT}`);
  });
}

module.exports = app;
