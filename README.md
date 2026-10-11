# WebWin

Sistema web para vender sites a partir do @ do Instagram, com três áreas: admin, vendedor e desenvolvedor.

Interface em português do Brasil, pensada primeiro para celular, visual escuro.

## Como rodar

```bash
# Instalar dependências do backend
cd backend
npm install

# Instalar dependências do frontend
cd ../frontend
npm install
```

```bash
# Subir API e front
bash start.sh
```

Front em `http://localhost:5173`. API em `http://localhost:3001`. O Vite encaminha `/api` para o backend.

## Contas de teste

Senha de todos: `webwin123`

- Admin: `xena.w@example.org`
- Vendedores: `iris.p@example.org`, `paula.r@example.org`
- Desenvolvedores: `nina.v@example.com`, `oscar.d@example.net`

Vendedor e desenvolvedor trocam a senha provisória no primeiro login. O admin de teste já entra direto.

## Perfis

- Admin: dashboard, vendas, comissões, renovações, usuários, configurações, auditoria e exportação CSV.
- Vendedor: demos disponíveis, minhas demos, fechar venda (piso R$ 150) e comissões.
- Desenvolvedor: fila de @, pegar, colar link da demo, ajustes e histórico. Sem financeiro.

## Banco e segurança

Schema Postgres + RLS para Supabase em `supabase/schema.sql`.

Neste ambiente a API usa SQLite com as mesmas regras: trava de posse, piso de preço, limite de reservas, liberação automática, comissão gravada no fechamento, auditoria e LGPD.

## Testes

```bash
cd backend
npm test
```
