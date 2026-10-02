-- =====================================================================
-- Espaçolaser Follow-up – painel do funil (leads → agendamentos → vendas)
-- Schema inicial (Supabase / Postgres 15+)
-- Os dados são compartilhados pela equipe: qualquer e-mail cadastrado
-- em public.membros enxerga e altera tudo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------
create table public.membros (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

create or replace function public.is_membro() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.email = lower(auth.jwt() ->> 'email'))
$$;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table public.unidades (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,                 -- nome curto: "Paulista"
  estabelecimento text not null unique,          -- como vem nas exportações: "SP - AMERICANA - ..."
  ordem           integer not null default 0,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Uma mesma pessoa pode aparecer em mais de uma unidade (uma linha por unidade).
create table public.atendentes (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid not null references public.unidades(id) on delete cascade,
  nome_sistema   text not null,                  -- como vem em "Atendente" / "Usuário de Criação"
  apelido        text not null,
  participa_meta boolean not null default true,  -- entra na divisão da meta de leads/agendamentos
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (unidade_id, nome_sistema)
);

-- Metas mensais por unidade (equivalem ao bloco "CONFIGURAÇÕES" de cada aba)
create table public.metas (
  unidade_id           uuid not null references public.unidades(id) on delete cascade,
  mes                  date not null check (extract(day from mes) = 1),
  meta_leads           integer not null default 0,
  meta_agendamentos    integer not null default 0,
  taxa_comparecimento  numeric(6,4) not null default 0.26,  -- presenças / agendamentos
  taxa_conversao       numeric(6,4) not null default 0.51,  -- vendas av / presenças
  ticket_medio         numeric(12,2) not null default 1500,
  share_avaliacoes     numeric(6,4) not null default 0.37,  -- vendas de avaliação / vendas totais
  meta_faturamento     numeric(14,2) not null default 0,
  super_meta           numeric(14,2) not null default 0,
  dias_nao_uteis       integer[] not null default '{}',     -- dias do mês fechados (além dos domingos, se domingo_util = false)
  dias_uteis_extra     integer[] not null default '{}',     -- domingos em que abre
  updated_at           timestamptz not null default now(),
  primary key (unidade_id, mes)
);

-- ---------------------------------------------------------------------
-- Dados importados das exportações
-- (sem nome, CPF, telefone ou e-mail de clientes: o painel não precisa)
-- ---------------------------------------------------------------------
create table public.leads (
  id_lead         bigint primary key,
  data_cadastro   timestamp not null,
  estabelecimento text not null,
  atendente       text,
  midia           text,
  status          text,
  motivo_descarte text,
  indicacao       boolean,
  importado_em    timestamptz not null default now()
);
create index leads_data_idx on public.leads (data_cadastro);

-- A exportação de agendamentos não tem ID; a chave é um hash (SHA-256) de
-- estabelecimento + data agendada + data de criação + cliente + telefone + usuário.
create table public.agendamentos (
  chave            text primary key,
  estabelecimento  text not null,
  data_agendada    date not null,
  data_criacao     date not null,
  usuario_criacao  text,
  origem_cliente   text,
  status           text,
  importado_em     timestamptz not null default now()
);
create index agendamentos_agendada_idx on public.agendamentos (data_agendada);
create index agendamentos_criacao_idx on public.agendamentos (data_criacao);

create table public.vendas (
  id_orcamento     bigint primary key,
  data_pagamento   date not null,
  estabelecimento  text not null,
  origem_midia     text,
  tipo             text,
  contrato_assinado text,
  valor_bruto      numeric(14,2) not null default 0,
  valor_desconto   numeric(14,2) not null default 0,
  valor_liquido    numeric(14,2) not null default 0,
  importado_em     timestamptz not null default now()
);
create index vendas_data_idx on public.vendas (data_pagamento);

create table public.importacoes (
  id           uuid primary key default gen_random_uuid(),
  arquivo      text not null,
  tipo         text not null check (tipo in ('leads','agendamentos','vendas')),
  linhas       integer not null,
  periodo_ini  date,
  periodo_fim  date,
  usuario      text default lower(auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: só membros
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['membros','unidades','atendentes','metas','leads','agendamentos','vendas','importacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "membros_all" on public.%I for all to authenticated using ((select public.is_membro())) with check ((select public.is_membro()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Agregado diário do mês para o painel (evita baixar milhares de linhas)
--   leads        → por estabelecimento + atendente + dia do cadastro
--   agend_criados→ por usuário de criação + dia da criação (sem filtro de unidade, como na planilha)
--   avaliacoes   → por estabelecimento + dia agendado (qtd = total, valor = presenças)
--   vendas       → por estabelecimento + dia do pagamento (pessoa = 'AV' ou 'OUTRAS';
--                  qtd = vendas com valor líquido > 0, valor = soma do líquido)
-- ---------------------------------------------------------------------
create or replace function public.painel_diario(p_ini date, p_fim date, p_origens_av text[])
returns table (metrica text, estabelecimento text, pessoa text, dia integer, qtd bigint, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select 'leads', l.estabelecimento, coalesce(l.atendente, ''), extract(day from l.data_cadastro)::int, count(*), 0::numeric
    from public.leads l
   where l.data_cadastro >= p_ini and l.data_cadastro < p_fim + 1
   group by 2, 3, 4
  union all
  select 'agend_criados', a.estabelecimento, coalesce(a.usuario_criacao, ''), extract(day from a.data_criacao)::int, count(*), 0
    from public.agendamentos a
   where a.data_criacao between p_ini and p_fim
   group by 2, 3, 4
  union all
  select 'avaliacoes', a.estabelecimento, '', extract(day from a.data_agendada)::int, count(*),
         count(*) filter (where lower(a.status) in ('finalizado', 'presente'))
    from public.agendamentos a
   where a.data_agendada between p_ini and p_fim
   group by 2, 4
  union all
  select 'vendas', v.estabelecimento,
         case when upper(v.origem_midia) = any (p_origens_av) then 'AV' else 'OUTRAS' end,
         extract(day from v.data_pagamento)::int,
         count(*) filter (where v.valor_liquido > 0), sum(v.valor_liquido)
    from public.vendas v
   where v.data_pagamento between p_ini and p_fim
   group by 2, 3, 4
$$;

-- ---------------------------------------------------------------------
-- Dados iniciais (a partir da planilha "Gestão - V2 - Paulista")
-- ---------------------------------------------------------------------
insert into public.membros (email) values ('cassiano.colombo@outlook.com');

insert into public.unidades (nome, estabelecimento, ordem) values
  ('Paulista', 'SP - AMERICANA - NOSSA SENHORA DE FÁTIMA', 1),
  ('Medon',    'SP - AMERICANA - VILA MEDON', 2),
  ('Tivoli',   'SP - SANTA BARBARA OESTE - SHOPPING TIVOLI', 3);

insert into public.atendentes (unidade_id, nome_sistema, apelido, participa_meta, ordem)
select u.id, a.nome, a.apelido, a.meta, a.ordem
  from (values
    ('Paulista', 'MILENE EDUARDA DA SILVA',             'Ana Carolina', true,  1),
    ('Paulista', 'BRUNA BEATRIZ MORATO DOS SANTOS',     'Bruna',        true,  2),
    ('Paulista', 'GABRIELLY DAMASCENO ARAUJO',          'Gabi Livieri', true,  3),
    ('Paulista', 'Cassiano Colombo de Oliveira Gil',    'Karina',       false, 4),
    ('Medon',    'CAROLINE NALINI DE OLIVEIRA',         'Carol Nalini', true,  1),
    ('Medon',    'ALICIA DOS SANTOS TAVARES',           'Alicia',       true,  2),
    ('Medon',    'LARISSA KOWALTSCHUK DE PAULA VIEPRZ', 'Gabi Ramos',   true,  3),
    ('Medon',    'LETÍCIA DE OLIVEIRA SFERRA',          'Letícia',      false, 4),
    ('Tivoli',   'karina andrade',                      'Karina',       true,  1),
    ('Tivoli',   'LARISSA KOWALTSCHUK DE PAULA VIEPRZ', 'Larissa',      true,  2),
    ('Tivoli',   'GABRIELLY DAMASCENO ARAUJO',          'Gabrielly',    true,  3)
  ) as a(unidade, nome, apelido, meta, ordem)
  join public.unidades u on u.nome = a.unidade;

insert into public.metas (unidade_id, mes, meta_leads, meta_agendamentos, taxa_comparecimento, taxa_conversao,
                          ticket_medio, share_avaliacoes, meta_faturamento, super_meta)
select u.id, date '2026-06-01', m.leads, m.agend, 0.26, 0.51, m.ticket, m.share, m.meta, m.super
  from (values
    ('Paulista', 1170, 375, 1500, 0.37, 180000, 200000),
    ('Medon',    1170, 375, 1500, 0.37, 170000, 190000),
    ('Tivoli',   1170, 420, 1700, 0.32, 200000, 230000)
  ) as m(unidade, leads, agend, ticket, share, meta, super)
  join public.unidades u on u.nome = m.unidade;
