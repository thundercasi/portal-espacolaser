-- =====================================================================
-- Disputa entre colaboradoras: leads captados que compareceram à avaliação.
-- Lead e avaliação são ligados pelo telefone do cliente, guardado só como
-- hash (tel_hash) — o telefone em si não é armazenado.
-- =====================================================================
alter table public.leads add column tel_hash text;
alter table public.agendamentos add column tel_hash text;
create index leads_tel_hash_idx on public.leads (tel_hash);
create index agendamentos_tel_hash_idx on public.agendamentos (tel_hash);

create table public.disputas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  premio     text,
  inicio     date not null,
  fim        date not null check (fim >= inicio),
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.disputas enable row level security;
create policy "admin_all" on public.disputas for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "membros_select" on public.disputas for select to authenticated using ((select public.is_membro()));

insert into public.disputas (nome, premio, inicio, fim)
values ('Disputa de comparecimentos', 'iPhone 16 Pro Max', '2026-10-01', '2026-11-30');

-- ---------------------------------------------------------------------
-- Ranking (security definer: devolve só totais por pessoa, então quem tem
-- acesso restrito a uma unidade também vê o ranking das 3 unidades).
-- Pessoa do lead = de/para da Equipe na data do cadastro (vínculo com período,
-- depois permanente, depois nome igual); sem cadastro, o próprio usuário.
-- Ponto = cliente (telefone) captado no período, atribuído a quem o captou
-- primeiro, com avaliação Finalizada/Presente entre o cadastro e o fim.
-- ---------------------------------------------------------------------
create or replace function public.ranking_disputa(p_disputa uuid)
returns table (participante text, unidade text, leads bigint, comparecimentos bigint)
language sql stable security definer set search_path = '' as $$
  with d as (
    select inicio, fim from public.disputas where id = p_disputa and public.is_membro()
  ),
  l as (
    select l.data_cadastro, l.atendente, l.tel_hash, u.id as unidade_id, u.nome as unidade_nome
      from public.leads l
      join d on l.data_cadastro >= d.inicio and l.data_cadastro < d.fim + 1
      join public.unidades u on u.estabelecimento = l.estabelecimento
     where coalesce(l.atendente, '') <> '' and public.normalizar(l.atendente) not like 'administrador%'
  ),
  p as (
    select l.*, coalesce(
      (select c.nome from public.colaborador_usuarios cu join public.colaboradores c on c.id = cu.colaborador_id
        where cu.unidade_id = l.unidade_id and cu.usuario = public.normalizar(l.atendente)
          and (cu.vigente_de is not null or cu.vigente_ate is not null)
          and (cu.vigente_de is null or cu.vigente_de <= l.data_cadastro::date)
          and (cu.vigente_ate is null or cu.vigente_ate >= l.data_cadastro::date)
        order by coalesce(cu.vigente_ate, date '9999-12-31') - coalesce(cu.vigente_de, date '1900-01-01')
        limit 1),
      (select c.nome from public.colaborador_usuarios cu join public.colaboradores c on c.id = cu.colaborador_id
        where cu.unidade_id = l.unidade_id and cu.usuario = public.normalizar(l.atendente)
          and cu.vigente_de is null and cu.vigente_ate is null
        limit 1),
      (select c.nome from public.colaboradores c
        where c.unidade_id = l.unidade_id and public.normalizar(c.nome) = public.normalizar(l.atendente)
        limit 1),
      l.atendente) as pessoa
    from l
  ),
  primeiro as (
    select distinct on (p.tel_hash) p.tel_hash, p.pessoa, p.unidade_nome, p.data_cadastro
      from p where p.tel_hash is not null
     order by p.tel_hash, p.data_cadastro
  ),
  comp as (
    select pr.pessoa, pr.unidade_nome, count(*) as n
      from primeiro pr, d
     where exists (
       select 1 from public.agendamentos a
        where a.tel_hash = pr.tel_hash
          and lower(a.status) in ('finalizado', 'presente')
          and a.data_agendada >= pr.data_cadastro::date and a.data_agendada <= d.fim)
     group by 1, 2
  )
  select p.pessoa, p.unidade_nome, count(*), coalesce(max(comp.n), 0)
    from p left join comp on comp.pessoa = p.pessoa and comp.unidade_nome = p.unidade_nome
   group by p.pessoa, p.unidade_nome
$$;
