-- =====================================================================
-- Disputa das consultoras: taxa = compareceram ÷ agendados (não mais ÷ leads),
-- os dois até o corte; os pontos (comparecimentos) contam até o fim.
-- Agendado = cliente captado com avaliação marcada (qualquer status) entre o
-- cadastro e o corte. Corte = último dia completo antes da última importação
-- de agendamentos (a coleta das 06h ainda não sabe quem vem hoje); avaliação
-- futura ficaria como "não compareceu" e distorceria a taxa.
-- =====================================================================
drop function public.ranking_disputa(uuid);

create function public.ranking_disputa(p_disputa uuid)
returns table (participante text, unidade text, leads bigint, comparecimentos bigint, agendados bigint, compareceram bigint, corte date)
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
    select l.*, coalesce((select c.nome from public.colaboradores c where c.id = public.colaborador_de(l.unidade_id, l.atendente, l.data_cadastro::date)), l.atendente) as pessoa
      from l
  ),
  primeiro as (
    select distinct on (p.tel_hash) p.tel_hash, p.pessoa, p.unidade_nome, p.data_cadastro
      from p where p.tel_hash is not null
     order by p.tel_hash, p.data_cadastro
  ),
  -- por cliente: avaliação até o fim da disputa (pontos) e até o corte (taxa)
  marcados as (
    select pr.pessoa, pr.unidade_nome,
           bool_or(lower(a.status) in ('finalizado', 'presente')) as compareceu,
           bool_or(a.data_agendada <= d.corte) as agendado,
           bool_or(a.data_agendada <= d.corte and lower(a.status) in ('finalizado', 'presente')) as compareceu_corte
      from primeiro pr
      cross join d
      join public.agendamentos a on a.tel_hash = pr.tel_hash
       and a.data_agendada >= pr.data_cadastro::date and a.data_agendada <= d.fim
     group by pr.tel_hash, pr.pessoa, pr.unidade_nome
  ),
  tot as (
    select pessoa, unidade_nome, count(*) filter (where compareceu) as comp,
           count(*) filter (where agendado) as agendados, count(*) filter (where compareceu_corte) as comp_corte
      from marcados group by 1, 2
  )
  select p.pessoa, p.unidade_nome, count(*), coalesce(max(tot.comp), 0), coalesce(max(tot.agendados), 0), coalesce(max(tot.comp_corte), 0), (select corte from d)
    from p left join tot on tot.pessoa = p.pessoa and tot.unidade_nome = p.unidade_nome
   group by p.pessoa, p.unidade_nome
$$;
