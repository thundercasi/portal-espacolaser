import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { criarContaDeLogin, supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import type { Unidade } from '../lib/types'
import Equipe from '../components/Equipe'
import TransferirVendas from '../components/TransferirVendas'
import { ErrorBox, PageHeader } from '../components/ui'

export default function Cadastros() {
  const [erro, setErro] = useState<string | null>(null)
  return (
    <div>
      <PageHeader title="Cadastros" subtitle="Unidades, equipe (com de/para de usuários), transferência de vendas e acessos" />
      <ErrorBox msg={erro} />
      <div className="space-y-6">
        <Unidades setErro={setErro} />
        <Equipe setErro={setErro} />
        <TransferirVendas setErro={setErro} />
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

type Perfil = 'admin' | 'consulta'
const PERFIS: { valor: Perfil; nome: string; descricao: string }[] = [
  { valor: 'admin', nome: 'Administrador', descricao: 'acessa e altera tudo' },
  { valor: 'consulta', nome: 'Consulta', descricao: 'só vê o Painel' },
]

type Membro = { email: string; perfil: Perfil; unidades: string[] | null }

/** unidades que o usuário de Consulta vê no Painel; nenhuma marcada = todas */
function EscolhaUnidades({ valor, onChange }: { valor: string[] | null; onChange: (v: string[] | null) => void }) {
  const { unidades } = useApp()
  const marcadas = valor ?? []
  const alternar = (id: string) => {
    const nova = marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]
    onChange(nova.length ? nova : null)
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500">Unidades:</span>
      {unidades.map((u) => (
        <button key={u.id} type="button" onClick={() => alternar(u.id)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition ${marcadas.includes(u.id) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-100'}`}>
          {u.nome}
        </button>
      ))}
      {!marcadas.length && <span className="text-xs text-slate-400">(todas)</span>}
    </span>
  )
}

function Usuarios({ setErro }: SetErro) {
  const { session } = useApp()
  const eu = session?.user.email?.toLowerCase()
  const [lista, setLista] = useState<Membro[]>([])
  const [email, setEmail] = useState('')
  const [perfil, setPerfil] = useState<Perfil>('consulta')
  const [unidadesNovo, setUnidadesNovo] = useState<string[] | null>(null)
  const [senha, setSenha] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const carregar = () => supabase.from('membros').select('email, perfil, unidades').order('email').then(({ data }) => setLista((data ?? []) as Membro[]))
  useEffect(() => { carregar() }, [])

  // cria a conta de login (sem e-mail de confirmação) e libera o acesso
  async function adicionar() {
    const e = email.trim().toLowerCase()
    setAviso(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setErro('Informe um e-mail no formato nome@dominio.com (não precisa existir).'); return }
    if (senha.length < 6) { setErro('A senha inicial precisa ter pelo menos 6 caracteres.'); return }
    setSalvando(true)
    const conta = await criarContaDeLogin(e, senha)
    if (conta.erro) { setErro(`Não foi possível criar o login: ${conta.erro}`); setSalvando(false); return }
    const { error } = await supabase.from('membros').insert({ email: e, perfil, unidades: perfil === 'consulta' ? unidadesNovo : null })
    setErro(error?.message ?? null)
    if (!error) {
      setAviso(conta.criada
        ? `Usuário ${e} criado. Ele já pode entrar com a senha informada e trocá-la em "Alterar senha".`
        : `${e} já tinha login; o acesso foi liberado e a senha dele não foi alterada.`)
      setEmail(''); setSenha(''); setUnidadesNovo(null)
    }
    setSalvando(false)
    carregar()
  }
  async function mudarPerfil(e: string, p: Perfil) {
    const { error } = await supabase.from('membros').update({ perfil: p }).eq('email', e)
    setErro(error?.message ?? null); carregar()
  }
  async function mudarUnidades(e: string, unidades: string[] | null) {
    setLista((l) => l.map((m) => (m.email === e ? { ...m, unidades } : m)))
    const { error } = await supabase.from('membros').update({ unidades }).eq('email', e)
    setErro(error?.message ?? null)
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
        <p className="text-xs text-slate-500">
          Informe e-mail e senha inicial: o login é criado na hora, sem envio de e-mail (o e-mail não precisa existir).
          A pessoa troca a senha em "Alterar senha", no menu. <b>Administrador</b> acessa e altera tudo;
          <b> Consulta</b> só vê o Painel do funil, das unidades marcadas (nenhuma marcada = todas).
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {lista.map((m) => (
          <li key={m.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-56">{m.email}{m.email === eu && <span className="ml-2 text-xs text-slate-400">(você)</span>}</span>
            {m.perfil === 'consulta' && <EscolhaUnidades valor={m.unidades} onChange={(v) => mudarUnidades(m.email, v)} />}
            <span className="flex items-center gap-2">
              {m.email === eu ? (
                <span className="text-slate-600">{PERFIS.find((p) => p.valor === m.perfil)?.nome}</span>
              ) : (
                <>
                  <select className="input w-40" value={m.perfil} onChange={(e) => mudarPerfil(m.email, e.target.value as Perfil)}>
                    {PERFIS.map((p) => <option key={p.valor} value={p.valor}>{p.nome}</option>)}
                  </select>
                  <button className="btn-danger p-1.5" onClick={() => remover(m.email)} aria-label="Remover"><Trash2 size={16} /></button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
        <input className="input max-w-xs" type="email" placeholder="email@exemplo.com" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input w-44" type="password" placeholder="Senha inicial" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
        <select className="input w-56" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
          {PERFIS.map((p) => <option key={p.valor} value={p.valor}>{p.nome} — {p.descricao}</option>)}
        </select>
        <button className="btn-primary" onClick={adicionar} disabled={salvando}><Plus size={16} /> {salvando ? 'Criando…' : 'Adicionar'}</button>
        {aviso && <div className="w-full text-sm text-emerald-700">{aviso}</div>}
        {perfil === 'consulta' && <div className="w-full"><EscolhaUnidades valor={unidadesNovo} onChange={setUnidadesNovo} /></div>}
      </div>
    </section>
  )
}
