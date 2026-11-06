-- =====================================================================
-- Status "Hiper" nas premiações: a subgerente tem taxa própria (padrão 1,2%,
-- editável em Premiações → Regras); para os demais vale como Super.
-- =====================================================================
alter table public.premiacao_status drop constraint premiacao_status_status_check;
alter table public.premiacao_status add constraint premiacao_status_status_check
  check (status in ('Nenhum', 'Meta', 'Super', 'Hiper'));
