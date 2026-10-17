-- =====================================================================
-- Agendamentos: arquivos exportados sem o detalhe "Cliente" vêm agrupados
-- (uma linha = vários agendamentos, coluna Quantidade). O painel passa a
-- somar a quantidade em vez de contar linhas.
-- =====================================================================
alter table public.agendamentos add column quantidade integer not null default 1 check (quantidade > 0);

create or replace function public.painel_diario(p_ini date, p_fim date, p_origens_av text[])
returns table (metrica text, estabelecimento text, pessoa text, dia integer, qtd bigint, valor numeric)
language sql stable security invoker set search_path = '' as $$
  select 'leads', l.estabelecimento, coalesce(l.atendente, ''), extract(day from l.data_cadastro)::int, count(*), 0::numeric
    from public.leads l
   where l.data_cadastro >= p_ini and l.data_cadastro < p_fim + 1
   group by 2, 3, 4
  union all
  select 'agend_criados', a.estabelecimento, coalesce(a.usuario_criacao, ''), extract(day from a.data_criacao)::int, sum(a.quantidade), 0
    from public.agendamentos a
   where a.data_criacao between p_ini and p_fim
   group by 2, 3, 4
  union all
  select 'avaliacoes', a.estabelecimento, '', extract(day from a.data_agendada)::int, sum(a.quantidade),
         coalesce(sum(a.quantidade) filter (where lower(a.status) in ('finalizado', 'presente')), 0)
    from public.agendamentos a
   where a.data_agendada between p_ini and p_fim
   group by 2, 4
  union all
  select 'vendas', v.estabelecimento,
         case when upper(v.origem_midia) = any (p_origens_av) then 'AV' else 'OUTRAS' end,
         extract(day from v.data_pagamento)::int,
         count(distinct v.id_orcamento) filter (where v.valor_liquido > 0), sum(v.valor_liquido)
    from public.vendas v
   where v.data_pagamento between p_ini and p_fim
   group by 2, 3, 4
$$;
