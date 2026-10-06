import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { normalizar } from '../lib/importar'
import { addMeses, hojeISO, inicioMes, mesAtual } from '../lib/format'
import { FUNCOES, type Colaborador, type Funcao } from '../lib/types'

const REDE = 'rede'
const separar = (texto: string) => [...new Set(texto.split(/[,;\n]/).map(normalizar).filter(Boolean))]

/** Cadastro da equipe com o de/para de usuários do sistema (usado pelo painel e pelas premiações). */
export default function Equipe({ setErro }: { setErro: (s: string | null) => void }) {
  const { unidades, colaboradores, usuarios, reloadCadastros } = useApp()
  const [sel, setSel] = useState('')
  const [novo, setNovo] = useState({ nome: '', funcao: 'Consultora' as Funcao, usuarios: '' })
  const [semVinculo, setSemVinculo] = useState<{ usuario: string; origens: string; qtd: number }[]>([])
  const unidadeId = sel || unidades[0]?.id || ''
  const rede = unidadeId === REDE
  const unidade = unidades.find((u) => u.id === unidadeId)
  const lista = colaboradores.filter((c) => (rede ? !c.unidade_id : c.unidade_id === unidadeId))
  const usuariosDe = (c: Colaborador) => usuarios.filter((u) => u.colaborador_id === c.id).map((u) => u.usuario).sort()

  // usuários que aparecem nos dados desta unidade nos últimos 2 meses e ainda não têm dono
  useEffect(() => {
    let vivo = true
    if (!unidade) { setSemVinculo([]); return }
    const nomes = new Set(colaboradores.filter((c) => c.unidade_id === unidade.id).map((c) => normalizar(c.nome)))
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
  }, [unidade, usuarios, colaboradores])

  async function salvar(id: string, patch: Partial<Colaborador>) {
    const { error } = await supabase.from('colaboradores').update(patch).eq('id', id)
    setErro(error?.message ?? null); reloadCadastros()
  }
  async function salvarUsuarios(c: Colaborador, texto: string) {
    if (!c.unidade_id) return
    const novos = separar(texto).sort()
    if (novos.join('|') === usuariosDe(c).join('|')) return
    const del = await supabase.from('colaborador_usuarios').delete().eq('colaborador_id', c.id)
    if (del.error) { setErro(del.error.message); return }
    if (novos.length) {
      const { error } = await supabase.from('colaborador_usuarios').upsert(novos.map((usuario) => ({ unidade_id: c.unidade_id, usuario, colaborador_id: c.id })))
      setErro(error?.message ?? null)
    }
    reloadCadastros()
  }
  async function vincular(usuario: string, colaboradorId: string) {
    if (!unidade || !colaboradorId) return
    const { error } = await supabase.from('colaborador_usuarios').upsert({ unidade_id: unidade.id, usuario: normalizar(usuario), colaborador_id: colaboradorId })
    setErro(error?.message ?? null); reloadCadastros()
  }
  async function adicionar(nome: string, funcao: Funcao, usuariosTexto: string) {
    if (!nome.trim()) return
    const { data, error } = await supabase.from('colaboradores').insert({
      unidade_id: rede ? null : unidadeId, nome: nome.trim(), funcao, ordem: lista.length + 1, no_painel: funcao === 'Consultora',
    }).select('id').single()
    if (error) { setErro(error.message); return }
    const us = separar(usuariosTexto)
    if (!rede && us.length) {
      const r = await supabase.from('colaborador_usuarios').upsert(us.map((usuario) => ({ unidade_id: unidadeId, usuario, colaborador_id: data.id })))
      if (r.error) { setErro(r.error.message); return }
    }
    setErro(null); setNovo({ nome: '', funcao: 'Consultora', usuarios: '' })
    reloadCadastros()
  }
  async function remover(c: Colaborador) {
    if (!confirm(`Remover ${c.nome}? Os ajustes de premiação dela também serão apagados. Para só tirar dos cálculos, desmarque "Ativa".`)) return
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
            contam para a pessoa no painel e nas premiações. Separe vários usuários por vírgula; maiúsculas e acentos não importam.
            A gerente das 3 unidades fica em <b>Rede</b>.
          </p>
        </div>
        <select className="input w-48" value={unidadeId} onChange={(e) => setSel(e.target.value)}>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          <option value={REDE}>Rede (sem unidade)</option>
        </select>
      </div>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Nome</th>
            <th className="th">Função</th>
            {!rede && <th className="th">Usuários no sistema</th>}
            <th className="th" title="Aparece como coluna no painel do funil">No painel</th>
            <th className="th" title="Entra na divisão da meta de leads/agendamentos do funil">Meta funil</th>
            <th className="th" title="Prêmio fixo mensal, para exceções (ex.: limpeza)">Valor fixo</th>
            <th className="th w-16">Ordem</th>
            <th className="th">Ativa</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lista.map((c) => (
            <tr key={c.id} className={c.ativo ? '' : 'opacity-50'}>
              <td className="td"><input className="input min-w-44" defaultValue={c.nome} onBlur={(e) => e.target.value.trim() !== c.nome && salvar(c.id, { nome: e.target.value.trim() })} /></td>
              <td className="td">
                <select className="input" value={c.funcao} onChange={(e) => salvar(c.id, { funcao: e.target.value as Funcao })}>
                  {FUNCOES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </td>
              {!rede && (
                <td className="td">
                  <input key={usuariosDe(c).join(',')} className="input min-w-64" placeholder="ex.: karina andrade"
                    defaultValue={usuariosDe(c).join(', ')} onBlur={(e) => salvarUsuarios(c, e.target.value)} />
                </td>
              )}
              <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={c.no_painel} onChange={(e) => salvar(c.id, { no_painel: e.target.checked })} /></td>
              <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={c.participa_meta} onChange={(e) => salvar(c.id, { participa_meta: e.target.checked })} /></td>
              <td className="td">
                <input type="number" step="0.01" className="input w-24" placeholder="0" defaultValue={c.valor_fixo || ''}
                  onBlur={(e) => Number(e.target.value || 0) !== c.valor_fixo && salvar(c.id, { valor_fixo: Number(e.target.value || 0) })} />
              </td>
              <td className="td"><input type="number" className="input w-16" defaultValue={c.ordem} onBlur={(e) => Number(e.target.value) !== c.ordem && salvar(c.id, { ordem: Number(e.target.value) })} /></td>
              <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={c.ativo} onChange={(e) => salvar(c.id, { ativo: e.target.checked })} /></td>
              <td className="td text-right"><button className="btn-danger p-1.5" onClick={() => remover(c)} aria-label="Remover"><Trash2 size={16} /></button></td>
            </tr>
          ))}
          <tr className="bg-slate-50/50">
            <td className="td"><input className="input min-w-44" placeholder="Nome da pessoa" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></td>
            <td className="td">
              <select className="input" value={novo.funcao} onChange={(e) => setNovo({ ...novo, funcao: e.target.value as Funcao })}>
                {FUNCOES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </td>
            {!rede && (
              <td className="td"><input className="input min-w-64" placeholder="usuários, separados por vírgula" value={novo.usuarios} onChange={(e) => setNovo({ ...novo, usuarios: e.target.value })} /></td>
            )}
            <td className="td" colSpan={6}><button className="btn-primary" onClick={() => adicionar(novo.nome, novo.funcao, novo.usuarios)}><Plus size={16} /> Adicionar</button></td>
          </tr>
        </tbody>
      </table>

      {!rede && semVinculo.length > 0 && (
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-semibold text-amber-800">Usuários sem vínculo nos últimos 2 meses</div>
          <p className="mb-2 text-xs text-slate-500">Aparecem nos dados desta unidade, mas não estão ligados a ninguém. Vincule a uma pessoa ou crie a pessoa.</p>
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
