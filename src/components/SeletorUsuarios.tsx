import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface OpcaoUsuario { chave: string; usuario: string; qtd: number }

/**
 * Lista de seleção (múltipla) dos usuários do sistema que interagiram com a unidade.
 * As alterações são enviadas ao fechar a lista, para não gravar a cada clique.
 */
export default function SeletorUsuarios({ opcoes, valor, onChange, donoDe, placeholder = 'Selecionar usuários…' }: {
  opcoes: OpcaoUsuario[]
  valor: string[] // chaves normalizadas
  onChange: (chaves: string[]) => void
  donoDe?: (chave: string) => string | null // outra pessoa que já tem este usuário (vínculo permanente)
  placeholder?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<string[]>(valor)
  const ref = useRef<HTMLDivElement>(null)

  const nome = (chave: string) => opcoes.find((o) => o.chave === chave)?.usuario ?? chave

  function fechar() {
    setAberto(false)
    setBusca('')
    if ([...marcados].sort().join('|') !== [...valor].sort().join('|')) onChange(marcados)
  }

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  })

  // usuários já vinculados que não aparecem nos dados também ficam na lista, para poderem ser desmarcados
  const todas: OpcaoUsuario[] = [...opcoes, ...valor.filter((v) => !opcoes.some((o) => o.chave === v)).map((v) => ({ chave: v, usuario: v, qtd: 0 }))]
  const filtradas = todas.filter((o) => !busca || o.chave.includes(busca.toLowerCase()) || o.usuario.toLowerCase().includes(busca.toLowerCase()))
  const alternar = (chave: string) => setMarcados((m) => (m.includes(chave) ? m.filter((x) => x !== chave) : [...m, chave]))

  return (
    <div ref={ref} className="relative min-w-64">
      <button type="button" className="input flex items-center justify-between gap-2 text-left"
        onClick={() => (aberto ? fechar() : (setMarcados(valor), setAberto(true)))}>
        <span className={`truncate ${valor.length ? '' : 'text-slate-400'}`}>{valor.length ? valor.map(nome).join(', ') : placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>
      {aberto && (
        <div className="absolute left-0 z-30 mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input autoFocus className="input" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1 text-sm">
            {filtradas.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhum usuário com registros nesta unidade.</li>}
            {filtradas.map((o) => {
              const dono = donoDe?.(o.chave)
              return (
                <li key={o.chave}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={marcados.includes(o.chave)} onChange={() => alternar(o.chave)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.usuario}</span>
                      <span className="block text-xs text-slate-500">
                        {o.qtd ? `${o.qtd.toLocaleString('pt-BR')} registros` : 'sem registros na unidade'}
                        {dono && <span className="text-amber-700"> · hoje com {dono} (será transferido)</span>}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="flex justify-end border-t border-slate-100 p-2">
            <button type="button" className="btn-primary px-3 py-1.5" onClick={fechar}>Concluir</button>
          </div>
        </div>
      )}
    </div>
  )
}
