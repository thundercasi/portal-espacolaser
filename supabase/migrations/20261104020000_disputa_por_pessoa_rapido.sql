-- =====================================================================
-- Ranking das consultoras mais rápido: o de/para é resolvido uma vez por
-- unidade + usuário + dia, e não para cada lead.
-- =====================================================================
create or replace function public.ranking_disputa(p_disputa uuid)
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
  -- de/para uma vez por unidade + usuário + dia (não por lead)
  quem as (
    select x.unidade_id, x.atendente, x.dia, public.colaborador_na_rede(x.unidade_id, x.atendente, x.dia) as colab
      from (select distinct l.unidade_id, l.atendente, l.data_cadastro::date as dia from l) x
  ),
  p as (
    select l.*, coalesce(c.nome, l.atendente) as pessoa, public.normalizar(coalesce(c.nome, l.atendente)) as chave
      from l
      join quem q on q.unidade_id = l.unidade_id and q.atendente = l.atendente and q.dia = l.data_cadastro::date
      left join public.colaboradores c on c.id = q.colab
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
