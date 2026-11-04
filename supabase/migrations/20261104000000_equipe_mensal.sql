-- =====================================================================
-- Equipe por mês: unidade (ou Rede), função e "ativa" de cada pessoa passam
-- a valer a partir de um mês, até a próxima mudança. Meses anteriores ficam
-- como estavam (o histórico das premiações não muda ao reorganizar a equipe).
-- Os vínculos de usuário do cadastro (do_cadastro) também passam a ter
-- vigência por mês; os vínculos com período em dias continuam como estão.
-- =====================================================================
create table public.colaborador_vigencias (
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  mes            date not null check (extract(day from mes) = 1),
  unidade_id     uuid references public.unidades(id) on delete cascade,   -- null = Rede
  funcao         text not null check (funcao in ('Consultora','Aplicadora','Subgerente','Gerente','Outro')),
  ativo          boolean not null default true,
  primary key (colaborador_id, mes)
);
alter table public.colaborador_vigencias enable row level security;
create policy "admin_all" on public.colaborador_vigencias for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "membros_select" on public.colaborador_vigencias for select to authenticated using ((select public.is_membro()));

-- situação atual vale desde sempre (ponto de partida)
insert into public.colaborador_vigencias (colaborador_id, mes, unidade_id, funcao, ativo)
select id, '2000-01-01', unidade_id, funcao, ativo from public.colaboradores;

-- vínculos do cadastro (lista "Usuários no sistema"): vigência por mês, mais recente vence.
-- Os sem datas de hoje viram "desde sempre".
alter table public.colaborador_usuarios add column do_cadastro boolean not null default false;
update public.colaborador_usuarios set do_cadastro = true where vigente_de is null and vigente_ate is null;
drop index public.colaborador_usuarios_permanente_uk;
create unique index colaborador_usuarios_cadastro_uk on public.colaborador_usuarios (unidade_id, usuario, coalesce(vigente_de, date '1900-01-01'))
  where do_cadastro;

-- configuração da pessoa num dia (a do mês: última vigência até ele)
create or replace function public.colaborador_no_mes(p_colaborador uuid, p_data date)
returns table (unidade_id uuid, funcao text, ativo boolean)
language sql stable security invoker set search_path = '' as $$
  select v.unidade_id, v.funcao, v.ativo from public.colaborador_vigencias v
   where v.colaborador_id = p_colaborador and v.mes <= p_data
   order by v.mes desc limit 1
$$;

-- De/para (mesma regra de src/lib/depara.ts), só com pessoas ativas no mês:
--  1. vínculo com período em dias que cobre a data (o mais curto);
--  2. vínculo do cadastro que cobre a data (o de início mais recente);
--  3. pessoa da unidade, no mês, com o mesmo nome do usuário.
create or replace function public.colaborador_de(p_unidade uuid, p_usuario text, p_data date)
returns uuid
language sql stable security invoker set search_path = '' as $$
  with cand as (
    select cu.colaborador_id, cu.do_cadastro, cu.vigente_de, cu.vigente_ate
      from public.colaborador_usuarios cu
     where cu.unidade_id = p_unidade and cu.usuario = public.normalizar(p_usuario)
       and (cu.vigente_de is null or cu.vigente_de <= p_data)
       and (cu.vigente_ate is null or cu.vigente_ate >= p_data)
       and coalesce((select m.ativo from public.colaborador_no_mes(cu.colaborador_id, p_data) m), false)
  )
  select coalesce(
    (select colaborador_id from cand where not do_cadastro
      order by coalesce(vigente_ate, date '9999-12-31') - coalesce(vigente_de, date '1900-01-01') limit 1),
    (select colaborador_id from cand where do_cadastro
      order by coalesce(vigente_de, date '1900-01-01') desc limit 1),
    (select c.id from public.colaboradores c
       cross join lateral public.colaborador_no_mes(c.id, p_data) m
      where m.ativo and m.unidade_id = p_unidade and public.normalizar(c.nome) = public.normalizar(p_usuario)
      limit 1))
$$;

-- Ranking das aplicadoras: função da pessoa no mês da venda
create or replace function public.ranking_vendas_aplicadoras(p_disputa uuid)
returns table (participante text, unidade text, funcao text, vendas bigint, valor numeric, cancelado numeric)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim from public.disputas where id = p_disputa and public.is_membro()
  ),
  p as (
    select u.nome as unidade_nome, v.vendedor as usuario, v.id_orcamento, v.valor_liquido, v.data_pagamento,
           coalesce(t.colaborador_id, public.colaborador_de(u.id, v.vendedor, v.data_pagamento)) as colab
      from public.vendas v
      join d on v.data_pagamento between d.inicio and d.fim
      join public.unidades u on u.estabelecimento = v.estabelecimento
      left join public.vendas_transferidas t on t.id_orcamento = v.id_orcamento and t.vendedor = v.vendedor
     where v.vendedor <> ''
  ),
  pf as (
    select p.*, (select m.funcao from public.colaborador_no_mes(p.colab, p.data_pagamento) m) as funcao from p
  )
  select coalesce(c.nome, min(pf.usuario)), pf.unidade_nome, max(pf.funcao),
         count(distinct pf.id_orcamento) filter (where pf.valor_liquido > 0),
         coalesce(sum(pf.valor_liquido) filter (where pf.valor_liquido > 0), 0),
         coalesce(-sum(pf.valor_liquido) filter (where pf.valor_liquido < 0), 0)
    from pf left join public.colaboradores c on c.id = pf.colab
   where pf.funcao = 'Aplicadora' or (c.id is null and public.is_admin())
   group by c.id, c.nome, pf.unidade_nome, case when c.id is null then public.normalizar(pf.usuario) end
$$;
