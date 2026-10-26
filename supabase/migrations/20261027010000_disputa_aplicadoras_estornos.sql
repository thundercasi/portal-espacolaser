-- =====================================================================
-- Ranking das aplicadoras: o relatório de vendas do ELOS já traz os
-- cancelamentos como linhas negativas (tipo "Cancelamento", na data do
-- cancelamento) e tira do mês as vendas canceladas antes do fechamento.
-- Abater também o relatório de cancelamentos contaria duas vezes: o ranking
-- passa a usar só as vendas (valor = positivas, cancelado = negativas).
-- =====================================================================
create or replace function public.ranking_vendas_aplicadoras(p_disputa uuid)
returns table (participante text, unidade text, funcao text, vendas bigint, valor numeric, cancelado numeric)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim from public.disputas where id = p_disputa and public.is_membro()
  ),
  p as (
    select u.nome as unidade_nome, v.vendedor as usuario, v.id_orcamento, v.valor_liquido,
           public.colaborador_de(u.id, v.vendedor, v.data_pagamento) as colab
      from public.vendas v
      join d on v.data_pagamento between d.inicio and d.fim
      join public.unidades u on u.estabelecimento = v.estabelecimento
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
