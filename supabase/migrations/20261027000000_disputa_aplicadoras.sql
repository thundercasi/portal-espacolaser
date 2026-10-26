-- =====================================================================
-- Disputa das aplicadoras: ranking de vendas (valor líquido) no período.
-- A tabela disputas ganha o tipo; a tela Disputa alterna entre as duas.
-- =====================================================================
alter table public.disputas add column tipo text not null default 'comparecimentos'
  check (tipo in ('comparecimentos', 'vendas_aplicadoras'));

insert into public.disputas (nome, premio, inicio, fim, tipo)
values ('Disputa de vendas das aplicadoras', 'iPhone 16 Pro Max', '2026-10-01', '2026-11-30', 'vendas_aplicadoras');

-- ---------------------------------------------------------------------
-- De/para em SQL (mesma regra de src/lib/depara.ts): vínculo com período que
-- cobre a data (o mais curto) → vínculo permanente → pessoa com o mesmo nome.
-- ---------------------------------------------------------------------
create or replace function public.colaborador_de(p_unidade uuid, p_usuario text, p_data date)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select cu.colaborador_id from public.colaborador_usuarios cu
      where cu.unidade_id = p_unidade and cu.usuario = public.normalizar(p_usuario)
        and (cu.vigente_de is not null or cu.vigente_ate is not null)
        and (cu.vigente_de is null or cu.vigente_de <= p_data)
        and (cu.vigente_ate is null or cu.vigente_ate >= p_data)
      order by coalesce(cu.vigente_ate, date '9999-12-31') - coalesce(cu.vigente_de, date '1900-01-01')
      limit 1),
    (select cu.colaborador_id from public.colaborador_usuarios cu
      where cu.unidade_id = p_unidade and cu.usuario = public.normalizar(p_usuario)
        and cu.vigente_de is null and cu.vigente_ate is null
      limit 1),
    (select c.id from public.colaboradores c
      where c.unidade_id = p_unidade and public.normalizar(c.nome) = public.normalizar(p_usuario)
      limit 1))
$$;

-- ---------------------------------------------------------------------
-- Ranking (security definer: só totais por pessoa). Vendas com pagamento no
-- período, pela parte de cada vendedor. Cancelamentos: venda cancelada com o
-- mês ainda aberto já some do relatório de vendas (a coleta regrava o mês até
-- o dia 3 do seguinte); só abate o que foi cancelado depois disso, de venda
-- feita no período. Devolve só as Aplicadoras da Equipe; para administradores,
-- também os vendedores sem cadastro (funcao nula), para completar o de/para.
-- ---------------------------------------------------------------------
create or replace function public.ranking_vendas_aplicadoras(p_disputa uuid)
returns table (participante text, unidade text, funcao text, vendas bigint, valor numeric, cancelado numeric)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim from public.disputas where id = p_disputa and public.is_membro()
  ),
  mov as (
    select u.id as unidade_id, u.nome as unidade_nome, v.vendedor as usuario, v.data_pagamento as data,
           v.id_orcamento as orcamento, v.valor_liquido as valor, 0::numeric as cancelado
      from public.vendas v
      join d on v.data_pagamento between d.inicio and d.fim
      join public.unidades u on u.estabelecimento = v.estabelecimento
     where v.vendedor <> ''
    union all
    select u.id, u.nome, c.vendedor, c.data_venda, null, 0, c.valor_cancelado
      from public.cancelamentos c
      join d on c.data_venda between d.inicio and d.fim
      join public.unidades u on u.estabelecimento = c.estabelecimento
     where coalesce(c.vendedor, '') <> ''
       and c.data_cancelamento >= (date_trunc('month', c.data_venda) + interval '1 month 2 days')::date
  ),
  p as (
    select m.*, public.colaborador_de(m.unidade_id, m.usuario, m.data) as colab from mov m
  )
  select coalesce(c.nome, min(p.usuario)), p.unidade_nome, c.funcao,
         count(distinct p.orcamento) filter (where p.valor > 0), sum(p.valor), sum(p.cancelado)
    from p left join public.colaboradores c on c.id = p.colab
   where c.funcao = 'Aplicadora' or (c.id is null and public.is_admin())
   group by c.id, c.nome, c.funcao, p.unidade_nome, case when c.id is null then public.normalizar(p.usuario) end
$$;
