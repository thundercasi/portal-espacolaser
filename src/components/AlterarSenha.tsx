import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from './ui'

/** troca a senha de quem está logado (sem e-mail) */
export default function AlterarSenha({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  function fechar() {
    setSenha(''); setConfirma(''); setErro(null); setOk(false)
    onClose()
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirma) { setErro('As duas senhas não são iguais.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setBusy(false)
    if (error) setErro(/different from the old/i.test(error.message) ? 'A nova senha precisa ser diferente da atual.' : error.message)
    else { setOk(true); setSenha(''); setConfirma('') }
  }

  return (
    <Modal open={open} onClose={fechar} title="Alterar senha">
      {ok ? (
        <div className="space-y-4">
          <p className="text-sm text-emerald-700">Senha alterada. Use a nova senha no próximo acesso.</p>
          <div className="flex justify-end"><button className="btn-primary" onClick={fechar}>Fechar</button></div>
        </div>
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <label className="block"><span className="label">Nova senha</span>
            <input className="input" type="password" autoComplete="new-password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          <label className="block"><span className="label">Repita a nova senha</span>
            <input className="input" type="password" autoComplete="new-password" required minLength={6} value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={fechar}>Cancelar</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
