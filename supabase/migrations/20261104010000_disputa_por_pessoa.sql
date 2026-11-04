-- =====================================================================
-- Disputas: cada pessoa soma o que fez em todas as unidades (uma linha só).
--  - usuário sem vínculo na unidade do registro é ligado pelo vínculo dele
--    nas outras unidades (mesma regra das premiações);
--  - cadastros com o mesmo nome em unidades diferentes são a mesma pessoa;
--  - unidade exibida = a de mais leads (ou mais vendas); por_unidade traz a quebra.
-- =====================================================================

-- de/para com as outras unidades como recurso (ordem das unidades)
create or replace function public.colaborador_na_rede(p_unidade uuid, p_usuario text, p_data date)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    public.colaborador_de(p_unidade, p_usuario, p_data),
    (select x.id from (
       select public.colaborador_de(u.id, p_usuario, p_data) as id, u.ordem
         from public.unidades u where u.id <> p_unidade and u.ativo) x
      where x.id is not null order by x.ordem limit 1))
$$;

drop function public.ranking_disputa(uuid);
create function public.ranking_disputa(p_disputa uuid)
returns table (participante text, unidade text, leads bigint, comparecimentos bigint, agendados bigint, compareceram bigint, corte date, por_unidade jsonb)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim,
           least(fim, coalesce((select (max(i.created_at) at time zone 'America/Sao_Paulo')::date
                                  from public.importacoes i where i.tipo = 'agendamentos'), current_date) - 1) as corte
      from public.disputas where id = p_disputa and public.is_membro()
  ),
  l as (
    select l.data_cadastro, l.atendente, l.tel_hash, u.id as unidade_id, u.nome as unidade_nome
      from public.leads l
      join d on l.data_cadastro >= d.inicio and l.data_cadastro < d.fim + 1
      join public.unidades u on u.estabelecimento = l.estabelecimento
     where coalesce(l.atendente, '') <> '' and public.normalizar(l.atendente) not like 'administrador%'
  ),
  p as (
    select l.*, coalesce(c.nome, l.atendente) as pessoa, public.normalizar(coalesce(c.nome, l.atendente)) as chave
      from l
      left join public.colaboradores c on c.id = public.colaborador_na_rede(l.unidade_id, l.atendente, l.data_cadastro::date)
  ),
  primeiro as (
    select distinct on (p.tel_hash) p.tel_hash, p.chave, p.data_cadastro
      from p where p.tel_hash is not null
     order by p.tel_hash, p.data_cadastro
  ),
  -- por cliente: avaliação até o fim da disputa (pontos) e até o corte (taxa)
  marcados as (
    select pr.chave,
           bool_or(lower(a.status) in ('finalizado', 'presente')) as compareceu,
           bool_or(a.data_agendada <= d.corte) as agendado,
           bool_or(a.data_agendada <= d.corte and lower(a.status) in ('finalizado', 'presente')) as compareceu_corte
      from primeiro pr
      cross join d
      join public.agendamentos a on a.tel_hash = pr.tel_hash
       and a.data_agendada >= pr.data_cadastro::date and a.data_agendada <= d.fim
     group by pr.tel_hash, pr.chave
  ),
  tot as (
    select chave, count(*) filter (where compareceu) as comp,
           count(*) filter (where agendado) as agendados, count(*) filter (where compareceu_corte) as comp_corte
      from marcados group by 1
  ),
  pu as (
    select chave, unidade_nome, count(*) as n from p group by 1, 2
  )
  select min(p.pessoa),
         (select x.unidade_nome from pu x where x.chave = p.chave order by x.n desc, x.unidade_nome limit 1),
         count(*), coalesce(max(tot.comp), 0), coalesce(max(tot.agendados), 0), coalesce(max(tot.comp_corte), 0),
         (select corte from d),
         (select jsonb_object_agg(x.unidade_nome, x.n) from pu x where x.chave = p.chave)
    from p left join tot on tot.chave = p.chave
   group by p.chave
$$;

drop function public.ranking_vendas_aplicadoras(uuid);
create function public.ranking_vendas_aplicadoras(p_disputa uuid)
returns table (participante text, unidade text, funcao text, vendas bigint, valor numeric, cancelado numeric, por_unidade jsonb)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim from public.disputas where id = p_disputa and public.is_membro()
  ),
  p as (
    select u.nome as unidade_nome, v.vendedor as usuario, v.id_orcamento, v.valor_liquido, v.data_pagamento,
           coalesce(t.colaborador_id, public.colaborador_na_rede(u.id, v.vendedor, v.data_pagamento)) as colab
      from public.vendas v
      join d on v.data_pagamento between d.inicio and d.fim
      join public.unidades u on u.estabelecimento = v.estabelecimento
      left join public.vendas_transferidas t on t.id_orcamento = v.id_orcamento and t.vendedor = v.vendedor
     where v.vendedor <> ''
  ),
  pf as (
    select p.*, (select m.funcao from public.colaborador_no_mes(p.colab, p.data_pagamento) m) as funcao,
           coalesce(c.nome, p.usuario) as pessoa, public.normalizar(coalesce(c.nome, p.usuario)) as chave, c.id as colab_id
      from p left join public.colaboradores c on c.id = p.colab
  ),
  sel as (
    select * from pf where pf.funcao = 'Aplicadora' or (pf.colab_id is null and public.is_admin())
  ),
  pu as (
    select chave, unidade_nome, sum(valor_liquido) as v from sel group by 1, 2
  )
  select min(sel.pessoa),
         (select x.unidade_nome from pu x where x.chave = sel.chave order by x.v desc, x.unidade_nome limit 1),
         max(sel.funcao),
         count(distinct sel.id_orcamento) filter (where sel.valor_liquido > 0),
         coalesce(sum(sel.valor_liquido) filter (where sel.valor_liquido > 0), 0),
         coalesce(-sum(sel.valor_liquido) filter (where sel.valor_liquido < 0), 0),
         (select jsonb_object_agg(x.unidade_nome, x.v) from pu x where x.chave = sel.chave)
    from sel
   group by sel.chave
$$;
