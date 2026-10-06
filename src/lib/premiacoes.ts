// Cálculo das premiações — espelha a planilha "Cálculo Premiações - Padrão.xlsx".
import { normalizar } from './importar'
import type { Colaborador, ColaboradorUsuario, Unidade } from './types'

export type Status = 'Nenhum' | 'Meta' | 'Super'
export const STATUS: Status[] = ['Nenhum', 'Meta', 'Super']

interface PremiosConsultora { captacoes: number; agendamentos: number; vendas: number }
export interface Regras {
  limiteCaptacoes: number
  limiteAgendamentos: number
  garantidoConsultora: number
  subgerente: { Meta: number; Super: number }
  gerente: { Meta: number; Super: number }
  consultora: { faixa: number; Meta: PremiosConsultora; Super: PremiosConsultora }[]
  aplicadora: { faixa: number; Meta: number; Super: number }[]
}

export interface Ajuste { bateu_meta: boolean; func_mes: number; sem_garantido: boolean; observacao: string | null }
export const ajustePadrao: Ajuste = { bateu_meta: false, func_mes: 0, sem_garantido: false, observacao: null }

export interface VendaVendedor { estabelecimento: string; vendedor: string; valor_liquido: number }
export interface Cancelamento { estabelecimento: string; data_cancelamento: string; data_venda: string | null; valor_cancelado: number }
/** contagem por estabelecimento + usuário (leads = captações; agendamentos = criados no mês) */
export interface Contagem { estabelecimento: string; usuario: string; leads: number; agendamentos: number }

export interface LinhaPremio {
  colaborador: Colaborador
  vendas: number
  faixa: number
  faixaAcimaDaTabela: boolean
  agendamentos: number
  captacoes: number
  premioAgendamentos: number
  premioCaptacoes: number
  premioVendas: number
  funcMes: number
  calculado: number   // soma dos prêmios se bateu a meta individual
  garantido: number   // consultora sem prêmio de meta
  fixo: number        // valor fixo mensal (exceções)
  total: number
  ajuste: Ajuste
}

export interface BlocoUnidade {
  unidade: Unidade | null // null = rede
  status: Status
  vendas: number
  cancelamentos: number
  cancelamentosIgnorados: number // venda com mais de 1 ano antes do cancelamento
  liquido: number
  linhas: LinhaPremio[]
  semVinculo: { usuario: string; vendas: number; leads: number; agendamentos: number }[]
  total: number
}

