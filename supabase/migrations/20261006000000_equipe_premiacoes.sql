-- =====================================================================
-- Equipe (com de/para de usuários do sistema) e Premiações
-- Substitui public.atendentes por:
--   colaboradores          → a pessoa (nome real, função, unidade)
--   colaborador_usuarios   → de/para: usuário que aparece nas exportações → pessoa, por unidade
-- =====================================================================

-- Mesma normalização de normalizar() em src/lib/importar.ts:
-- minúsculas, sem acento, qualquer coisa que não seja letra/número vira um espaço
create or replace function public.normalizar(t text) returns text
language sql immutable set search_path = '' as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------
create table public.colaboradores (
  id             uuid primary key default gen_random_uuid(),
  unidade_id     uuid references public.unidades(id) on delete cascade,   -- null = rede (ex.: gerente)
  nome           text not null,
  funcao         text not null default 'Consultora'
                 check (funcao in ('Consultora','Aplicadora','Subgerente','Gerente','Outro')),
  no_painel      boolean not null default true,    -- aparece como coluna no painel do funil
  participa_meta boolean not null default true,    -- entra na divisão da meta de leads/agendamentos do funil
  valor_fixo     numeric(12,2) not null default 0, -- prêmio fixo mensal (exceções, ex.: limpeza)
  ativo          boolean not null default true,
  ordem          integer not null default 0,
  created_at     timestamptz not null default now()
);

-- usuario guardado normalizado (minúsculas, sem acento) para casar com qualquer exportação
create table public.colaborador_usuarios (
  unidade_id     uuid not null references public.unidades(id) on delete cascade,
  usuario        text not null,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  primary key (unidade_id, usuario)
);

-- migra os atendentes atuais
insert into public.colaboradores (unidade_id, nome, funcao, no_painel, participa_meta, ativo, ordem)
select unidade_id, apelido, 'Consultora', true, participa_meta, ativo, ordem from public.atendentes;

insert into public.colaborador_usuarios (unidade_id, usuario, colaborador_id)
select a.unidade_id, public.normalizar(a.nome_sistema), c.id
  from public.atendentes a
  join public.colaboradores c on c.unidade_id = a.unidade_id and c.nome = a.apelido and c.ordem = a.ordem
on conflict do nothing;

drop table public.atendentes;

-- ---------------------------------------------------------------------
-- Dados importados para premiações
-- ---------------------------------------------------------------------
-- Relatório "vendas por vendedor": não tem data; o mês é escolhido na importação
create table public.vendas_vendedor (
  mes             date not null check (extract(day from mes) = 1),
  estabelecimento text not null,
  vendedor        text not null,
  perfil          text,
  cargo           text,
  valor_bruto     numeric(14,2) not null default 0,
  valor_desconto  numeric(14,2) not null default 0,
  valor_liquido   numeric(14,2) not null default 0,
  importado_em    timestamptz not null default now(),
  primary key (mes, estabelecimento, vendedor)
);

-- Relatório de cancelamentos (sem dados pessoais do cliente)
create table public.cancelamentos (
  orcamento         text not null,
  item              text not null,
  status            text,
  data_cancelamento date not null,
  data_venda        date,
  valor_cancelado   numeric(14,2) not null default 0,
  valor_total       numeric(14,2) not null default 0,
  estabelecimento   text not null,     -- "Estabelecimento Venda"
  vendedor          text,
  usuario_cancelamento text,
  motivo            text,
  importado_em      timestamptz not null default now(),
  primary key (orcamento, item)
);
create index cancelamentos_data_idx on public.cancelamentos (data_cancelamento);

alter table public.importacoes drop constraint importacoes_tipo_check;
alter table public.importacoes add constraint importacoes_tipo_check
  check (tipo in ('leads','agendamentos','vendas','vendas_vendedor','cancelamentos'));

-- ---------------------------------------------------------------------
-- Premiações
-- ---------------------------------------------------------------------
-- Regras (tabelas de faixas, limites, percentuais) — uma linha só, em JSON
create table public.premiacao_regras (
  id         integer primary key default 1 check (id = 1),
  regras     jsonb not null,
  updated_at timestamptz not null default now()
);

