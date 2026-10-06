// Leitura das exportações do sistema (Leads, Agendamentos, Vendas, Vendas por vendedor, Cancelamentos).
// As colunas são localizadas pelo nome do cabeçalho, então a ordem não importa
// e colunas extras (ex.: "Dia", "Mês" da planilha antiga) são ignoradas.
import { parseNum } from './format'

export type Tipo = 'leads' | 'agendamentos' | 'vendas' | 'vendas_vendedor' | 'cancelamentos'
type Celula = string | number | boolean | Date | null | undefined
type Linhas = Celula[][]

export interface LeadRow {
  id_lead: number; data_cadastro: string; estabelecimento: string; atendente: string | null
  midia: string | null; status: string | null; motivo_descarte: string | null; indicacao: boolean | null
}
export interface AgendamentoRow {
  chave: string; estabelecimento: string; data_agendada: string; data_criacao: string
  usuario_criacao: string | null; origem_cliente: string | null; status: string | null
}
export interface VendaRow {
  id_orcamento: number; data_pagamento: string; estabelecimento: string; origem_midia: string | null
  tipo: string | null; contrato_assinado: string | null; valor_bruto: number; valor_desconto: number; valor_liquido: number
}
/** relatório de vendas por vendedor: sem data — o mês é escolhido na importação */
export interface VendaVendedorRow {
  estabelecimento: string; vendedor: string; perfil: string | null; cargo: string | null
  valor_bruto: number; valor_desconto: number; valor_liquido: number
}
export interface CancelamentoRow {
  orcamento: string; item: string; status: string | null; data_cancelamento: string; data_venda: string | null
  valor_cancelado: number; valor_total: number; estabelecimento: string; vendedor: string | null
  usuario_cancelamento: string | null; motivo: string | null
}

export type Lote =
  | { tipo: 'leads'; origem: string; linhas: LeadRow[]; ignoradas: number; periodo: [string, string] | null }
  | { tipo: 'agendamentos'; origem: string; linhas: AgendamentoRow[]; ignoradas: number; periodo: [string, string] | null }
  | { tipo: 'vendas'; origem: string; linhas: VendaRow[]; ignoradas: number; periodo: [string, string] | null }
  | { tipo: 'vendas_vendedor'; origem: string; linhas: VendaVendedorRow[]; ignoradas: number; periodo: null }
  | { tipo: 'cancelamentos'; origem: string; linhas: CancelamentoRow[]; ignoradas: number; periodo: [string, string] | null }

// cabeçalhos obrigatórios (normalizados) que identificam cada tipo
const COLUNAS: Record<Tipo, Record<string, string>> = {
  leads: {
    id: 'id lead', data: 'data cadastro', estab: 'estabelecimento', atendente: 'atendente',
    midia: 'midia', status: 'status', motivo: 'motivo do descarte', indicacao: 'e indicacao',
  },
  agendamentos: {
    estab: 'estabelecimento', agendada: 'data agendada', criacao: 'data de criacao', cliente: 'cliente',
    telefone: 'telefone', usuario: 'usuario de criacao', origem: 'origem cliente', status: 'status',
  },
  vendas: {
    id: 'id orc', data: 'data de pagamento', estab: 'estabelecimento', origem: 'origem midia', tipo: 'tipo',
    assinado: 'contrato assinado', bruto: 'v bruto', desconto: 'v desconto', liquido: 'v liquido',
  },
  vendas_vendedor: {
    estab: 'estabelecimento', vendedor: 'vendedor', perfil: 'perfil', cargo: 'cargo',
    bruto: 'v bruto', desconto: 'v desconto', liquido: 'v liquido',
  },
  cancelamentos: {
    orcamento: 'orcamento', item: 'item', status: 'status', data: 'data cancelamento', venda: 'data venda',
    cancelado: 'valor cancelado', total: 'valor total', estab: 'estabelecimento venda', vendedor: 'nome do vendedor',
    usuario: 'usuario canc', motivo: 'motivo cancelamento',
  },
}
const OBRIGATORIAS: Record<Tipo, string[]> = {
  leads: ['id', 'data', 'estab'],
  agendamentos: ['estab', 'agendada', 'criacao', 'status'],
  vendas: ['id', 'data', 'estab', 'liquido'],
  vendas_vendedor: ['estab', 'vendedor', 'liquido'],
  cancelamentos: ['orcamento', 'data', 'cancelado', 'estab'],
}
// ordem de detecção: do mais específico para o mais genérico
const ORDEM: Tipo[] = ['vendas', 'cancelamentos', 'vendas_vendedor', 'agendamentos', 'leads']
export const NOME_COLUNA: Record<Tipo, Record<string, string>> = {
  leads: { id: 'Id Lead', data: 'Data Cadastro', estab: 'Estabelecimento' },
  agendamentos: { estab: 'Estabelecimento', agendada: 'Data Agendada', criacao: 'Data de Criação', status: 'Status' },
  vendas: { id: 'ID Orç.', data: 'Data de Pagamento', estab: 'Estabelecimento', liquido: 'V. Líquido' },
  vendas_vendedor: { estab: 'Estabelecimento', vendedor: 'Vendedor', liquido: 'V. Líquido' },
  cancelamentos: { orcamento: 'Orçamento', data: 'Data Cancelamento', cancelado: 'Valor Cancelado', estab: 'Estabelecimento Venda' },
}

