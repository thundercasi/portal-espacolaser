import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import type { Unidade } from '../lib/types'
import Equipe from '../components/Equipe'
import { ErrorBox, PageHeader } from '../components/ui'

export default function Cadastros() {
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div>
      <PageHeader title="Cadastros" subtitle="Unidades, equipe (com de/para de usuários) e acessos" />
      <ErrorBox msg={erro} />
      <div className="space-y-6">
        <Unidades setErro={setErro} />
        <Equipe setErro={setErro} />
        <Usuarios setErro={setErro} />
      </div>
    </div>
  )
}

type SetErro = { setErro: (s: string | null) => void }

function Unidades({ setErro }: SetErro) {
  const { unidades, reloadCadastros } = useApp()
  const [novo, setNovo] = useState({ nome: '', estabelecimento: '' })

  async function salvar(id: string, patch: Partial<Unidade>) {
    const { error } = await supabase.from('unidades').update(patch).eq('id', id)
    setErro(error?.message ?? null); reloadCadastros()
  }
  async function adicionar() {
    if (!novo.nome || !novo.estabelecimento) return
    const { error } = await supabase.from('unidades').insert({ ...novo, ordem: unidades.length + 1 })
    setErro(error?.message ?? null)
    if (!error) setNovo({ nome: '', estabelecimento: '' })
    reloadCadastros()
  }

  return (
    <section className="card overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold">Unidades</div>
        <p className="text-xs text-slate-500">O "estabelecimento" precisa ser idêntico ao que aparece nas exportações.</p>
      </div>
      <table className="w-full">
        <thead className="bg-slate-50"><tr><th className="th">Nome</th><th className="th">Estabelecimento (exportação)</th><th className="th w-20">Ordem</th><th className="th w-20">Ativa</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {unidades.map((u) => (
            <tr key={u.id}>
              <td className="td"><input className="input" defaultValue={u.nome} onBlur={(e) => e.target.value !== u.nome && salvar(u.id, { nome: e.target.value })} /></td>
              <td className="td"><input className="input min-w-80" defaultValue={u.estabelecimento} onBlur={(e) => e.target.value !== u.estabelecimento && salvar(u.id, { estabelecimento: e.target.value.trim() })} /></td>
              <td className="td"><input type="number" className="input w-16" defaultValue={u.ordem} onBlur={(e) => Number(e.target.value) !== u.ordem && salvar(u.id, { ordem: Number(e.target.value) })} /></td>
              <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={u.ativo} onChange={(e) => salvar(u.id, { ativo: e.target.checked })} /></td>
            </tr>
          ))}
          <tr className="bg-slate-50/50">
            <td className="td"><input className="input" placeholder="Nova unidade" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></td>
            <td className="td"><input className="input min-w-80" placeholder="SP - CIDADE - BAIRRO" value={novo.estabelecimento} onChange={(e) => setNovo({ ...novo, estabelecimento: e.target.value })} /></td>
            <td className="td" colSpan={2}><button className="btn-primary" onClick={adicionar}><Plus size={16} /> Adicionar</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function Usuarios({ setErro }: SetErro) {
  const { session } = useApp()
  const [lista, setLista] = useState<{ email: string }[]>([])
  const [email, setEmail] = useState('')
  const carregar = () => supabase.from('membros').select('email').order('email').then(({ data }) => setLista(data ?? []))
  useEffect(() => { carregar() }, [])

  async function adicionar() {
    const e = email.trim().toLowerCase()
    if (!e.includes('@')) return
    const { error } = await supabase.from('membros').insert({ email: e })
    setErro(error?.message ?? null)
    if (!error) setEmail('')
    carregar()
  }
  async function remover(e: string) {
    if (!confirm(`Remover o acesso de ${e}?`)) return
    const { error } = await supabase.from('membros').delete().eq('email', e)
    setErro(error?.message ?? null); carregar()
  }

  return (
    <section className="card">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold">Usuários com acesso</div>
        <p className="text-xs text-slate-500">A pessoa cria a conta na tela de login com um destes e-mails. Todos veem e editam os mesmos dados.</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {lista.map((m) => (
          <li key={m.email} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{m.email}</span>
            {m.email !== session?.user.email?.toLowerCase() && (
              <button className="btn-danger p-1.5" onClick={() => remover(m.email)} aria-label="Remover"><Trash2 size={16} /></button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2 border-t border-slate-100 p-4">
        <input className="input max-w-sm" type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
        <button className="btn-primary" onClick={adicionar}><Plus size={16} /> Adicionar</button>
      </div>
    </section>
  )
}
