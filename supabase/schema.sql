-- WebWin — schema, RLS, GRANTs e funções
-- Cole este arquivo inteiro no SQL Editor do projeto "webwin" e execute.

create extension if not exists pgcrypto;

do $$ begin
  create type public.role_tipo as enum ('admin', 'vendedor', 'desenvolvedor');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_status as enum (
    'na_fila', 'em_producao', 'demo_pronta', 'reservada',
    'contatado', 'negociando', 'fechado', 'perdido'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.venda_status as enum ('confirmada', 'em_analise', 'estornada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.plano_tipo as enum ('semestral', 'anual');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ajuste_status as enum ('pendente', 'em_andamento', 'concluido');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text unique not null,
  role public.role_tipo not null,
  ativo boolean not null default true,
  deve_trocar_senha boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  instagram_handle text unique not null,
  nicho text,
  cidade text,
  whatsapp text,
  status public.lead_status not null default 'na_fila',
  desenvolvedor_id uuid references public.profiles (id),
  vendedor_id uuid references public.profiles (id),
  link_demo text,
  foto_capa text,
  reservado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  anotacoes text,
  criado_em timestamptz not null default now()
);

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  vendedor_id uuid not null references public.profiles (id),
  valor numeric(12, 2) not null,
  forma_pagamento text,
  plano_renovacao public.plano_tipo not null,
  comissao numeric(12, 2) not null,
  comissao_paga boolean not null default false,
  status public.venda_status not null default 'confirmada',
  data_venda timestamptz not null default now(),
  vencimento_renovacao date not null,
  motivo_estorno text
);

create table if not exists public.ajustes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  descricao text not null,
  status public.ajuste_status not null default 'pendente',
  desenvolvedor_id uuid references public.profiles (id),
  criado_em timestamptz not null default now()
);

create table if not exists public.configuracoes (
  id int primary key default 1 check (id = 1),
  preco_tabela numeric(12, 2) not null default 400,
  preco_minimo numeric(12, 2) not null default 150,
  comissao_fixa numeric(12, 2) not null default 40,
  meta_vendas_mes int not null default 20,
  meta_valor_mes numeric(12, 2) not null default 8000,
  limite_reservas int not null default 20,
  dias_para_liberar int not null default 7
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles (id),
  acao text not null,
  tabela text,
  registro_id text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

insert into public.configuracoes (id)
values (1)
on conflict (id) do nothing;

create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_leads_dev on public.leads (desenvolvedor_id);
create index if not exists idx_leads_vend on public.leads (vendedor_id);
create index if not exists idx_vendas_vend on public.vendas (vendedor_id);
create index if not exists idx_vendas_data on public.vendas (data_venda);
create index if not exists idx_auditoria_criado on public.auditoria (criado_em desc);

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.vendas enable row level security;
alter table public.ajustes enable row level security;
alter table public.configuracoes enable row level security;
alter table public.auditoria enable row level security;

revoke all on schema public from anon, public;
grant usage on schema public to authenticated;

revoke all on all tables in schema public from anon, public, authenticated;
revoke all on all sequences in schema public from anon, public, authenticated;
revoke all on all functions in schema public from anon, public, authenticated;

grant select on public.profiles to authenticated;
grant update (nome, deve_trocar_senha) on public.profiles to authenticated;

revoke select, insert, update on public.leads from authenticated, anon, public;
grant select (
  id, instagram_handle, nicho, cidade, status,
  desenvolvedor_id, vendedor_id, link_demo, foto_capa,
  reservado_em, atualizado_em, criado_em
) on public.leads to authenticated;
grant insert (
  id, instagram_handle, nicho, cidade, status,
  desenvolvedor_id, vendedor_id, link_demo, foto_capa,
  reservado_em, atualizado_em, criado_em
) on public.leads to authenticated;
grant update (
  status, desenvolvedor_id, vendedor_id, link_demo, foto_capa,
  reservado_em, atualizado_em
) on public.leads to authenticated;
grant select, insert, update on public.vendas to authenticated;
grant select, insert, update on public.ajustes to authenticated;
grant select, update on public.configuracoes to authenticated;
grant select, insert on public.auditoria to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and ativo = true
  );
$$;

create or replace function public.meu_role()
returns public.role_tipo
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and ativo = true;
$$;