export const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()

const txt = (v: Celula) => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Converte célula em [ano, mês, dia, hora, min]. Aceita Date, serial do Excel e "dd/mm/aaaa hh:mm". */
function partesData(v: Celula): [number, number, number, number, number] | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes()]
  }
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400000) // serial do Excel → epoch
    return partesData(new Date(ms))
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return [ano, Number(m[2]), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)]
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{2}):(\d{2}))?/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)]
  if (/^\d+(\.\d+)?$/.test(s)) return partesData(Number(s))
  return null
}
export const paraData = (v: Celula) => {
  const p = partesData(v)
  return p ? `${p[0]}-${pad(p[1])}-${pad(p[2])}` : null
}
export const paraDataHora = (v: Celula) => {
  const p = partesData(v)
  return p ? `${p[0]}-${pad(p[1])}-${pad(p[2])}T${pad(p[3])}:${pad(p[4])}:00` : null
}

const paraBool = (v: Celula) => {
  const s = normalizar(v)
  if (!s) return null
  return ['1', 'sim', 's', 'true', 'verdadeiro'].includes(s)
}

const paraInt = (v: Celula) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\D/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** procura, nas primeiras linhas, um cabeçalho que tenha as colunas obrigatórias de algum tipo */
export function detectar(linhas: Linhas): { tipo: Tipo; linhaCabecalho: number; idx: Record<string, number> } | null {
  for (let r = 0; r < Math.min(linhas.length, 10); r++) {
    const cab = (linhas[r] ?? []).map(normalizar)
    for (const tipo of ORDEM) {
      const idx: Record<string, number> = {}
      for (const [k, nome] of Object.entries(COLUNAS[tipo])) {
        const i = cab.indexOf(nome)
        if (i >= 0) idx[k] = i
      }
      if (OBRIGATORIAS[tipo].every((k) => k in idx)) return { tipo, linhaCabecalho: r, idx }
    }
  }
  return null
}

/**
 * Quando nenhuma aba é reconhecida: o tipo que chegou mais perto e as colunas obrigatórias que faltaram
 * (ex.: relatório de vendas exportado sem "Data de Pagamento").
 */
export function diagnosticar(linhas: Linhas): { tipo: Tipo; faltando: string[] } | null {
  let melhor: { tipo: Tipo; faltando: string[]; achou: number } | null = null
  for (let r = 0; r < Math.min(linhas.length, 10); r++) {
    const cab = (linhas[r] ?? []).map(normalizar)
    for (const tipo of ORDEM) {
      const obrig = OBRIGATORIAS[tipo]
      const faltando = obrig.filter((k) => !cab.includes(COLUNAS[tipo][k]))
      const achou = obrig.length - faltando.length
      if (achou >= 2 && faltando.length && (!melhor || achou > melhor.achou))
        melhor = { tipo, faltando: faltando.map((k) => NOME_COLUNA[tipo][k] ?? k), achou }
    }
  }
  return melhor && { tipo: melhor.tipo, faltando: melhor.faltando }
}

const periodoDe = (datas: string[]): [string, string] | null => {
  if (!datas.length) return null
  let a = datas[0], b = datas[0]
  for (const d of datas) { if (d < a) a = d; if (d > b) b = d }
  return [a.slice(0, 10), b.slice(0, 10)]
}

