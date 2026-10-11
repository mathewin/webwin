const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "webwin.db");

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','vendedor','desenvolvedor')),
      ativo INTEGER NOT NULL DEFAULT 1,
      deve_trocar_senha INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      instagram_handle TEXT UNIQUE NOT NULL,
      nicho TEXT,
      cidade TEXT,
      whatsapp TEXT,
      status TEXT NOT NULL DEFAULT 'na_fila',
      desenvolvedor_id TEXT REFERENCES profiles(id),
      vendedor_id TEXT REFERENCES profiles(id),
      link_demo TEXT,
      foto_capa TEXT,
      reservado_em TEXT,
      atualizado_em TEXT NOT NULL,
      anotacoes TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      vendedor_id TEXT NOT NULL REFERENCES profiles(id),
      valor REAL NOT NULL,
      forma_pagamento TEXT,
      plano_renovacao TEXT NOT NULL CHECK (plano_renovacao IN ('semestral','anual')),
      comissao REAL NOT NULL,
      comissao_paga INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmada' CHECK (status IN ('confirmada','em_analise','estornada')),
      data_venda TEXT NOT NULL,
      vencimento_renovacao TEXT NOT NULL,
      motivo_estorno TEXT
    );

    CREATE TABLE IF NOT EXISTS ajustes (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id),
      descricao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      desenvolvedor_id TEXT REFERENCES profiles(id),
      criado_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      preco_tabela REAL NOT NULL DEFAULT 400,
      preco_minimo REAL NOT NULL DEFAULT 150,
      comissao_fixa REAL NOT NULL DEFAULT 40,
      meta_vendas_mes INTEGER NOT NULL DEFAULT 20,
      meta_valor_mes REAL NOT NULL DEFAULT 8000,
      limite_reservas INTEGER NOT NULL DEFAULT 20,
      dias_para_liberar INTEGER NOT NULL DEFAULT 7
    );

    CREATE TABLE IF NOT EXISTS auditoria (
      id TEXT PRIMARY KEY,
      usuario_id TEXT REFERENCES profiles(id),
      acao TEXT NOT NULL,
      tabela TEXT,
      registro_id TEXT,
      detalhes TEXT,
      criado_em TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_dev ON leads(desenvolvedor_id);
    CREATE INDEX IF NOT EXISTS idx_leads_vend ON leads(vendedor_id);
    CREATE INDEX IF NOT EXISTS idx_vendas_vend ON vendas(vendedor_id);
  `);

  const cfg = db.prepare("SELECT id FROM configuracoes WHERE id = 1").get();
  if (!cfg) {
    db.prepare(
      `INSERT INTO configuracoes (id, preco_tabela, preco_minimo, comissao_fixa, meta_vendas_mes, meta_valor_mes, limite_reservas, dias_para_liberar)
       VALUES (1, 400, 150, 40, 20, 8000, 20, 7)`
    ).run();
  }
}

function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) as n FROM profiles").get().n;
  if (count > 0) return;

  const senha = bcrypt.hashSync("webwin123", 10);
  const t = now();

  const adminId = uuid();
  const v1 = uuid();
  const v2 = uuid();
  const d1 = uuid();
  const d2 = uuid();

  const insP = db.prepare(
    `INSERT INTO profiles (id, nome, email, senha_hash, role, ativo, deve_trocar_senha, criado_em)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  );

  insP.run(adminId, "Admin WebWin", "xena.w@example.org", senha, "admin", 0, t);
  insP.run(v1, "Carla Vendas", "iris.p@example.org", senha, "vendedor", 1, t);
  insP.run(v2, "Bruno Vendas", "paula.r@example.org", senha, "vendedor", 1, t);
  insP.run(d1, "Ana Dev", "nina.v@example.com", senha, "desenvolvedor", 1, t);
  insP.run(d2, "Diego Dev", "oscar.d@example.net", senha, "desenvolvedor", 1, t);

  const leads = [
    ["manicure.luna", "Manicure", "São Paulo", "na_fila", null, null, null],
    ["salao.bella", "Salão de beleza", "Rio de Janeiro", "na_fila", null, null, null],
    ["barbearia.rei", "Barbearia", "Belo Horizonte", "na_fila", null, null, null],
    ["oficina.turbo", "Oficina mecânica", "Curitiba", "na_fila", null, null, null],
    ["nails.pri", "Manicure", "Campinas", "em_producao", d1, null, null],
    ["studio.corte", "Barbearia", "Porto Alegre", "demo_pronta", d1, null, "https://demo.webwin.test/studio-corte"],
    ["estetica.sol", "Estética", "Salvador", "demo_pronta", d2, null, "https://demo.webwin.test/estetica-sol"],
    ["pet.banho", "Pet shop", "Fortaleza", "demo_pronta", d2, null, "https://demo.webwin.test/pet-banho"],
    ["lanchonete.bom", "Alimentação", "Recife", "demo_pronta", d1, null, "https://demo.webwin.test/lanchonete-bom"],
    ["pilates.vida", "Estúdio de pilates", "Brasília", "na_fila", null, null, null],
  ];

  const insL = db.prepare(
    `INSERT INTO leads (id, instagram_handle, nicho, cidade, status, desenvolvedor_id, vendedor_id, link_demo, foto_capa, atualizado_em, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [handle, nicho, cidade, status, devId, vendId, link] of leads) {
    insL.run(uuid(), handle, nicho, cidade, status, devId, vendId, link, `https://picsum.photos/seed/${handle}/640/360`, t, t);
  }

  audit(adminId, "seed", "profiles", adminId, { msg: "Base inicial criada" });
}

function audit(usuarioId, acao, tabela, registroId, detalhes) {
  db.prepare(
    `INSERT INTO auditoria (id, usuario_id, acao, tabela, registro_id, detalhes, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), usuarioId || null, acao, tabela || null, registroId || null, JSON.stringify(detalhes || {}), now());
}

function getConfig() {
  return db.prepare("SELECT * FROM configuracoes WHERE id = 1").get();
}

function liberarReservasExpiradas() {
  const cfg = getConfig();
  const limiteMs = (cfg.dias_para_liberar || 7) * 24 * 60 * 60 * 1000;
  const corte = new Date(Date.now() - limiteMs).toISOString();
  const rows = db
    .prepare(
      `SELECT id, instagram_handle, vendedor_id, atualizado_em FROM leads
       WHERE status IN ('reservada','contatado','negociando')
         AND atualizado_em < ?`
    )
    .all(corte);
  const upd = db.prepare(
    `UPDATE leads SET status = 'demo_pronta', vendedor_id = NULL, reservado_em = NULL,
     atualizado_em = ?, anotacoes = COALESCE(anotacoes,'') WHERE id = ?`
  );
  for (const r of rows) {
    upd.run(now(), r.id);
    audit(null, "liberacao_automatica", "leads", r.id, {
      handle: r.instagram_handle,
      vendedor_id: r.vendedor_id,
    });
  }
  return rows.length;
}

function sanitizeLeadForRole(lead, role) {
  if (!lead) return lead;
  const base = { ...lead };
  if (role === "admin") {
    delete base.whatsapp;
    delete base.anotacoes;
  }
  if (role === "desenvolvedor") {
    delete base.whatsapp;
  }
  return base;
}

initSchema();
seedIfEmpty();

module.exports = {
  db,
  uuid,
  now,
  audit,
  getConfig,
  liberarReservasExpiradas,
  sanitizeLeadForRole,
  bcrypt,
};