create or replace function public.registrar_auditoria(
  p_acao text,
  p_tabela text default null,
  p_registro_id text default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.auditoria (usuario_id, acao, tabela, registro_id, detalhes)
  values (auth.uid(), p_acao, p_tabela, p_registro_id, coalesce(p_detalhes, '{}'::jsonb));
end;
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists leads_admin on public.leads;
create policy leads_admin on public.leads
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists leads_dev_select on public.leads;
create policy leads_dev_select on public.leads
  for select to authenticated
  using (
    public.meu_role() = 'desenvolvedor'
    and (status = 'na_fila' or desenvolvedor_id = auth.uid())
  );

drop policy if exists leads_dev_insert on public.leads;
create policy leads_dev_insert on public.leads
  for insert to authenticated
  with check (public.meu_role() = 'desenvolvedor' and status = 'na_fila');

drop policy if exists leads_dev_update on public.leads;
create policy leads_dev_update on public.leads
  for update to authenticated
  using (
    public.meu_role() = 'desenvolvedor'
    and (status = 'na_fila' or desenvolvedor_id = auth.uid())
  )
  with check (
    public.meu_role() = 'desenvolvedor'
    and desenvolvedor_id = auth.uid()
  );

drop policy if exists leads_vendedor_select on public.leads;
create policy leads_vendedor_select on public.leads
  for select to authenticated
  using (
    public.meu_role() = 'vendedor'
    and (status = 'demo_pronta' or vendedor_id = auth.uid())
  );

drop policy if exists leads_vendedor_update on public.leads;
create policy leads_vendedor_update on public.leads
  for update to authenticated
  using (
    public.meu_role() = 'vendedor'
    and (status = 'demo_pronta' or vendedor_id = auth.uid())
  )
  with check (
    public.meu_role() = 'vendedor'
    and vendedor_id = auth.uid()
  );

drop policy if exists vendas_admin on public.vendas;
create policy vendas_admin on public.vendas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists vendas_vendedor_select on public.vendas;
create policy vendas_vendedor_select on public.vendas
  for select to authenticated
  using (vendedor_id = auth.uid() and public.meu_role() = 'vendedor');

drop policy if exists vendas_vendedor_insert on public.vendas;
create policy vendas_vendedor_insert on public.vendas
  for insert to authenticated
  with check (vendedor_id = auth.uid() and public.meu_role() = 'vendedor');

drop policy if exists ajustes_admin on public.ajustes;
create policy ajustes_admin on public.ajustes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists ajustes_dev_select on public.ajustes;
create policy ajustes_dev_select on public.ajustes
  for select to authenticated
  using (
    public.meu_role() = 'desenvolvedor'
    and (desenvolvedor_id = auth.uid() or desenvolvedor_id is null)
  );

drop policy if exists ajustes_dev_update on public.ajustes;
create policy ajustes_dev_update on public.ajustes
  for update to authenticated
  using (
    public.meu_role() = 'desenvolvedor'
    and (desenvolvedor_id = auth.uid() or desenvolvedor_id is null)
  )
  with check (
    public.meu_role() = 'desenvolvedor'
    and desenvolvedor_id = auth.uid()
  );

drop policy if exists config_select on public.configuracoes;
create policy config_select on public.configuracoes
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists config_admin_update on public.configuracoes;
create policy config_admin_update on public.configuracoes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists auditoria_admin_select on public.auditoria;
create policy auditoria_admin_select on public.auditoria
  for select to authenticated
  using (public.is_admin());

drop policy if exists auditoria_insert_self on public.auditoria;
create policy auditoria_insert_self on public.auditoria
  for insert to authenticated
  with check (usuario_id = auth.uid() or public.is_admin());

create or replace function public.valida_piso_venda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  minimo numeric;
begin
  select preco_minimo into minimo from public.configuracoes where id = 1;
  if new.valor < minimo then
    raise exception 'O valor mínimo permitido é R$ %', to_char(minimo, 'FM999999990.00');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_piso on public.vendas;
create trigger trg_piso
  before insert on public.vendas
  for each row execute function public.valida_piso_venda();

create or replace function public.liberar_reservas_expiradas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  dias int;
  n int;
begin
  select dias_para_liberar into dias from public.configuracoes where id = 1;
  update public.leads
     set status = 'demo_pronta',
         vendedor_id = null,
         reservado_em = null,
         atualizado_em = now()
   where status in ('reservada', 'contatado', 'negociando')
     and atualizado_em < now() - make_interval(days => coalesce(dias, 7));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.adicionar_leads(p_lista text, p_nicho text default '', p_cidade text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  linha text;
  handle text;
  criados text[] := '{}';
  ignorados text[] := '{}';
  novo_id uuid;
begin
  if public.meu_role() not in ('admin', 'desenvolvedor') then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  foreach linha in array string_to_array(coalesce(p_lista, ''), E'\n')
  loop
    handle := lower(regexp_replace(trim(both from linha), '^@+', ''));
    handle := regexp_replace(handle, '[^a-z0-9._]', '', 'g');
    if handle = '' then
      continue;
    end if;
    if exists (select 1 from public.leads where instagram_handle = handle) then
      ignorados := array_append(ignorados, handle);
      continue;
    end if;
    novo_id := gen_random_uuid();
    insert into public.leads (id, instagram_handle, nicho, cidade, status, foto_capa)
    values (
      novo_id,
      handle,
      nullif(trim(p_nicho), ''),
      nullif(trim(p_cidade), ''),
      'na_fila',
      'https://picsum.photos/seed/' || handle || '/640/360'
    );
    criados := array_append(criados, handle);
    perform public.registrar_auditoria('criar_lead', 'leads', novo_id::text, jsonb_build_object('handle', handle));
  end loop;
  return jsonb_build_object('criados', to_jsonb(criados), 'ignorados', to_jsonb(ignorados));
end;
$$;

create or replace function public.pegar_lead_dev(p_lead_id uuid)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leads;
begin
  if public.meu_role() <> 'desenvolvedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.leads
     set status = 'em_producao',
         desenvolvedor_id = auth.uid(),
         atualizado_em = now()
   where id = p_lead_id and status = 'na_fila'
  returning * into r;
  if r.id is null then
    raise exception 'Essa demo já foi pega por outro desenvolvedor.';
  end if;
  perform public.registrar_auditoria('pegar_lead_dev', 'leads', r.id::text, jsonb_build_object('handle', r.instagram_handle));
  return r;
end;
$$;

create or replace function public.marcar_demo_pronta(p_lead_id uuid, p_link text)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leads;
begin
  if public.meu_role() <> 'desenvolvedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  if coalesce(trim(p_link), '') = '' then
    raise exception 'Cole o link da demo para marcar como pronta.';
  end if;
  update public.leads
     set status = 'demo_pronta',
         link_demo = trim(p_link),
         atualizado_em = now()
   where id = p_lead_id
     and desenvolvedor_id = auth.uid()
     and status = 'em_producao'
  returning * into r;
  if r.id is null then
    raise exception 'Não foi possível marcar esta demo. Ela pode não ser sua.';
  end if;
  perform public.registrar_auditoria('demo_pronta', 'leads', r.id::text, jsonb_build_object('handle', r.instagram_handle, 'link', p_link));
  return r;
end;
$$;

create or replace function public.pegar_lead_vendedor(p_lead_id uuid)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leads;
  limite int;
  abertas int;
begin
  if public.meu_role() <> 'vendedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  perform public.liberar_reservas_expiradas();
  select limite_reservas into limite from public.configuracoes where id = 1;
  select count(*) into abertas
    from public.leads
   where vendedor_id = auth.uid()
     and status in ('reservada', 'contatado', 'negociando');
  if abertas >= coalesce(limite, 20) then
    raise exception 'Você atingiu o limite de % demos reservadas.', limite;
  end if;
  update public.leads
     set status = 'reservada',
         vendedor_id = auth.uid(),
         reservado_em = now(),
         atualizado_em = now()
   where id = p_lead_id and status = 'demo_pronta'
  returning * into r;
  if r.id is null then
    raise exception 'Essa demo já foi pega por outro vendedor.';
  end if;
  perform public.registrar_auditoria('pegar_lead_vendedor', 'leads', r.id::text, jsonb_build_object('handle', r.instagram_handle));
  return r;
end;
$$;

create or replace function public.atualizar_lead_vendedor(
  p_lead_id uuid,
  p_status public.lead_status,
  p_whatsapp text default null,
  p_anotacoes text default null
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leads;
begin
  if public.meu_role() <> 'vendedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  if p_status not in ('reservada', 'contatado', 'negociando', 'perdido') then
    raise exception 'Status inválido.';
  end if;
  update public.leads
     set status = p_status,
         whatsapp = regexp_replace(coalesce(p_whatsapp, whatsapp, ''), '\D', '', 'g'),
         anotacoes = coalesce(p_anotacoes, anotacoes),
         atualizado_em = now()
   where id = p_lead_id
     and vendedor_id = auth.uid()
     and status not in ('fechado', 'perdido')
  returning * into r;
  if r.id is null then
    raise exception 'Lead não encontrado.';
  end if;
  perform public.registrar_auditoria('atualizar_lead', 'leads', r.id::text, jsonb_build_object('status', p_status));
  return r;
end;
$$;

create or replace function public.fechar_venda(
  p_lead_id uuid,
  p_valor numeric,
  p_forma text,
  p_plano public.plano_tipo
)
returns public.vendas
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads;
  cfg public.configuracoes;
  v public.vendas;
begin
  if public.meu_role() <> 'vendedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  select * into l from public.leads where id = p_lead_id and vendedor_id = auth.uid();
  if l.id is null then
    raise exception 'Lead não encontrado.';
  end if;
  if l.status = 'fechado' then
    raise exception 'Esta venda já foi fechada.';
  end if;
  if coalesce(trim(p_forma), '') = '' or p_plano is null then
    raise exception 'Informe valor, forma de pagamento e plano de renovação.';
  end if;
  select * into cfg from public.configuracoes where id = 1;
  if p_valor < cfg.preco_minimo then
    raise exception 'O valor mínimo permitido é R$ %', to_char(cfg.preco_minimo, 'FM999999990.00');
  end if;
  insert into public.vendas (
    lead_id, vendedor_id, valor, forma_pagamento, plano_renovacao,
    comissao, comissao_paga, status, vencimento_renovacao
  ) values (
    l.id, auth.uid(), p_valor, trim(p_forma), p_plano,
    cfg.comissao_fixa, false, 'confirmada',
    (current_date + case when p_plano = 'anual' then interval '18 months' else interval '6 months' end)::date
  ) returning * into v;
  update public.leads set status = 'fechado', atualizado_em = now() where id = l.id;
  perform public.registrar_auditoria(
    'fechar_venda', 'vendas', v.id::text,
    jsonb_build_object('handle', l.instagram_handle, 'valor', p_valor, 'comissao', cfg.comissao_fixa)
  );
  return v;
end;
$$;

create or replace function public.contestar_venda(p_venda_id uuid)
returns public.vendas
language plpgsql
security definer
set search_path = public
as $$
declare v public.vendas;
begin
  if not public.is_admin() then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.vendas set status = 'em_analise' where id = p_venda_id returning * into v;
  if v.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  perform public.registrar_auditoria('contestar_venda', 'vendas', v.id::text, '{}'::jsonb);
  return v;
end;
$$;

create or replace function public.estornar_venda(p_venda_id uuid, p_motivo text)
returns public.vendas
language plpgsql
security definer
set search_path = public
as $$
declare v public.vendas;
begin
  if not public.is_admin() then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno.';
  end if;
  update public.vendas
     set status = 'estornada', motivo_estorno = trim(p_motivo)
   where id = p_venda_id
  returning * into v;
  if v.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  perform public.registrar_auditoria('estornar_venda', 'vendas', v.id::text, jsonb_build_object('motivo', p_motivo));
  return v;
end;
$$;

create or replace function public.pagar_comissao(p_vendedor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.vendas
     set comissao_paga = true
   where vendedor_id = p_vendedor_id
     and status = 'confirmada'
     and comissao_paga = false;
  perform public.registrar_auditoria('pagar_comissao', 'vendas', p_vendedor_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.lgpd_apagar(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare h text;
begin
  if not public.is_admin() then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.leads
     set whatsapp = null, anotacoes = null, atualizado_em = now()
   where id = p_lead_id
  returning instagram_handle into h;
  if h is null then
    raise exception 'Lead não encontrado.';
  end if;
  perform public.registrar_auditoria('lgpd_apagar', 'leads', p_lead_id::text, jsonb_build_object('handle', h));
end;
$$;

create or replace function public.criar_ajuste(p_lead_id uuid, p_descricao text)
returns public.ajustes
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leads;
  a public.ajustes;
begin
  if not public.is_admin() then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'Descreva o ajuste.';
  end if;
  select * into l from public.leads where id = p_lead_id;
  if l.id is null then
    raise exception 'Lead não encontrado.';
  end if;
  insert into public.ajustes (lead_id, descricao, status, desenvolvedor_id)
  values (l.id, trim(p_descricao), 'pendente', l.desenvolvedor_id)
  returning * into a;
  perform public.registrar_auditoria('criar_ajuste', 'ajustes', a.id::text, jsonb_build_object('lead_id', p_lead_id));
  return a;
end;
$$;

create or replace function public.pegar_ajuste(p_ajuste_id uuid)
returns public.ajustes
language plpgsql
security definer
set search_path = public
as $$
declare a public.ajustes;
begin
  if public.meu_role() <> 'desenvolvedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.ajustes
     set desenvolvedor_id = auth.uid(), status = 'em_andamento'
   where id = p_ajuste_id
     and (desenvolvedor_id is null or desenvolvedor_id = auth.uid())
  returning * into a;
  if a.id is null then
    raise exception 'Este ajuste já foi pego.';
  end if;
  perform public.registrar_auditoria('pegar_ajuste', 'ajustes', a.id::text, '{}'::jsonb);
  return a;
end;
$$;

create or replace function public.concluir_ajuste(p_ajuste_id uuid)
returns public.ajustes
language plpgsql
security definer
set search_path = public
as $$
declare a public.ajustes;
begin
  if public.meu_role() <> 'desenvolvedor' then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.ajustes
     set status = 'concluido'
   where id = p_ajuste_id and desenvolvedor_id = auth.uid()
  returning * into a;
  if a.id is null then
    raise exception 'Ajuste não encontrado.';
  end if;
  perform public.registrar_auditoria('concluir_ajuste', 'ajustes', a.id::text, '{}'::jsonb);
  return a;
end;
$$;

create or replace function public.atualizar_usuario(
  p_id uuid,
  p_nome text default null,
  p_email text default null,
  p_role public.role_tipo default null,
  p_ativo boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Você não tem permissão para essa ação.';
  end if;
  update public.profiles
     set nome = coalesce(nullif(trim(p_nome), ''), nome),
         email = coalesce(nullif(lower(trim(p_email)), ''), email),
         role = coalesce(p_role, role),
         ativo = coalesce(p_ativo, ativo)
   where id = p_id
  returning * into p;
  if p.id is null then
    raise exception 'Usuário não encontrado.';
  end if;
  perform public.registrar_auditoria('editar_usuario', 'profiles', p.id::text, jsonb_build_object('ativo', p.ativo, 'role', p.role));
  return p;
end;
$$;

create or replace function public.concluir_troca_senha()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles;
begin
  update public.profiles
     set deve_trocar_senha = false
   where id = auth.uid()
  returning * into p;
  perform public.registrar_auditoria('trocar_senha', 'profiles', auth.uid()::text, '{}'::jsonb);
  return p;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.meu_role() to authenticated;
grant execute on function public.registrar_auditoria(text, text, text, jsonb) to authenticated;
grant execute on function public.liberar_reservas_expiradas() to authenticated;
grant execute on function public.adicionar_leads(text, text, text) to authenticated;
grant execute on function public.pegar_lead_dev(uuid) to authenticated;
grant execute on function public.marcar_demo_pronta(uuid, text) to authenticated;
grant execute on function public.pegar_lead_vendedor(uuid) to authenticated;
grant execute on function public.atualizar_lead_vendedor(uuid, public.lead_status, text, text) to authenticated;
grant execute on function public.fechar_venda(uuid, numeric, text, public.plano_tipo) to authenticated;
grant execute on function public.contestar_venda(uuid) to authenticated;
grant execute on function public.estornar_venda(uuid, text) to authenticated;
grant execute on function public.pagar_comissao(uuid) to authenticated;
grant execute on function public.lgpd_apagar(uuid) to authenticated;
grant execute on function public.criar_ajuste(uuid, text) to authenticated;
grant execute on function public.pegar_ajuste(uuid) to authenticated;
grant execute on function public.concluir_ajuste(uuid) to authenticated;
grant execute on function public.atualizar_usuario(uuid, text, text, public.role_tipo, boolean) to authenticated;
grant usage on type public.role_tipo to authenticated;
grant usage on type public.lead_status to authenticated;
grant usage on type public.venda_status to authenticated;
grant usage on type public.plano_tipo to authenticated;
grant usage on type public.ajuste_status to authenticated;

drop view if exists public.leads_contato;
create view public.leads_contato
with (security_barrier = true) as
select id, whatsapp, anotacoes
from public.leads
where vendedor_id = auth.uid()
  and public.meu_role() = 'vendedor';

grant select on public.leads_contato to authenticated;

grant execute on function public.concluir_troca_senha() to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime drop table public.leads;
  exception when undefined_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.leads (
      id, instagram_handle, nicho, cidade, status,
      desenvolvedor_id, vendedor_id, link_demo, foto_capa,
      reservado_em, atualizado_em, criado_em
    );
  exception when duplicate_object then
    null;
  end;
end $$;
