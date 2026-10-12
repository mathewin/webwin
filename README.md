# WebWin

Sistema interno para vender sites a partir do @ do Instagram, com três áreas: admin, vendedor e desenvolvedor.

Interface em português do Brasil, pensada primeiro para celular, visual escuro. Sem cadastro público: só o admin cria contas.

Domínio de produção: `webw1n.shop`

## Primeiro acesso

Na primeira subida o sistema cria **somente** o admin, com fila, vendas e usuários vazios.

Defina as variáveis abaixo antes de iniciar (senão uma senha provisória aleatória é impressa no log):

```bash
export WEBWIN_ADMIN_EMAIL=admin@webw1n.shop
export WEBWIN_ADMIN_PASSWORD=sua-senha-forte
export WEBWIN_JWT_SECRET=uma-chave-longa-e-aleatoria
```

No primeiro login o admin troca a senha provisória. Depois crie vendedores e desenvolvedores em Usuários.

## Desenvolvimento local

```bash
cd backend
npm install

cd ../frontend
npm install
```

```bash
bash start.sh
```

Front em `http://localhost:5173`. API em `http://localhost:3001`. O Vite encaminha `/api` para o backend.

## Produção (um único processo)

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
export PORT=3001
export FRONTEND_DIST="$(pwd)/../frontend/dist"
export WEBWIN_ADMIN_EMAIL=admin@webw1n.shop
export WEBWIN_ADMIN_PASSWORD=sua-senha-forte
export WEBWIN_JWT_SECRET=uma-chave-longa-e-aleatoria
node --experimental-sqlite src/server.js
```

Ou com Docker:

```bash
docker build -t webwin .
docker run -d --name webwin -p 80:3001 \
  -e WEBWIN_ADMIN_EMAIL=admin@webw1n.shop \
  -e WEBWIN_ADMIN_PASSWORD=sua-senha-forte \
  -e WEBWIN_JWT_SECRET=uma-chave-longa-e-aleatoria \
  -v webwin-data:/app/backend/data \
  webwin
```

## Apontar webw1n.shop

O domínio está na Hostinger. Aponte o DNS para o servidor onde o container/processo estiver rodando:

- Tipo A, nome `@`, valor = IP do servidor
- Tipo A, nome `www`, valor = o mesmo IP

No painel da Hostinger, use o IP público da máquina (VPS ou hospedagem Node). A aplicação escuta a porta 3001 internamente; na frente coloque HTTPS (Caddy, Nginx ou o proxy da Hostinger) para `webw1n.shop`.

## Perfis

- Admin: dashboard, vendas, comissões, renovações, usuários, configurações, auditoria e exportação CSV.
- Vendedor: demos disponíveis, minhas demos, fechar venda (piso configurável) e comissões.
- Desenvolvedor: fila de @, pegar, colar link da demo, ajustes e histórico. Sem financeiro.

## Banco e segurança

Schema Postgres + RLS para Supabase em `supabase/schema.sql`.

A API usa SQLite com as mesmas regras: trava de posse, piso de preço, limite de reservas, liberação automática, comissão gravada no fechamento, auditoria e LGPD.

## Testes

```bash
cd backend
npm test
```
