-- =====================================================================
-- Premiações só para leitura: usuário de Consulta com ver_premiacoes lê os
-- dados da tela de Premiações (sem poder alterar nada). Precisa ver as 3
-- unidades (o prêmio da gerente é calculado sobre a soma delas).
-- =====================================================================
alter table public.membros add column ver_premiacoes boolean not null default false;

create or replace function public.ve_premiacoes() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m
                  where m.email = lower(auth.jwt() ->> 'email') and (m.perfil = 'admin' or m.ver_premiacoes))
$$;

do $$
declare t text;
begin
  foreach t in array array['vendas_vendedor', 'cancelamentos', 'premiacao_regras', 'premiacao_status', 'premiacao_ajustes', 'colaboradores'] loop
    execute format('create policy "premiacoes_select" on public.%I for select to authenticated using ((select public.ve_premiacoes()))', t);
  end loop;
end $$;
