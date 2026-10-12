# WebWin

Sistema interno para vender sites a partir do @ do Instagram. Tres areas: admin, vendedor e desenvolvedor.

Site estatico no GitHub Pages. Banco e login no Supabase (projeto `webwin`). Sem servidor proprio.

Dominio: `webw1n.shop`

O plano gratuito do Supabase pausa o projeto apos 7 dias sem uso. Entre no painel e reative se isso acontecer.

## Subir do zero

### 1. Schema

No SQL Editor do projeto `webwin`, cole e execute `supabase/schema.sql` inteiro.

Isso cria tabelas, RLS, GRANTs por coluna e funcoes. Admin nao consegue ler `whatsapp` nem `anotacoes` (so o vendedor dono, via view `leads_contato`).

### 2. Edge Function

Publique `supabase/functions/criar-usuario` no mesmo projeto. A function usa `SUPABASE_SERVICE_ROLE_KEY` do ambiente da function — nao cole essa chave no codigo nem no repo.

```bash
npx supabase functions deploy criar-usuario --project-ref akvdxadykerwjdlqtyeg
```

### 3. config.js

Abra `config.js` e troque `COLE_AQUI_A_ANON_KEY` pela **anon key** (nao a service_role).

A URL ja aponta para `https://akvdxadykerwjdlqtyeg.supabase.co`.

### 4. Primeiro admin

No SQL Editor, abra `supabase/primeiro-admin.sql`, troque `COLE_A_SENHA_AQUI` e execute uma vez. Depois apague a senha da sua maquina.

E-mail: `admin@webw1n.shop`. No primeiro login o admin troca a senha.

### 5. GitHub Pages

No repositorio `mathewin/webwin`:

1. Settings → Pages → Source: Deploy from a branch
2. Branch `master`, pasta `/ (root)`
3. Custom domain: `webw1n.shop`
4. Marque Enforce HTTPS quando o certificado ficar pronto

O arquivo `CNAME` ja contem `webw1n.shop`.

### 6. DNS (Hostinger)

Troque os registros A do apex pelos IPs oficiais do GitHub Pages (veja a documentacao atual do GitHub: Pages → Custom domain). Nao use o IP de parking da Hostinger.

- `A` `@` → IPs do GitHub Pages
- `CNAME` `www` → `mathewin.github.io` (ou o que o GitHub mostrar)

Adicione o dominio no repositorio **antes** de apontar o DNS.

## Perfis

- Admin: dashboard, vendas, comissoes, renovacoes, usuarios, configuracoes, auditoria e CSV. Sem WhatsApp e sem anotacoes.
- Vendedor: demos disponiveis, minhas demos, fechar venda (piso) e comissoes.
- Desenvolvedor: fila de @, pegar, colar link da demo, ajustes e historico. Sem financeiro.

Plano semestral: vence em 6 meses. Plano anual: 6 meses incluidos + 12 de renovacao (18 meses no total).

## Checklist

- Login admin, vendedor e desenvolvedor
- Troca de senha no primeiro acesso
- Admin cria usuario
- Fila vazia no inicio; dev adiciona @
- Vendedor pega demo; outro vendedor nao pega a mesma
- Valor abaixo do piso e recusado
- Admin nao ve WhatsApp nem anotacoes
- Acesso cruzado (vendedor no painel admin) e recusado
