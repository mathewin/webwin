-- WebWin - Schema Postgres + RLS (Supabase)
-- Equivalente operacional implementado no backend SQLite com as mesmas regras.

create extension if not exists "pgcrypto";

create type role_tipo as enum ('admin', 'vendedor', 'desenvolvedor');
create type lead_status as enum (
  'na_fila', 'em_producao', 'demo_pronta', 'reservada',
  'contatado', 'negociando', 'fechado', 'perdido'
);
create type venda_status as enum ('confirmada', 'em_analise', 'estornada');
create type plano_tipo as enum ('semestral', 'anual');
create type ajuste_status as enum ('pendente', 'em_andamento', 'concluido');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique not null,
  role role_tipo not null,
  ativo boolean not null default true,
  deve_trocar_senha boolean not null default true,
  criado_em timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  instagram_handle text unique not null,
  nicho text,
  cidade text,
  whatsapp text,
  status lead_status not null default 'na_fila',
  desenvolvedor_id uuid references profiles(id),
  vendedor_id uuid references profiles(id),
  link_demo text,
  foto_capa text,
  reservado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  anotacoes text,
  criado_em timestamptz not null default now()
);

create table vendas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  vendedor_id uuid not null references profiles(id),
  valor numeric(12,2) not null,
  forma_pagamento text,
  plano_renovacao plano_tipo not null,
  comissao numeric(12,2) not null,
  comissao_paga boolean not null default false,
  status venda_status not null default 'confirmada',
  data_venda timestamptz not null default now(),
  vencimento_renovacao date not null,
  motivo_estorno text
);

create table ajustes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  descricao text not null,
  status ajuste_status not null default 'pendente',
  desenvolvedor_id uuid references profiles(id),
  criado_em timestamptz not null default now()
);

create table configuracoes (
  id int primary key default 1,
  preco_tabela numeric(12,2) not null default 400,
  preco_minimo numeric(12,2) not null default 150,
  comissao_fixa numeric(12,2) not null default 40,
  meta_vendas_mes int not null default 20,
  meta_valor_mes numeric(12,2) not null default 8000,
  limite_reservas int not null default 20,
  dias_para_liberar int not null default 7,
  constraint unica_config check (id = 1)
);

create table auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references profiles(id),
  acao text not null,
  tabela text,
  registro_id text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

alter table profiles enable row level security;
alter table leads enable row level security;
alter table vendas enable row level security;
alter table ajustes enable row level security;
alter table configuracoes enable row level security;
alter table auditoria enable row level security;

create or replace function public.meu_perfil()
returns profiles language sql stable security definer as $$
  select * from profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and ativo)
$$;

-- Profiles
create policy profiles_self on profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- Leads
create policy leads_admin on leads for all
  using (public.is_admin()) with check (public.is_admin());

create policy leads_dev_select on leads for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'desenvolvedor' and p.ativo)
    and (status = 'na_fila' or desenvolvedor_id = auth.uid())
  );

create policy leads_dev_update on leads for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'desenvolvedor' and p.ativo)
    and (status = 'na_fila' or desenvolvedor_id = auth.uid())
  );

create policy leads_dev_insert on leads for insert
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'desenvolvedor' and p.ativo)
  );

create policy leads_vendedor_select on leads for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor' and p.ativo)
    and (status = 'demo_pronta' or vendedor_id = auth.uid())
  );

create policy leads_vendedor_update on leads for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor' and p.ativo)
    and (status = 'demo_pronta' or vendedor_id = auth.uid())
  );

-- Vendas
create policy vendas_admin on vendas for all
  using (public.is_admin()) with check (public.is_admin());

create policy vendas_vendedor_select on vendas for select
  using (vendedor_id = auth.uid());

create policy vendas_vendedor_insert on vendas for insert
  with check (vendedor_id = auth.uid());

-- Ajustes
create policy ajustes_admin on ajustes for all
  using (public.is_admin()) with check (public.is_admin());

create policy ajustes_dev on ajustes for select
  using (desenvolvedor_id = auth.uid() or desenvolvedor_id is null);

create policy ajustes_dev_update on ajustes for update
  using (desenvolvedor_id = auth.uid() or desenvolvedor_id is null);

-- Config: somente admin
create policy config_admin on configuracoes for all
  using (public.is_admin()) with check (public.is_admin());

-- Auditoria: somente admin
create policy auditoria_admin on auditoria for select
  using (public.is_admin());

-- Piso de preço no banco
create or replace function valida_piso_venda()
returns trigger language plpgsql as $$
declare minimo numeric;
begin
  select preco_minimo into minimo from configuracoes where id = 1;
  if new.valor < minimo then
    raise exception 'Valor abaixo do piso configurado (R$ %)', minimo;
  end if;
  return new;
end;
$$;

create trigger trg_piso before insert on vendas
  for each row execute function valida_piso_venda();

-- Trava de posse: update condicional
create or replace function pegar_lead_dev(p_lead_id uuid, p_dev uuid)
returns leads language plpgsql as $$
declare r leads;
begin
  update leads set
    status = 'em_producao',
    desenvolvedor_id = p_dev,
    atualizado_em = now()
  where id = p_lead_id and status = 'na_fila'
  returning * into r;
  if r.id is null then
    raise exception 'Essa demo já foi pega por outro desenvolvedor';
  end if;
  return r;
end;
$$;

create or replace function pegar_lead_vendedor(p_lead_id uuid, p_vend uuid)
returns leads language plpgsql as $$
declare r leads;
declare limite int;
declare abertas int;
begin
  select limite_reservas into limite from configuracoes where id = 1;
  select count(*) into abertas from leads
    where vendedor_id = p_vend
      and status in ('reservada', 'contatado', 'negociando');
  if abertas >= limite then
    raise exception 'Você atingiu o limite de demos reservadas';
  end if;
  update leads set
    status = 'reservada',
    vendedor_id = p_vend,
    reservado_em = now(),
    atualizado_em = now()
  where id = p_lead_id and status = 'demo_pronta'
  returning * into r;
  if r.id is null then
    raise exception 'Essa demo já foi pega por outro vendedor';
  end if;
  return r;
end;
$$;
