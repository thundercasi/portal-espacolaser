import { useState, type FormEvent } from 'react'
import { Filter } from 'lucide-react'
import { supabase, supabaseConfigurado } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErro(null); setMsg(null)
    const r = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha })
    if (r.error) setErro(r.error.message)
    else if (modo === 'criar' && !r.data.session) setMsg('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.')
    setBusy(false)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600"><Filter size={19} className="text-white" /></div>
          <div><div className="font-semibold">Funil Espaçolaser</div><div className="text-xs text-slate-500">Painel de leads, agendamentos e vendas</div></div>
        </div>
        {!supabaseConfigurado && (
          <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code>.
          </div>
        )}
        <label className="label">E-mail</label>
        <input className="input mb-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Senha</label>
        <input className="input mb-4" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
        {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        <button type="button" className="mt-3 w-full text-center text-xs text-slate-500 hover:underline" onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
          {modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}
