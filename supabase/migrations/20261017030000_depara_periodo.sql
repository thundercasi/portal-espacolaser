-- =====================================================================
-- De/para com período e vendas por vendedor com data
-- =====================================================================

-- ---------------------------------------------------------------------
-- De/para: o mesmo usuário pode ser de pessoas diferentes em períodos
-- diferentes (ex.: "karina andrade" = Ana Carolina de 01 a 12/10 e
-- Karina a partir de 13/10). Sem datas = vínculo permanente.
-- ---------------------------------------------------------------------
alter table public.colaborador_usuarios drop constraint colaborador_usuarios_pkey;
alter table public.colaborador_usuarios add column id uuid not null default gen_random_uuid() primary key;
alter table public.colaborador_usuarios add column vigente_de date;
alter table public.colaborador_usuarios add column vigente_ate date;
alter table public.colaborador_usuarios add constraint colaborador_usuarios_periodo_check
  check (vigente_de is null or vigente_ate is null or vigente_ate >= vigente_de);
-- um único vínculo permanente por usuário e unidade
create unique index colaborador_usuarios_permanente_uk on public.colaborador_usuarios (unidade_id, usuario)
  where vigente_de is null and vigente_ate is null;

-- ---------------------------------------------------------------------
-- Vendas por vendedor por dia (Data de Pagamento). Relatório sem data:
-- dia = 1º dia do mês escolhido e sem_data = true.
-- ---------------------------------------------------------------------
alter table public.vendas_vendedor add column dia date;
alter table public.vendas_vendedor add column sem_data boolean not null default false;
update public.vendas_vendedor set dia = mes, sem_data = true;
alter table public.vendas_vendedor alter column dia set not null;
alter table public.vendas_vendedor drop constraint vendas_vendedor_pkey;
alter table public.vendas_vendedor add primary key (dia, estabelecimento, vendedor);
alter table public.vendas_vendedor add constraint vendas_vendedor_mes_check check (mes = date_trunc('month', dia)::date);
