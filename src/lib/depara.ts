// De/para: de quem é um usuário (das exportações) numa unidade e numa data.
import { normalizar } from './importar'
import type { Colaborador, ColaboradorUsuario } from './types'

/**
 * Regra, em ordem:
 *  1. vínculo com período que cobre a data (se houver mais de um, o de período mais curto);
 *  2. vínculo permanente (sem datas);
 *  3. pessoa da unidade com o mesmo nome do usuário.
 * `data` = YYYY-MM-DD.
 */
export function criarResolvedor(colaboradores: Colaborador[], usuarios: ColaboradorUsuario[]) {
  const ativos = new Map(colaboradores.filter((c) => c.ativo).map((c) => [c.id, c]))
  const porChave = new Map<string, ColaboradorUsuario[]>()
  for (const u of usuarios) {
    const k = `${u.unidade_id}|${u.usuario}`
    porChave.set(k, [...(porChave.get(k) ?? []), u])
  }
  const duracao = (u: ColaboradorUsuario) =>
    (u.vigente_ate ? Date.parse(u.vigente_ate) : 8.64e15) - (u.vigente_de ? Date.parse(u.vigente_de) : -8.64e15)

  return (unidadeId: string, usuario: string, data: string): Colaborador | null => {
    const nome = normalizar(usuario)
    const vinculos = porChave.get(`${unidadeId}|${nome}`) ?? []
    const comPeriodo = vinculos
      .filter((u) => (u.vigente_de || u.vigente_ate) && (!u.vigente_de || u.vigente_de <= data) && (!u.vigente_ate || u.vigente_ate >= data))
      .sort((a, b) => duracao(a) - duracao(b))
    const escolhido = comPeriodo[0] ?? vinculos.find((u) => !u.vigente_de && !u.vigente_ate)
    if (escolhido) return ativos.get(escolhido.colaborador_id) ?? null
    for (const c of ativos.values()) if (c.unidade_id === unidadeId && normalizar(c.nome) === nome) return c
    return null
  }
}
