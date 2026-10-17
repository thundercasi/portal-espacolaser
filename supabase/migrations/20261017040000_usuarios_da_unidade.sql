-- Usuários do sistema que já interagiram com a unidade (leads, agendamentos criados,
-- vendas por vendedor), para a lista de seleção do de/para em Cadastros → Equipe.
--   chave   = usuário normalizado (como fica gravado no de/para)
--   usuario = uma das grafias originais, para exibição
create or replace function public.usuarios_da_unidade(p_unidade uuid)
returns table (chave text, usuario text, qtd bigint)
language sql stable security invoker set search_path = '' as $$
  with u as (select estabelecimento from public.unidades where id = p_unidade),
  dados as (
    select l.atendente as usuario from public.leads l join u on l.estabelecimento = u.estabelecimento where l.atendente is not null
    union all
    select a.usuario_criacao from public.agendamentos a join u on a.estabelecimento = u.estabelecimento where a.usuario_criacao is not null
    union all
    select v.vendedor from public.vendas_vendedor v join u on v.estabelecimento = u.estabelecimento
  )
  select public.normalizar(d.usuario), min(d.usuario), count(*)
    from dados d
   where public.normalizar(d.usuario) <> ''
   group by 1
   order by 3 desc
$$;