-- Status do mês: por unidade, e unidade_id null = rede (base do prêmio da gerente)
create table public.premiacao_status (
  mes        date not null check (extract(day from mes) = 1),
  unidade_id uuid references public.unidades(id) on delete cascade,
  status     text not null default 'Nenhum' check (status in ('Nenhum','Meta','Super')),
  updated_at timestamptz not null default now()
);
create unique index premiacao_status_uk on public.premiacao_status (mes, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Ajustes manuais por pessoa no mês
create table public.premiacao_ajustes (
  mes             date not null check (extract(day from mes) = 1),
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  bateu_meta      boolean not null default false,   -- coluna "Meta?" da planilha
  func_mes        numeric(12,2) not null default 0, -- funcionário do mês
  sem_garantido   boolean not null default false,   -- tira o valor garantido (faltas etc.)
  observacao      text,
  updated_at      timestamptz not null default now(),
  primary key (mes, colaborador_id)
);

do $$
declare t text;
begin
  foreach t in array array['colaboradores','colaborador_usuarios','vendas_vendedor','cancelamentos','premiacao_regras','premiacao_status','premiacao_ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "membros_all" on public.%I for all to authenticated using ((select public.is_membro())) with check ((select public.is_membro()))', t);
  end loop;
end $$;

-- Regras iniciais = aba "Metas" da planilha "Cálculo Premiações - Padrão"
insert into public.premiacao_regras (regras) values ('{
  "limiteCaptacoes": 400,
  "limiteAgendamentos": 180,
  "garantidoConsultora": 300,
  "subgerente": { "Meta": 0.005, "Super": 0.01 },
  "gerente": { "Meta": 0.0125, "Super": 0.027 },
  "consultora": [
    { "faixa": 2,  "Meta": { "captacoes": 100, "agendamentos": 100, "vendas": 300 },  "Super": { "captacoes": 100, "agendamentos": 100, "vendas": 550 } },
    { "faixa": 3,  "Meta": { "captacoes": 100, "agendamentos": 100, "vendas": 400 },  "Super": { "captacoes": 100, "agendamentos": 100, "vendas": 750 } },
    { "faixa": 4,  "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 450 },  "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 850 } },
    { "faixa": 5,  "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 600 },  "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 1050 } },
    { "faixa": 6,  "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 750 },  "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 1250 } },
    { "faixa": 7,  "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 900 },  "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 1450 } },
    { "faixa": 8,  "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 1050 }, "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 1650 } },
    { "faixa": 9,  "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 1200 }, "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 1850 } },
    { "faixa": 10, "Meta": { "captacoes": 150, "agendamentos": 150, "vendas": 1350 }, "Super": { "captacoes": 150, "agendamentos": 150, "vendas": 2050 } }
  ],
  "aplicadora": [
    { "faixa": 2, "Meta": 400,  "Super": 800 },
    { "faixa": 3, "Meta": 600,  "Super": 1200 },
    { "faixa": 4, "Meta": 750,  "Super": 1500 },
    { "faixa": 5, "Meta": 900,  "Super": 1800 },
    { "faixa": 6, "Meta": 1050, "Super": 2100 }
  ]
}');

-- ---------------------------------------------------------------------
-- Usuários que aparecem nos dados de um período e ainda não têm de/para
-- ---------------------------------------------------------------------
create or replace function public.usuarios_sem_vinculo(p_ini date, p_fim date)
returns table (estabelecimento text, usuario text, origem text, qtd bigint)
language sql stable security invoker set search_path = '' as $$
  with dados as (
    select l.estabelecimento, l.atendente as usuario, 'leads' as origem
      from public.leads l where l.data_cadastro >= p_ini and l.data_cadastro < p_fim + 1 and l.atendente is not null
    union all
    select a.estabelecimento, a.usuario_criacao, 'agendamentos'
      from public.agendamentos a where a.data_criacao between p_ini and p_fim and a.usuario_criacao is not null
    union all
    select v.estabelecimento, v.vendedor, 'vendas'
      from public.vendas_vendedor v where v.mes between date_trunc('month', p_ini)::date and p_fim
  )
  select d.estabelecimento, d.usuario, d.origem, count(*)
    from dados d
    left join public.unidades u on u.estabelecimento = d.estabelecimento
   where u.id is null
      or not exists (
        select 1 from public.colaborador_usuarios cu
         where cu.unidade_id = u.id
           and cu.usuario = public.normalizar(d.usuario))
   group by 1, 2, 3
$$;
