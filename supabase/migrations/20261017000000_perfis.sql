-- =====================================================================
-- Perfis de acesso
--   admin    → acessa e altera tudo
--   consulta → só lê o necessário para o Painel do funil
-- =====================================================================

alter table public.membros add column perfil text not null default 'admin' check (perfil in ('admin','consulta'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.email = lower(auth.jwt() ->> 'email') and m.perfil = 'admin')
$$;

-- perfil de quem está logado (null = sem acesso)
create or replace function public.meu_perfil() returns text
language sql stable security definer set search_path = '' as $$
  select m.perfil from public.membros m where m.email = lower(auth.jwt() ->> 'email')
$$;

do $$
declare t text;
begin
  -- todas as tabelas: só administrador altera (e lê as que não são do painel)
  foreach t in array array[
    'membros','unidades','metas','leads','agendamentos','vendas','importacoes',
    'colaboradores','colaborador_usuarios','vendas_vendedor','cancelamentos',
    'premiacao_regras','premiacao_status','premiacao_ajustes'
  ] loop
    execute format('drop policy if exists "membros_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;

  -- tabelas que o Painel lê: qualquer usuário com acesso pode ler
  foreach t in array array[
    'unidades','metas','leads','agendamentos','vendas','importacoes','colaboradores','colaborador_usuarios'
  ] loop
    execute format('create policy "membros_select" on public.%I for select to authenticated using ((select public.is_membro()))', t);
  end loop;
end $$;
