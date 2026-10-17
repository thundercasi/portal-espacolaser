-- Pesos das dezenas nas metas: parte da meta do mês em cada dezena
-- (1–10, 11–20, 21–fim; em meses de 31 dias, 1–11, 12–21, 22–31).
-- Padrão = aba Auxiliar da planilha "Gestão - V2".
alter table public.metas add column pesos_dezenas numeric[] not null
  default '{0.29759594535506,0.317992269788348,0.384411784856592}'
  check (array_length(pesos_dezenas, 1) = 3);
