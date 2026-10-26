-- =====================================================================
-- Transferência de vendas: venda lançada no login de outra pessoa passa a
-- contar para quem de fato vendeu. Fica numa tabela própria (chave = linha
-- da exportação: ID Orç. + vendedor) para sobreviver à reimportação diária.
-- Vale nas premiações e na disputa das aplicadoras.
-- =====================================================================
create table public.vendas_transferidas (
  id_orcamento   bigint not null,
  vendedor       text not null,   -- vendedor da linha na exportação (grafia original)
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  criado_por     text default lower(auth.jwt() ->> 'email'),
  created_at     timestamptz not null default now(),
  primary key (id_orcamento, vendedor)
);
alter table public.vendas_transferidas enable row level security;
create policy "admin_all" on public.vendas_transferidas for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "membros_select" on public.vendas_transferidas for select to authenticated using ((select public.is_membro()));

-- Transferências com os dados da venda, para o cálculo do mês (premiações)
create or replace function public.vendas_transferidas_periodo(p_ini date, p_fim date)
returns table (id_orcamento bigint, vendedor text, colaborador_id uuid, estabelecimento text, data_pagamento date, valor_liquido numeric)
language sql stable security invoker set search_path = '' as $$
  select t.id_orcamento, t.vendedor, t.colaborador_id, v.estabelecimento, v.data_pagamento, v.valor_liquido
    from public.vendas_transferidas t
    join public.vendas v on v.id_orcamento = t.id_orcamento and v.vendedor = t.vendedor
   where v.data_pagamento between p_ini and p_fim
$$;

-- Ranking das aplicadoras: a transferência vale antes do de/para
create or replace function public.ranking_vendas_aplicadoras(p_disputa uuid)
returns table (participante text, unidade text, funcao text, vendas bigint, valor numeric, cancelado numeric)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim from public.disputas where id = p_disputa and public.is_membro()
  ),
  p as (
    select u.nome as unidade_nome, v.vendedor as usuario, v.id_orcamento, v.valor_liquido,
           coalesce(t.colaborador_id, public.colaborador_de(u.id, v.vendedor, v.data_pagamento)) as colab
      from public.vendas v
      join d on v.data_pagamento between d.inicio and d.fim
      join public.unidades u on u.estabelecimento = v.estabelecimento
      left join public.vendas_transferidas t on t.id_orcamento = v.id_orcamento and t.vendedor = v.vendedor
     where v.vendedor <> ''
  )
  select coalesce(c.nome, min(p.usuario)), p.unidade_nome, c.funcao,
         count(distinct p.id_orcamento) filter (where p.valor_liquido > 0),
         coalesce(sum(p.valor_liquido) filter (where p.valor_liquido > 0), 0),
         coalesce(-sum(p.valor_liquido) filter (where p.valor_liquido < 0), 0)
    from p left join public.colaboradores c on c.id = p.colab
   where c.funcao = 'Aplicadora' or (c.id is null and public.is_admin())
   group by c.id, c.nome, c.funcao, p.unidade_nome, case when c.id is null then public.normalizar(p.usuario) end
$$;
