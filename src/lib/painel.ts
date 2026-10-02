// Cálculos do painel — espelham as abas Paulista / Medon / Tivoli da planilha.
import { normalizar } from './importar'
import type { Atendente, LinhaPainel, Meta, Unidade } from './types'

/** origens de mídia que contam como "venda de avaliação" (coluna "Venda Av?" da planilha) */
export const ORIGENS_AVALIACAO = ['INDIQUE AMIGO', 'FACEBOOK / INSTAGRAM']

export interface Coluna { chave: string; apelido: string; participaMeta: boolean }

export interface Indicador {
  realizado: number
  meta: number | null
  restante: number | null
  metaDia: number | null
  tendencia: number | null
}

export interface Painel {
  diasNoMes: number
  util: boolean[]              // índice = dia (1..31)
  diasUteis: number
  diasPassados: number         // úteis antes de hoje (base da tendência)
  diasRestantes: number        // úteis de hoje em diante (base da meta/dia)
  colunas: Coluna[]
  leads: Record<string, number[]>
  agend: Record<string, number[]>
  avaliacoes: number[]
  presencas: number[]
  vendasAvQtd: number[]
  vendasAvValor: number[]
  vendasTotal: number[]
  ind: {
    leads: Record<string, Indicador>
    agend: Record<string, Indicador>
    leadsTotal: Indicador
    agendTotal: Indicador
    avaliacoes: Indicador
    presencas: Indicador
    vendasAvQtd: Indicador
    vendasAvValor: Indicador
    vendasTotal: Indicador
  }
  taxas: {
    agendamento: { meta: number | null; real: number | null }   // avaliações / leads
    comparecimento: { meta: number | null; real: number | null } // presenças / avaliações
    conversao: { meta: number | null; real: number | null }      // vendas av / presenças
    ticket: { meta: number | null; real: number | null }
    share: { meta: number | null; real: number | null }          // vendas av / vendas total
  }
  superMeta: number | null
  temMeta: boolean
}

const soma = (a: number[]) => a.reduce((s, v) => s + v, 0)
const div = (a: number, b: number) => (b ? a / b : null)
const vetor = (n: number) => Array<number>(n + 1).fill(0)

function diasUteisDaUnidade(ano: number, mes: number, meta: Meta | undefined) {
  const n = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const util = Array<boolean>(n + 1).fill(false)
  for (let d = 1; d <= n; d++) {
    const domingo = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 0
    util[d] = (!domingo || !!meta?.dias_uteis_extra.includes(d)) && !meta?.dias_nao_uteis.includes(d)
  }
  return util
}

