export interface Unidade {
  id: string
  nome: string
  estabelecimento: string
  ordem: number
  ativo: boolean
}

export type Funcao = 'Consultora' | 'Aplicadora' | 'Subgerente' | 'Gerente' | 'Outro'
export const FUNCOES: Funcao[] = ['Consultora', 'Aplicadora', 'Subgerente', 'Gerente', 'Outro']

/** pessoa da equipe; unidade_id null = rede (ex.: gerente das 3 unidades) */
export interface Colaborador {
  id: string
  unidade_id: string | null
  nome: string
  funcao: Funcao
  no_painel: boolean
  participa_meta: boolean
  valor_fixo: number
  ativo: boolean
  ordem: number
}

/** de/para: usuário que aparece nas exportações (normalizado) → pessoa, por unidade */
export interface ColaboradorUsuario {
  unidade_id: string
  usuario: string
  colaborador_id: string
}

export interface Meta {
  unidade_id: string
  mes: string // YYYY-MM-01
  meta_leads: number
  meta_agendamentos: number
  taxa_comparecimento: number
  taxa_conversao: number
  ticket_medio: number
  share_avaliacoes: number
  meta_faturamento: number
  super_meta: number
  dias_nao_uteis: number[]
  dias_uteis_extra: number[]
}

/** linha devolvida pela função painel_diario */
export interface LinhaPainel {
  metrica: 'leads' | 'agend_criados' | 'avaliacoes' | 'vendas'
  estabelecimento: string
  pessoa: string
  dia: number
  qtd: number
  valor: number
}

export interface Importacao {
  id: string
  arquivo: string
  tipo: 'leads' | 'agendamentos' | 'vendas' | 'vendas_vendedor' | 'cancelamentos'
  linhas: number
  periodo_ini: string | null
  periodo_fim: string | null
  usuario: string | null
  created_at: string
}
