import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { normalizar } from '../lib/importar'
import { addMeses, fmtData, hojeISO, inicioMes, mesAtual, nomeMes } from '../lib/format'
import { equipeNoMes, fimDoMesAnterior, mesInicio, vinculoNoMes } from '../lib/equipe'
import { FUNCOES, type Colaborador, type ColaboradorUsuario, type Funcao } from '../lib/types'
import SeletorUsuarios, { type OpcaoUsuario } from './SeletorUsuarios'
import { MonthPicker } from './ui'

const REDE = 'rede'
const separar = (texto: string) => [...new Set(texto.split(/[,;\n]/).map(normalizar).filter(Boolean))]
const DESDE_SEMPRE = '2000-01-01'

/**
 * Cadastro da equipe com o de/para de usuários do sistema (usado pelo painel, premiações e disputas).
 * Unidade, função, ativa e usuários valem do mês escolhido em diante; meses anteriores não mudam.
 */
export default function Equipe({ setErro }: { setErro: (s: string | null) => void }) {
  const { unidades, colaboradores, vigencias, usuarios, reloadCadastros } = useApp()
  const [sel, setSel] = useState('')
  const [mes, setMes] = useState(mesAtual())
  const M = mesInicio(mes)
  const [novo, setNovo] = useState({ nome: '', funcao: 'Consultora' as Funcao, usuarios: [] as string[] })
  const [opcoesPor, setOpcoesPor] = useState<Map<string, OpcaoUsuario[]>>(new Map())
  const [semVinculo, setSemVinculo] = useState<{ usuario: string; origens: string; qtd: number }[]>([])
  const unidadeId = sel || unidades[0]?.id || ''
  const rede = unidadeId === REDE
  const unidade = unidades.find((u) => u.id === unidadeId)
  const opcoes = opcoesPor.get(unidadeId) ?? []
  const equipe = useMemo(() => equipeNoMes(colaboradores, vigencias, mes), [colaboradores, vigencias, mes])
  const lista = equipe.filter((c) => (rede ? !c.unidade_id : c.unidade_id === unidadeId))
  // desde quando vale a configuração mostrada (para indicar mudanças)
  const desde = (c: Colaborador) => vigencias.filter((v) => v.colaborador_id === c.id && v.mes <= M).reduce((a, v) => (v.mes > a ? v.mes : a), '')
  // "Usuários no sistema": vínculos do cadastro que valem no mês; os com período em dias ficam na seção própria
  const usuariosDe = (c: Colaborador, uid: string) =>
    usuarios.filter((u) => u.colaborador_id === c.id && u.unidade_id === uid && vinculoNoMes(u, M)).map((u) => u.usuario).sort()
  const comPeriodo = usuarios.filter((u) => u.unidade_id === unidadeId && !u.do_cadastro)
    .sort((a, b) => a.usuario.localeCompare(b.usuario) || (a.vigente_de ?? '').localeCompare(b.vigente_de ?? ''))
  const [novoPeriodo, setNovoPeriodo] = useState({ usuario: '', colaborador_id: '', de: '', ate: '' })
  // quem já tem o usuário no cadastro desta unidade no mês (para avisar na lista)
  const donoDe = (uid: string, excetoId: string | null) => (chave: string) => {
    const v = usuarios.find((u) => u.unidade_id === uid && u.usuario === chave && vinculoNoMes(u, M) && u.colaborador_id !== excetoId)
    return v ? colaboradores.find((c) => c.id === v.colaborador_id)?.nome ?? null : null
  }

  // usuários com alguma interação com cada unidade (leads, agendamentos, vendas por vendedor)
  useEffect(() => {
    let vivo = true
    Promise.all(unidades.map((u) => supabase.rpc('usuarios_da_unidade', { p_unidade: u.id }).then(({ data, error }) => {
      if (error) setErro(error.message)
      return [u.id, ((data ?? []) as OpcaoUsuario[]).map((o) => ({ ...o, qtd: Number(o.qtd) }))] as const
    }))).then((r) => { if (vivo) setOpcoesPor(new Map(r)) })
    return () => { vivo = false }
  }, [unidades, setErro])

  // usuários que aparecem nos dados desta unidade nos últimos 2 meses e ainda não têm dono
  useEffect(() => {
    let vivo = true
    if (!unidade) { setSemVinculo([]); return }
    const nomes = new Set(equipe.filter((c) => c.unidade_id === unidade.id).map((c) => normalizar(c.nome)))
    supabase.rpc('usuarios_sem_vinculo', { p_ini: addMeses(inicioMes(mesAtual()), -1), p_fim: hojeISO() }).then(({ data }) => {
      if (!vivo) return
      const m = new Map<string, { usuario: string; origens: Set<string>; qtd: number }>()
      for (const r of (data ?? []) as { estabelecimento: string; usuario: string; origem: string; qtd: number }[]) {
        if (normalizar(r.estabelecimento) !== normalizar(unidade.estabelecimento)) continue
        const k = normalizar(r.usuario)
        if (nomes.has(k)) continue // nome igual ao cadastro já casa sem de/para
        const t = m.get(k) ?? { usuario: r.usuario, origens: new Set<string>(), qtd: 0 }
        t.origens.add(r.origem); t.qtd += Number(r.qtd)
        m.set(k, t)
      }
      setSemVinculo([...m.values()].map((x) => ({ usuario: x.usuario, origens: [...x.origens].join(', '), qtd: x.qtd })).sort((a, b) => b.qtd - a.qtd))
    })
    return () => { vivo = false }
  }, [unidade, usuarios, equipe])

  /** campos que não dependem do mês (nome, painel, meta funil, valor fixo, ordem) */
  async function salvar(id: string, patch: Partial<Colaborador>) {
    const { error } = await supabase.from('colaboradores').update(patch).eq('id', id)
    setErro(error?.message ?? null); reloadCadastros()
  }
  /** unidade, função e ativa: valem do mês escolhido em diante */
  async function salvarMes(c: Colaborador, patch: Partial<Pick<Colaborador, 'unidade_id' | 'funcao' | 'ativo'>>) {
    const { error } = await supabase.from('colaborador_vigencias').upsert({
      colaborador_id: c.id, mes: M, unidade_id: c.unidade_id, funcao: c.funcao, ativo: c.ativo, ...patch,
    })
    setErro(error?.message ?? null); reloadCadastros()
  }
  async function mover(c: Colaborador, destino: string) {
    const nomeDestino = destino === REDE ? 'Rede (3 unidades)' : unidades.find((u) => u.id === destino)?.nome ?? ''
    if (!confirm(`Mover ${c.nome} para ${nomeDestino} a partir de ${nomeMes(mes).toLowerCase()}? Os meses anteriores não mudam.`)) return
    await salvarMes(c, { unidade_id: destino === REDE ? null : destino })
  }

  /** tira o vínculo do cadastro a partir do mês: começou antes → termina no mês anterior; senão, some */
  async function encerrar(u: ColaboradorUsuario) {
    const r = u.vigente_de && u.vigente_de >= M
      ? await supabase.from('colaborador_usuarios').delete().eq('id', u.id)
      : await supabase.from('colaborador_usuarios').update({ vigente_ate: fimDoMesAnterior(M) }).eq('id', u.id)
    return r.error?.message ?? null
  }
  /** usuários da pessoa numa unidade, do mês escolhido em diante (cada usuário tem um dono por unidade e mês) */
  async function gravarCadastro(uid: string, colaboradorId: string, lista: string[], substituirDaPessoa: boolean) {
    const validos = usuarios.filter((u) => u.unidade_id === uid && vinculoNoMes(u, M))
    const atuais = validos.filter((u) => u.colaborador_id === colaboradorId)
    if (substituirDaPessoa) {
      for (const u of atuais.filter((u) => !lista.includes(u.usuario))) {
        const e = await encerrar(u)
        if (e) return e
      }
    }
    for (const usuario of lista.filter((x) => !atuais.some((u) => u.usuario === x))) {
      for (const outro of validos.filter((u) => u.usuario === usuario && u.colaborador_id !== colaboradorId)) {
        const e = await encerrar(outro)
        if (e) return e
      }
      const { error } = await supabase.from('colaborador_usuarios').insert({ unidade_id: uid, usuario, colaborador_id: colaboradorId, vigente_de: M, do_cadastro: true })
      if (error) return error.message
    }
    return null
  }
  async function salvarUsuarios(c: Colaborador, uid: string, chaves: string[]) {
    const novos = [...new Set(chaves)].sort()
    if (novos.join('|') === usuariosDe(c, uid).join('|')) return
    setErro(await gravarCadastro(uid, c.id, novos, true))
    reloadCadastros()
  }
  async function vincular(usuario: string, colaboradorId: string) {
    if (!unidade || !colaboradorId) return
    setErro(await gravarCadastro(unidade.id, colaboradorId, [normalizar(usuario)], false)); reloadCadastros()
  }
  async function adicionarPeriodo() {
    const { usuario, colaborador_id, de, ate } = novoPeriodo
    if (!unidade || !normalizar(usuario) || !colaborador_id || (!de && !ate)) { setErro('Informe usuário, pessoa e pelo menos uma das datas.'); return }
    if (de && ate && ate < de) { setErro('A data final é anterior à inicial.'); return }
    const { error } = await supabase.from('colaborador_usuarios').insert({
      unidade_id: unidade.id, usuario: normalizar(usuario), colaborador_id, vigente_de: de || null, vigente_ate: ate || null,
    })
    setErro(error?.message ?? null)
    if (!error) setNovoPeriodo({ usuario: '', colaborador_id: '', de: '', ate: '' })
    reloadCadastros()
  }
  async function removerPeriodo(id: string) {
    const { error } = await supabase.from('colaborador_usuarios').delete().eq('id', id)
    setErro(error?.message ?? null); reloadCadastros()
  }
  /** pessoa nova: passa a existir no mês escolhido */
  async function adicionar(nome: string, funcao: Funcao, usuariosTexto: string) {
    if (!nome.trim()) return
    const uid = rede ? null : unidadeId
    const { data, error } = await supabase.from('colaboradores').insert({
      unidade_id: uid, nome: nome.trim(), funcao, ordem: lista.length + 1, no_painel: funcao === 'Consultora',
    }).select('id').single()
    if (error) { setErro(error.message); return }
    const v = await supabase.from('colaborador_vigencias').insert({ colaborador_id: data.id, mes: M, unidade_id: uid, funcao, ativo: true })
    if (v.error) { setErro(v.error.message); return }
    const us = separar(usuariosTexto)
    if (uid && us.length) {
      const e = await gravarCadastro(uid, data.id, us, false)
      if (e) { setErro(e); return }
    }
    setErro(null); setNovo({ nome: '', funcao: 'Consultora', usuarios: [] })
    reloadCadastros()
  }
  async function remover(c: Colaborador) {
    if (!confirm(`Remover ${c.nome} de TODOS os meses? Os ajustes de premiação dela também serão apagados. Para tirar só a partir de um mês, escolha o mês e desmarque "Ativa".`)) return
    const { error } = await supabase.from('colaboradores').delete().eq('id', c.id)
    setErro(error?.message ?? null); reloadCadastros()
  }

  return (
    <section className="card overflow-x-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="max-w-3xl">
          <div className="text-sm font-semibold">Equipe</div>
          <p className="text-xs text-slate-500">
            Cada pessoa com a função e os <b>usuários do sistema</b> que ela usa (de/para). Leads, agendamentos e vendas desses usuários
            contam para a pessoa no painel, nas premiações e nas disputas. <b>Unidade, função, ativa e usuários valem do mês escolhido em diante</b>;
            os meses anteriores não mudam. A gerente das 3 unidades fica em <b>Rede</b> e pode (ou não) ter usuário em cada unidade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={mes} onChange={setMes} />
          <select className="input w-48" value={unidadeId} onChange={(e) => setSel(e.target.value)}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            <option value={REDE}>Rede (sem unidade)</option>
          </select>
        </div>
      </div>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Nome</th>
            <th className="th">Função</th>
            <th className="th" title="Unidade da pessoa no mês; a gerente das 3 unidades fica em Rede">Unidade</th>
            <th className="th">Usuários no sistema</th>
            <th className="th" title="Aparece como coluna no painel do funil">No painel</th>
            <th className="th" title="Entra na divisão da meta de leads/agendamentos do funil">Meta funil</th>
            <th className="th" title="Prêmio fixo mensal, para exceções (ex.: limpeza)">Valor fixo</th>
            <th className="th w-16">Ordem</th>
            <th className="th">Ativa</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lista.map((c) => {
            const d = desde(c)
            return (
              <tr key={c.id} className={c.ativo ? '' : 'opacity-50'}>
                <td className="td"><input className="input min-w-44" defaultValue={c.nome} onBlur={(e) => e.target.value.trim() !== c.nome && salvar(c.id, { nome: e.target.value.trim() })} /></td>
                <td className="td">
                  <select className="input" value={c.funcao} onChange={(e) => salvarMes(c, { funcao: e.target.value as Funcao })}>
                    {FUNCOES.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </td>
                <td className="td">
                  <select className="input" value={c.unidade_id ?? REDE} onChange={(e) => mover(c, e.target.value)}>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    <option value={REDE}>Rede</option>
                  </select>
                  {d && d !== DESDE_SEMPRE && <div className="mt-0.5 text-[11px] text-slate-500">desde {nomeMes(d.slice(0, 7)).toLowerCase()}</div>}
                </td>
                <td className="td">
                  {rede ? (
                    // pessoa da Rede: usuário opcional em cada unidade
                    <div className="space-y-1">
                      {unidades.map((u) => (
                        <div key={u.id} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-slate-500">{u.nome}</span>
                          <SeletorUsuarios opcoes={opcoesPor.get(u.id) ?? []} valor={usuariosDe(c, u.id)} donoDe={donoDe(u.id, c.id)}
                            onChange={(v) => salvarUsuarios(c, u.id, v)} placeholder="Nenhum" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SeletorUsuarios opcoes={opcoes} valor={usuariosDe(c, unidadeId)} donoDe={donoDe(unidadeId, c.id)} onChange={(v) => salvarUsuarios(c, unidadeId, v)} />
                  )}
                </td>
                <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={c.no_painel} onChange={(e) => salvar(c.id, { no_painel: e.target.checked })} /></td>
                <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={c.participa_meta} onChange={(e) => salvar(c.id, { participa_meta: e.target.checked })} /></td>
                <td className="td">
                  <input type="number" step="0.01" className="input w-24" placeholder="0" defaultValue={c.valor_fixo || ''}
                    onBlur={(e) => Number(e.target.value || 0) !== c.valor_fixo && salvar(c.id, { valor_fixo: Number(e.target.value || 0) })} />
                </td>
                <td className="td"><input type="number" className="input w-16" defaultValue={c.ordem} onBlur={(e) => Number(e.target.value) !== c.ordem && salvar(c.id, { ordem: Number(e.target.value) })} /></td>
                <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={c.ativo} onChange={(e) => salvarMes(c, { ativo: e.target.checked })}
                  title="Vale do mês escolhido em diante" /></td>
                <td className="td text-right"><button className="btn-danger p-1.5" onClick={() => remover(c)} aria-label="Remover"><Trash2 size={16} /></button></td>
              </tr>
            )
          })}
          <tr className="bg-slate-50/50">
            <td className="td"><input className="input min-w-44" placeholder="Nome da pessoa" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></td>
            <td className="td">
              <select className="input" value={novo.funcao} onChange={(e) => setNovo({ ...novo, funcao: e.target.value as Funcao })}>
                {FUNCOES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </td>
            <td className="td text-sm text-slate-500">{rede ? 'Rede' : unidade?.nome}<div className="text-[11px]">a partir de {nomeMes(mes).toLowerCase()}</div></td>
            <td className="td">
              {!rede && <SeletorUsuarios opcoes={opcoes} valor={novo.usuarios} donoDe={donoDe(unidadeId, null)} onChange={(v) => setNovo({ ...novo, usuarios: v })} />}
            </td>
            <td className="td" colSpan={6}><button className="btn-primary" onClick={() => adicionar(novo.nome, novo.funcao, novo.usuarios.join(','))}><Plus size={16} /> Adicionar</button></td>
          </tr>
        </tbody>
      </table>

      {!rede && (
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-semibold">Usuários compartilhados (vínculo por período)</div>
          <p className="mb-2 text-xs text-slate-500">
            Quando uma pessoa usa o usuário de outra por alguns dias. Dentro do período, leads, agendamentos e vendas desse usuário
            contam para a pessoa indicada; fora dele, vale o campo "Usuários no sistema" do mês.
            Deixe "até" vazio para "daqui em diante".
          </p>
          {comPeriodo.length > 0 && (
            <table className="mb-3 w-full">
              <thead className="bg-slate-50"><tr><th className="th">Usuário</th><th className="th">Conta para</th><th className="th">De</th><th className="th">Até</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {comPeriodo.map((u) => (
                  <tr key={u.id}>
                    <td className="td">{opcoes.find((o) => o.chave === u.usuario)?.usuario ?? u.usuario}</td>
                    <td className="td">{colaboradores.find((c) => c.id === u.colaborador_id)?.nome ?? '—'}</td>
                    <td className="td">{u.vigente_de ? fmtData(u.vigente_de) : 'sem início'}</td>
                    <td className="td">{u.vigente_ate ? fmtData(u.vigente_ate) : 'em diante'}</td>
                    <td className="td text-right"><button className="btn-danger p-1.5" onClick={() => removerPeriodo(u.id)} aria-label="Remover vínculo"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="label">Usuário no sistema</span>
              <select className="input w-64" value={novoPeriodo.usuario} onChange={(e) => setNovoPeriodo({ ...novoPeriodo, usuario: e.target.value })}>
                <option value="">Escolha…</option>
                {opcoes.map((o) => <option key={o.chave} value={o.chave}>{o.usuario} ({o.qtd.toLocaleString('pt-BR')})</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Conta para</span>
              <select className="input w-48" value={novoPeriodo.colaborador_id} onChange={(e) => setNovoPeriodo({ ...novoPeriodo, colaborador_id: e.target.value })}>
                <option value="">Escolha…</option>
                {equipe.filter((c) => c.ativo && (c.unidade_id === unidadeId || !c.unidade_id)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">De</span><input type="date" className="input w-40" value={novoPeriodo.de} onChange={(e) => setNovoPeriodo({ ...novoPeriodo, de: e.target.value })} /></label>
            <label className="block"><span className="label">Até</span><input type="date" className="input w-40" value={novoPeriodo.ate} onChange={(e) => setNovoPeriodo({ ...novoPeriodo, ate: e.target.value })} /></label>
            <button className="btn-primary" onClick={adicionarPeriodo}><Plus size={16} /> Adicionar vínculo</button>
          </div>
        </div>
      )}

      {!rede && semVinculo.length > 0 && (
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-semibold text-amber-800">Usuários sem vínculo nos últimos 2 meses</div>
          <p className="mb-2 text-xs text-slate-500">Aparecem nos dados desta unidade, mas não estão ligados a ninguém. Vincule a uma pessoa (a partir do mês escolhido) ou crie a pessoa.</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {semVinculo.map((s) => (
              <li key={s.usuario} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-56 font-medium">{s.usuario}</span>
                <span className="text-xs text-slate-500">{s.qtd} registros ({s.origens})</span>
                <span className="ml-auto flex items-center gap-2">
                  <select className="input w-48" defaultValue="" onChange={(e) => vincular(s.usuario, e.target.value)}>
                    <option value="" disabled>Vincular a…</option>
                    {lista.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <button className="btn-ghost px-2 py-1" onClick={() => adicionar(s.usuario, 'Consultora', s.usuario)}><Plus size={15} /> Criar pessoa</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
