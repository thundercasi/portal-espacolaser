export interface Unidade {
  id: string
  nome: string
  estabelecimento: string
  ordem: number
  ativo: boolean
}

export interface Atendente {
  id: string
  unidade_id: string
  nome_sistema: string
  apelido: string
  participa_meta: boolean
  ativo: boolean
  ordem: number
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
  tipo: 'leads' | 'agendamentos' | 'vendas'
  linhas: number
  periodo_ini: string | null
  periodo_fim: string | null
  usuario: string | null
  created_at: string
}