/** venda feita há mais de 1 ano antes do cancelamento → não desconta */
export function cancelamentoConta(c: Cancelamento) {
  if (!c.data_venda) return true
  const [a, m, d] = c.data_cancelamento.split('-').map(Number)
  const limite = `${a - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return c.data_venda >= limite
}

function linhaDaFaixa<T extends { faixa: number }>(tabela: T[], faixa: number): { linha: T | null; acima: boolean } {
  if (!tabela.length) return { linha: null, acima: false }
  const exata = tabela.find((t) => t.faixa === faixa)
  if (exata) return { linha: exata, acima: false }
  const maior = tabela.reduce((a, b) => (b.faixa > a.faixa ? b : a))
  // a planilha zerava acima da última faixa; aqui paga a última faixa da tabela
  if (faixa > maior.faixa) return { linha: maior, acima: true }
  return { linha: null, acima: false }
}

export function calcularPremiacoes(args: {
  unidades: Unidade[]
  colaboradores: Colaborador[]
  usuarios: ColaboradorUsuario[]
  regras: Regras
  status: Map<string, Status> // chave: unidade_id ou 'rede'
  ajustes: Map<string, Ajuste> // chave: colaborador_id
  vendas: VendaVendedor[]
  cancelamentos: Cancelamento[]
  contagens: Contagem[]
}): { blocos: BlocoUnidade[]; total: number } {
  const { unidades, colaboradores, usuarios, regras, status, ajustes, vendas, cancelamentos, contagens } = args
  const ativos = colaboradores.filter((c) => c.ativo)

  // descobre a pessoa de um usuário dentro da unidade: de/para ou, sem de/para, nome igual
  const pessoa = (unidadeId: string, usuario: string) => {
    const u = normalizar(usuario)
    const v = usuarios.find((x) => x.unidade_id === unidadeId && x.usuario === u)
    if (v) return ativos.find((c) => c.id === v.colaborador_id) ?? null
    return ativos.find((c) => c.unidade_id === unidadeId && normalizar(c.nome) === u) ?? null
  }

  const montarLinha = (c: Colaborador, st: Status, base: number, v: number, ag: number, cap: number): LinhaPremio => {
    const ajuste = ajustes.get(c.id) ?? ajustePadrao
    const faixa = Math.floor(v / 10000)
    let pAg = 0, pCap = 0, pVen = 0, acima = false
    if (st !== 'Nenhum') {
      if (c.funcao === 'Consultora' || c.funcao === 'Aplicadora' || c.funcao === 'Subgerente') {
        const { linha, acima: a } = linhaDaFaixa(regras.consultora, faixa)
        if (c.funcao === 'Consultora') {
          acima = a
          if (linha && ag >= regras.limiteAgendamentos) pAg = linha[st].agendamentos
          if (linha) pVen = linha[st].vendas
        }
        // como na planilha, o prêmio de captações não depende da função
        if (linha && cap >= regras.limiteCaptacoes) pCap = linha[st].captacoes
      }
      if (c.funcao === 'Aplicadora') {
        const { linha, acima: a } = linhaDaFaixa(regras.aplicadora, faixa)
        acima = a
        if (linha) pVen = linha[st]
      }
      if (c.funcao === 'Subgerente') pVen = base * regras.subgerente[st]
      if (c.funcao === 'Gerente') pVen = base * regras.gerente[st]
    }
    const funcMes = st === 'Super' ? Number(ajuste.func_mes) || 0 : 0
    const calculado = ajuste.bateu_meta ? pAg + pCap + pVen + funcMes : 0
    const garantido = c.funcao === 'Consultora' && calculado === 0 && !ajuste.sem_garantido ? regras.garantidoConsultora : 0
    const fixo = Number(c.valor_fixo) || 0
    return {
      colaborador: c, vendas: v, faixa, faixaAcimaDaTabela: acima, agendamentos: ag, captacoes: cap,
      premioAgendamentos: pAg, premioCaptacoes: pCap, premioVendas: pVen, funcMes,
      calculado, garantido, fixo, total: calculado + garantido + fixo, ajuste,
    }
  }

  const blocos: BlocoUnidade[] = []
  for (const u of unidades) {
    const est = normalizar(u.estabelecimento)
    const st = status.get(u.id) ?? 'Nenhum'
    const vendasU = vendas.filter((x) => normalizar(x.estabelecimento) === est)
    const cancU = cancelamentos.filter((x) => normalizar(x.estabelecimento) === est)
    const totalVendas = vendasU.reduce((s, x) => s + Number(x.valor_liquido), 0)
    const canc = cancU.filter(cancelamentoConta).reduce((s, x) => s + Number(x.valor_cancelado), 0)
    const ignorados = cancU.filter((x) => !cancelamentoConta(x)).reduce((s, x) => s + Number(x.valor_cancelado), 0)
    const liquido = totalVendas - canc

    // soma vendas, leads e agendamentos por pessoa; o que não tem dono vai para "sem vínculo"
    const porPessoa = new Map<string, { v: number; l: number; a: number }>()
    const sem = new Map<string, { usuario: string; vendas: number; leads: number; agendamentos: number }>()
    const somar = (usuario: string, v: number, l: number, a: number) => {
      const p = pessoa(u.id, usuario)
      if (p) {
        const t = porPessoa.get(p.id) ?? { v: 0, l: 0, a: 0 }
        t.v += v; t.l += l; t.a += a
        porPessoa.set(p.id, t)
      } else {
        const k = normalizar(usuario)
        const t = sem.get(k) ?? { usuario, vendas: 0, leads: 0, agendamentos: 0 }
        t.vendas += v; t.leads += l; t.agendamentos += a
        sem.set(k, t)
      }
    }
    for (const x of vendasU) somar(x.vendedor, Number(x.valor_liquido), 0, 0)
    for (const x of contagens.filter((x) => normalizar(x.estabelecimento) === est)) somar(x.usuario, 0, Number(x.leads), Number(x.agendamentos))

    const daUnidade = ativos.filter((c) => c.unidade_id === u.id).sort((a, b) => a.ordem - b.ordem)
    const linhas = daUnidade.map((c) => {
      const t = porPessoa.get(c.id) ?? { v: 0, l: 0, a: 0 }
      return montarLinha(c, st, liquido, t.v, t.a, t.l)
    })
    blocos.push({
      unidade: u, status: st, vendas: totalVendas, cancelamentos: canc, cancelamentosIgnorados: ignorados, liquido, linhas,
      semVinculo: [...sem.values()].filter((x) => x.vendas || x.leads || x.agendamentos).sort((a, b) => b.vendas - a.vendas),
      total: linhas.reduce((s, l) => s + l.total, 0),
    })
  }

  // rede: pessoas sem unidade (ex.: gerente), sobre a soma das unidades
  const daRede = ativos.filter((c) => !c.unidade_id).sort((a, b) => a.ordem - b.ordem)
  if (daRede.length) {
    const st = status.get('rede') ?? 'Nenhum'
    const vendasT = blocos.reduce((s, b) => s + b.vendas, 0)
    const cancT = blocos.reduce((s, b) => s + b.cancelamentos, 0)
    const ignT = blocos.reduce((s, b) => s + b.cancelamentosIgnorados, 0)
    const liquido = vendasT - cancT
    const linhas = daRede.map((c) => montarLinha(c, st, liquido, 0, 0, 0))
    blocos.push({
      unidade: null, status: st, vendas: vendasT, cancelamentos: cancT, cancelamentosIgnorados: ignT, liquido, linhas,
      semVinculo: [], total: linhas.reduce((s, l) => s + l.total, 0),
    })
  }

  return { blocos, total: blocos.reduce((s, b) => s + b.total, 0) }
}
