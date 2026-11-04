// Equipe por mês: unidade, função e "ativa" de cada pessoa valem a partir de um mês, até a próxima
// mudança (colaborador_vigencias). Os vínculos do cadastro (do_cadastro) seguem a mesma ideia.
import type { Colaborador, ColaboradorUsuario, Vigencia } from './types'

/** YYYY-MM (ou YYYY-MM-DD) → YYYY-MM-01 */
export const mesInicio = (mes: string) => `${mes.slice(0, 7)}-01`
/** último dia do mês anterior a YYYY-MM-01 */
export const fimDoMesAnterior = (ini: string) => {
  const [a, m] = ini.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10)
}

/**
 * A equipe como estava no mês: cada pessoa com a unidade, função e ativa da última vigência até ele.
 * Quem só passa a existir depois (sem vigência até o mês) fica de fora.
 */
export function equipeNoMes(colaboradores: Colaborador[], vigencias: Vigencia[], mes: string): Colaborador[] {
  const ini = mesInicio(mes)
  const ultima = new Map<string, Vigencia>()
  for (const v of vigencias) {
    if (v.mes > ini) continue
    const atual = ultima.get(v.colaborador_id)
    if (!atual || v.mes > atual.mes) ultima.set(v.colaborador_id, v)
  }
  return colaboradores.flatMap((c) => {
    const v = ultima.get(c.id)
    return v ? [{ ...c, unidade_id: v.unidade_id, funcao: v.funcao, ativo: v.ativo }] : []
  })
}

/** vínculo do cadastro (lista "Usuários no sistema") que vale no mês */
export const vinculoNoMes = (u: ColaboradorUsuario, mes: string) => {
  const ini = mesInicio(mes)
  return u.do_cadastro && (!u.vigente_de || u.vigente_de <= ini) && (!u.vigente_ate || u.vigente_ate >= ini)
}
