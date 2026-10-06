# Funil Espaçolaser

Painel do funil comercial das unidades (Paulista, Medon, Tivoli), substituindo a planilha
"Gestão - V2". React + TypeScript + Vite + Tailwind + Supabase.

## Telas

| Tela | O que faz |
|---|---|
| **Painel** | Por unidade ou todas: leads e agendamentos criados por atendente, avaliações, presenças, vendas de avaliação, R$ avaliação e R$ total — dia a dia, com linhas Realizado / Meta / Restante / Meta por dia / Tendência. Indicadores, funil meta × realizado × tendência e gráfico de vendas acumuladas × ritmo da meta. |
| **Importar** | Envie as exportações (.xlsx ou .csv) de Leads, Agendamentos, Vendas, Vendas por vendedor (o mês é escolhido na conferência, pois o relatório não tem data) e Cancelamentos — ou a planilha inteira. Cada aba é reconhecida pelos cabeçalhos. Reimportar atualiza (não duplica). |
| **Metas** | Por unidade e mês: meta de leads, agendamentos, taxas de comparecimento e conversão, ticket médio, share, meta de faturamento, super meta e calendário de dias úteis. |
| **Premiações** | Cálculo mensal dos prêmios (planilha "Cálculo Premiações - Padrão"): status Meta/Super por unidade e da rede (gerente), prêmios por faixa de vendas, agendamentos e captações (consultoras), tabela das aplicadoras, % para subgerente e gerente, funcionário do mês, garantido de R$ 300 para consultora sem prêmio (pode ser retirado) e valores fixos de exceção. Regras editáveis na aba Regras. Exporta CSV. |
| **Cancelamento** | Calculadora de cancelamento (planilha "Cálculo Cancelamento"): vários contratos por cliente, cada um com parcelas, parcelas pagas, sessões para cálculo e multa próprios; áreas com valor e sessões feitas. Mostra total pago, saldo utilizado, multa e saldo devido (ou valor a devolver) e copia um resumo em texto. O último cálculo fica salvo no navegador. |
| **Cadastros** | Unidades (nome do estabelecimento como na exportação), **Equipe** (pessoa, função, unidade ou rede, valor fixo e o de/para dos usuários do sistema que ela usa — vale para o painel e para as premiações; lista os usuários sem vínculo) e e-mails com acesso. |

## Instalação

1. Crie um projeto no Supabase.
2. No **SQL Editor**, rode os arquivos de `supabase/migrations/` em ordem (o primeiro já cria as 3 unidades, a equipe inicial e as metas de junho/2026 da planilha; o segundo cria equipe/de-para e premiações).
3. Copie `.env.example` para `.env` e preencha com a URL e a chave *publishable* (Project Settings → API).
4. `npm install` e `npm run dev` → http://localhost:5173
5. Clique em **Criar conta** com um e-mail cadastrado em `membros` (a migration já inclui o do administrador). Outros usuários são liberados em Cadastros → Usuários.
6. Em **Importar**, envie a planilha antiga ou as exportações do mês.

Publicar: Vercel, build `npm run build`, pasta `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Regras de cálculo (iguais à planilha, com as correções abaixo)

- **Leads**: por atendente (coluna Atendente) e estabelecimento, pela data de cadastro. Leads de atendentes não cadastradas aparecem na coluna "Outros".
- **Agendamentos criados**: por "Usuário de Criação" e data de criação, em qualquer unidade (como na planilha).
- **Avaliações**: agendamentos da unidade pela data agendada; **presenças** = status Finalizado ou Presente.
- **Venda de avaliação**: origem INDIQUE AMIGO ou FACEBOOK / INSTAGRAM (`ORIGENS_AVALIACAO` em `src/lib/painel.ts`); quantidade = vendas com valor líquido > 0.
- **Metas**: leads e agendamentos divididos igualmente entre as atendentes que participam da meta; presenças = agendamentos × comparecimento; vendas = presenças × conversão; R$ avaliação = vendas × ticket; R$ total = meta de faturamento (ou R$ avaliação ÷ share).
- **Meta/dia** = restante ÷ dias úteis de hoje até o fim do mês. **Tendência** = realizado ÷ dias úteis já passados (sem hoje) × dias úteis do mês.
- Dias úteis: segunda a sábado; feriados e domingos abertos são ajustados em Metas.

Diferenças em relação à planilha:
- Filtra pelo **mês**, não só pelo dia (a planilha somava agendamentos de julho no dia 1º de junho).
- Remove registros repetidos pelo ID (a planilha de junho tinha 20 vendas do dia 19 coladas duas vezes).
- Não guarda nome, CPF, telefone nem e-mail de clientes. Agendamentos, que não têm ID na exportação, são identificados por um hash.

## Premiações

- **Cancelamentos** de vendas feitas há mais de 1 ano antes do cancelamento não descontam das vendas da unidade.
- **Faixa** = vendas líquidas da pessoa ÷ 10.000. Acima da última faixa da tabela, paga a última faixa (a planilha zerava).
- **Agendamentos** = criados no mês pelo usuário (Usuário de Criação); **captações** = leads cadastrados no mês pelo usuário.
- O prêmio só é pago se **Bateu meta** estiver marcado. Funcionário do mês só conta no status Super.
- A **gerente** fica na Equipe como Rede (sem unidade) e ganha % sobre o líquido das unidades, com o status da Rede.