export function calcularPainel(args: {
  mes: string            // YYYY-MM
  hoje: string           // YYYY-MM-DD
  unidades: Unidade[]
  atendentes: Atendente[]
  metas: Meta[]
  linhas: LinhaPainel[]
}): Painel {
  const { mes, hoje, unidades, atendentes, metas, linhas } = args
  const [ano, m] = mes.split('-').map(Number)
  const n = new Date(Date.UTC(ano, m, 0)).getUTCDate()

  // calendário: dia útil se for útil em pelo menos uma das unidades selecionadas
  const util = Array<boolean>(n + 1).fill(false)
  for (const u of unidades) {
    const cal = diasUteisDaUnidade(ano, m, metas.find((x) => x.unidade_id === u.id))
    cal.forEach((v, d) => { if (v) util[d] = true })
  }
  const diaHoje = hoje.slice(0, 7) === mes ? Number(hoje.slice(8, 10)) : hoje.slice(0, 7) > mes ? n + 1 : 0
  let diasUteis = 0, diasPassados = 0, diasRestantes = 0
  for (let d = 1; d <= n; d++) {
    if (!util[d]) continue
    diasUteis++
    if (d < diaHoje) diasPassados++
    else diasRestantes++
  }

  // colunas de atendentes (mesma pessoa em duas unidades vira uma coluna só)
  const colunas: Coluna[] = []
  const ids = new Set(unidades.map((u) => u.id))
  for (const a of [...atendentes].filter((a) => ids.has(a.unidade_id) && a.ativo).sort((x, y) => x.ordem - y.ordem)) {
    const chave = normalizar(a.nome_sistema)
    const ja = colunas.find((c) => c.chave === chave)
    if (ja) ja.participaMeta ||= a.participa_meta
    else colunas.push({ chave, apelido: a.apelido, participaMeta: a.participa_meta })
  }
  const estabs = new Set(unidades.map((u) => normalizar(u.estabelecimento)))
  const doMes = (l: LinhaPainel) => l.dia >= 1 && l.dia <= n

  const leads: Record<string, number[]> = {}
  const agend: Record<string, number[]> = {}
  for (const c of colunas) { leads[c.chave] = vetor(n); agend[c.chave] = vetor(n) }
  const outrosLeads = vetor(n)
  const avaliacoes = vetor(n), presencas = vetor(n), vendasAvQtd = vetor(n), vendasAvValor = vetor(n), vendasTotal = vetor(n)

  for (const l of linhas.filter(doMes)) {
    const qtd = Number(l.qtd), valor = Number(l.valor)
    const pessoa = normalizar(l.pessoa)
    const daUnidade = estabs.has(normalizar(l.estabelecimento))
    switch (l.metrica) {
      case 'leads':
        if (!daUnidade) break
        if (leads[pessoa]) leads[pessoa][l.dia] += qtd
        else outrosLeads[l.dia] += qtd
        break
      case 'agend_criados': // como na planilha: conta pelo usuário que criou, em qualquer unidade
        if (agend[pessoa]) agend[pessoa][l.dia] += qtd
        break
      case 'avaliacoes':
        if (daUnidade) { avaliacoes[l.dia] += qtd; presencas[l.dia] += valor }
        break
      case 'vendas':
        if (!daUnidade) break
        vendasTotal[l.dia] += valor
        if (l.pessoa === 'AV') { vendasAvQtd[l.dia] += qtd; vendasAvValor[l.dia] += valor }
        break
    }
  }
  if (soma(outrosLeads) > 0) {
    colunas.push({ chave: '__outros', apelido: 'Outros', participaMeta: false })
    leads.__outros = outrosLeads
    agend.__outros = vetor(n)
  }

  // metas (somadas quando há mais de uma unidade)
  const metasSel = metas.filter((x) => ids.has(x.unidade_id))
  const temMeta = metasSel.length > 0
  const tot = (f: (x: Meta) => number) => metasSel.reduce((s, x) => s + f(x), 0)
  const metaLeads = tot((x) => Number(x.meta_leads))
  const metaAgend = tot((x) => Number(x.meta_agendamentos))
  const metaPres = tot((x) => Number(x.meta_agendamentos) * Number(x.taxa_comparecimento))
  const metaVendasQtd = tot((x) => Number(x.meta_agendamentos) * Number(x.taxa_comparecimento) * Number(x.taxa_conversao))
  const metaVendasAv = tot((x) => Number(x.meta_agendamentos) * Number(x.taxa_comparecimento) * Number(x.taxa_conversao) * Number(x.ticket_medio))
  const metaTotal = tot((x) => Number(x.meta_faturamento) > 0
    ? Number(x.meta_faturamento)
    : (Number(x.meta_agendamentos) * Number(x.taxa_comparecimento) * Number(x.taxa_conversao) * Number(x.ticket_medio)) / (Number(x.share_avaliacoes) || 1))
  const superMeta = tot((x) => Number(x.super_meta))

  const indicador = (serie: number[], meta: number | null): Indicador => {
    const realizado = soma(serie)
    const restante = meta == null ? null : meta - realizado
    return {
      realizado,
      meta,
      restante,
      metaDia: restante == null || !diasRestantes ? null : Math.max(restante, 0) / diasRestantes,
      tendencia: diasPassados ? (realizado / diasPassados) * diasUteis : null,
    }
  }
  const participantes = colunas.filter((c) => c.participaMeta).length
  const metaPorPessoa = (total: number, c: Coluna) => (temMeta ? (c.participaMeta && participantes ? total / participantes : 0) : null)

  const leadsTotalSerie = vetor(n), agendTotalSerie = vetor(n)
  for (const c of colunas) for (let d = 1; d <= n; d++) { leadsTotalSerie[d] += leads[c.chave][d]; agendTotalSerie[d] += agend[c.chave][d] }

  const ind = {
    leads: Object.fromEntries(colunas.map((c) => [c.chave, indicador(leads[c.chave], metaPorPessoa(metaLeads, c))])),
    agend: Object.fromEntries(colunas.map((c) => [c.chave, indicador(agend[c.chave], metaPorPessoa(metaAgend, c))])),
    leadsTotal: indicador(leadsTotalSerie, temMeta ? metaLeads : null),
    agendTotal: indicador(agendTotalSerie, temMeta ? metaAgend : null),
    avaliacoes: indicador(avaliacoes, temMeta ? metaAgend : null),
    presencas: indicador(presencas, temMeta ? metaPres : null),
    vendasAvQtd: indicador(vendasAvQtd, temMeta ? metaVendasQtd : null),
    vendasAvValor: indicador(vendasAvValor, temMeta ? metaVendasAv : null),
    vendasTotal: indicador(vendasTotal, temMeta ? metaTotal : null),
  }

  const r = (x: number | null) => (temMeta ? x : null)
  return {
    diasNoMes: n, util, diasUteis, diasPassados, diasRestantes,
    colunas, leads, agend, avaliacoes, presencas, vendasAvQtd, vendasAvValor, vendasTotal, ind,
    taxas: {
      agendamento: { meta: r(div(metaAgend, metaLeads)), real: div(ind.avaliacoes.realizado, ind.leadsTotal.realizado) },
      comparecimento: { meta: r(div(metaPres, metaAgend)), real: div(ind.presencas.realizado, ind.avaliacoes.realizado) },
      conversao: { meta: r(div(metaVendasQtd, metaPres)), real: div(ind.vendasAvQtd.realizado, ind.presencas.realizado) },
      ticket: { meta: r(div(metaVendasAv, metaVendasQtd)), real: div(ind.vendasAvValor.realizado, ind.vendasAvQtd.realizado) },
      share: { meta: r(div(metaVendasAv, metaTotal)), real: div(ind.vendasAvValor.realizado, ind.vendasTotal.realizado) },
    },
    superMeta: temMeta && superMeta > 0 ? superMeta : null,
    temMeta,
  }
}
