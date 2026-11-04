// De/para: de quem é um usuário (das exportações) numa unidade e numa data.
import { normalizar } from './importar'
import type { Colaborador, ColaboradorUsuario } from './types'

/**
 * Regra, em ordem (mesma de public.colaborador_de), só com pessoas ativas:
 *  1. vínculo com período em dias que cobre a data (se houver mais de um, o de período mais curto);
 *  2. vínculo do cadastro que cobre a data (o de início mais recente: vale do mês escolhido em diante);
 *  3. pessoa da unidade com o mesmo nome do usuário.
 * `colaboradores` = a equipe do mês (equipeNoMes), para valer a unidade/ativa daquele mês. `data` = YYYY-MM-DD.
 */
export function criarResolvedor(colaboradores: Colaborador[], usuarios: ColaboradorUsuario[]) {
  const ativos = new Map(colaboradores.filter((c) => c.ativo).map((c) => [c.id, c]))
  const porChave = new Map<string, ColaboradorUsuario[]>()
  for (const u of usuarios) {
    if (!ativos.has(u.colaborador_id)) continue
    const k = `${u.unidade_id}|${u.usuario}`
    porChave.set(k, [...(porChave.get(k) ?? []), u])
  }
  const duracao = (u: ColaboradorUsuario) =>
    (u.vigente_ate ? Date.parse(u.vigente_ate) : 8.64e15) - (u.vigente_de ? Date.parse(u.vigente_de) : -8.64e15)

  return (unidadeId: string, usuario: string, data: string): Colaborador | null => {
    const nome = normalizar(usuario)
    const cobrem = (porChave.get(`${unidadeId}|${nome}`) ?? [])
      .filter((u) => (!u.vigente_de || u.vigente_de <= data) && (!u.vigente_ate || u.vigente_ate >= data))
    const periodo = cobrem.filter((u) => !u.do_cadastro).sort((a, b) => duracao(a) - duracao(b))[0]
    const cadastro = cobrem.filter((u) => u.do_cadastro).sort((a, b) => (b.vigente_de ?? '').localeCompare(a.vigente_de ?? ''))[0]
    const escolhido = periodo ?? cadastro
    if (escolhido) return ativos.get(escolhido.colaborador_id) ?? null
    for (const c of ativos.values()) if (c.unidade_id === unidadeId && normalizar(c.nome) === nome) return c
    return null
  }
}
