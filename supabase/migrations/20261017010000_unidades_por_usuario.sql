-- =====================================================================
-- Unidades visíveis por usuário (perfil Consulta)
--   membros.unidades = null → todas as unidades
--   administrador sempre vê todas
-- =====================================================================

alter table public.membros add column unidades uuid[];

create or replace function public.pode_ver_unidade(p_unidade uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
     where m.email = lower(auth.jwt() ->> 'email')
       and (m.perfil = 'admin' or m.unidades is null or p_unidade = any (m.unidades))
  )
$$;

create or replace function public.pode_ver_estabelecimento(p_estab text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
     where m.email = lower(auth.jwt() ->> 'email')
       and (m.perfil = 'admin' or m.unidades is null
            or exists (select 1 from public.unidades u where u.estabelecimento = p_estab and u.id = any (m.unidades)))
  )
$$;

-- leitura do Painel limitada às unidades do usuário
drop policy "membros_select" on public.unidades;
create policy "membros_select" on public.unidades for select to authenticated
  using (public.pode_ver_unidade(id));

drop policy "membros_select" on public.metas;
create policy "membros_select" on public.metas for select to authenticated
  using (public.pode_ver_unidade(unidade_id));

drop policy "membros_select" on public.colaboradores;
create policy "membros_select" on public.colaboradores for select to authenticated
  using (unidade_id is not null and public.pode_ver_unidade(unidade_id));

drop policy "membros_select" on public.colaborador_usuarios;
create policy "membros_select" on public.colaborador_usuarios for select to authenticated
  using (public.pode_ver_unidade(unidade_id));

drop policy "membros_select" on public.leads;
create policy "membros_select" on public.leads for select to authenticated
  using (public.pode_ver_estabelecimento(estabelecimento));

drop policy "membros_select" on public.agendamentos;
create policy "membros_select" on public.agendamentos for select to authenticated
  using (public.pode_ver_estabelecimento(estabelecimento));

drop policy "membros_select" on public.vendas;
create policy "membros_select" on public.vendas for select to authenticated
  using (public.pode_ver_estabelecimento(estabelecimento));