export async function lerLinhas(linhas: Linhas, origem: string): Promise<Lote | null> {
  const det = detectar(linhas)
  if (!det) return null
  const { tipo, linhaCabecalho, idx } = det
  const corpo = linhas.slice(linhaCabecalho + 1)
  const c = (row: Celula[], k: string) => (k in idx ? row[idx[k]] : null)
  let ignoradas = 0

  if (tipo === 'leads') {
    const mapa = new Map<number, LeadRow>()
    for (const row of corpo) {
      const id = paraInt(c(row, 'id')), data = paraDataHora(c(row, 'data')), estab = txt(c(row, 'estab'))
      if (!id || !data || !estab) { if (row.some((v) => v != null && v !== '')) ignoradas++; continue }
      mapa.set(id, {
        id_lead: id, data_cadastro: data, estabelecimento: estab, atendente: txt(c(row, 'atendente')),
        midia: txt(c(row, 'midia')), status: txt(c(row, 'status')), motivo_descarte: txt(c(row, 'motivo')),
        indicacao: paraBool(c(row, 'indicacao')),
      })
    }
    const out = [...mapa.values()]
    return { tipo, origem, linhas: out, ignoradas, periodo: periodoDe(out.map((l) => l.data_cadastro)) }
  }

  if (tipo === 'agendamentos') {
    const mapa = new Map<string, AgendamentoRow>()
    for (const row of corpo) {
      const estab = txt(c(row, 'estab')), agendada = paraData(c(row, 'agendada')), criacao = paraData(c(row, 'criacao'))
      if (!estab || !agendada || !criacao) { if (row.some((v) => v != null && v !== '')) ignoradas++; continue }
      const usuario = txt(c(row, 'usuario'))
      const chave = await sha256([estab, agendada, criacao, normalizar(c(row, 'cliente')), normalizar(c(row, 'telefone')), usuario ?? ''].join('|'))
      mapa.set(chave, {
        chave, estabelecimento: estab, data_agendada: agendada, data_criacao: criacao,
        usuario_criacao: usuario, origem_cliente: txt(c(row, 'origem')), status: txt(c(row, 'status')),
      })
    }
    const out = [...mapa.values()]
    return { tipo, origem, linhas: out, ignoradas, periodo: periodoDe(out.flatMap((a) => [a.data_agendada, a.data_criacao])) }
  }

  if (tipo === 'vendas_vendedor') {
    // um vendedor pode vir em mais de uma linha na mesma unidade: soma
    const mapa = new Map<string, VendaVendedorRow>()
    for (const row of corpo) {
      const estab = txt(c(row, 'estab')), vendedor = txt(c(row, 'vendedor'))
      if (!estab || !vendedor) { if (row.some((v) => v != null && v !== '')) ignoradas++; continue }
      const k = `${estab}|${vendedor}`
      const atual = mapa.get(k)
      const bruto = parseNum(c(row, 'bruto') as string | number), desconto = parseNum(c(row, 'desconto') as string | number)
      const liquido = parseNum(c(row, 'liquido') as string | number)
      if (atual) { atual.valor_bruto += bruto; atual.valor_desconto += desconto; atual.valor_liquido += liquido }
      else mapa.set(k, {
        estabelecimento: estab, vendedor, perfil: txt(c(row, 'perfil')), cargo: txt(c(row, 'cargo')),
        valor_bruto: bruto, valor_desconto: desconto, valor_liquido: liquido,
      })
    }
    return { tipo, origem, linhas: [...mapa.values()], ignoradas, periodo: null }
  }

  if (tipo === 'cancelamentos') {
    const mapa = new Map<string, CancelamentoRow>()
    for (const row of corpo) {
      const orcamento = txt(c(row, 'orcamento')), data = paraData(c(row, 'data')), estab = txt(c(row, 'estab'))
      if (!orcamento || !data || !estab) { if (row.some((v) => v != null && v !== '')) ignoradas++; continue }
      const item = txt(c(row, 'item')) ?? ''
      mapa.set(`${orcamento}|${item}`, {
        orcamento, item, status: txt(c(row, 'status')), data_cancelamento: data, data_venda: paraData(c(row, 'venda')),
        valor_cancelado: parseNum(c(row, 'cancelado') as string | number), valor_total: parseNum(c(row, 'total') as string | number),
        estabelecimento: estab, vendedor: txt(c(row, 'vendedor')), usuario_cancelamento: txt(c(row, 'usuario')),
        motivo: txt(c(row, 'motivo')),
      })
    }
    const out = [...mapa.values()]
    return { tipo, origem, linhas: out, ignoradas, periodo: periodoDe(out.map((x) => x.data_cancelamento)) }
  }

  const mapa = new Map<number, VendaRow>()
  for (const row of corpo) {
    const id = paraInt(c(row, 'id')), data = paraData(c(row, 'data')), estab = txt(c(row, 'estab'))
    if (!id || !data || !estab) { if (row.some((v) => v != null && v !== '')) ignoradas++; continue }
    mapa.set(id, {
      id_orcamento: id, data_pagamento: data, estabelecimento: estab, origem_midia: txt(c(row, 'origem')),
      tipo: txt(c(row, 'tipo')), contrato_assinado: txt(c(row, 'assinado')),
      valor_bruto: parseNum(c(row, 'bruto') as string | number), valor_desconto: parseNum(c(row, 'desconto') as string | number),
      valor_liquido: parseNum(c(row, 'liquido') as string | number),
    })
  }
  const out = [...mapa.values()]
  return { tipo, origem, linhas: out, ignoradas, periodo: periodoDe(out.map((v) => v.data_pagamento)) }
}

/** CSV com ; ou , e aspas */
export function lerCSV(texto: string): Linhas {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : primeira.includes('\t') ? '\t' : ','
  const linhas: Linhas = []
  let row: string[] = [], campo = '', aspas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) { row.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      row.push(campo); linhas.push(row); row = []; campo = ''
    } else campo += ch
  }
  if (campo || row.length) { row.push(campo); linhas.push(row) }
  return linhas
}
