import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { criarResolvedor } from '../lib/depara'
import { fimMes, fmtBRL, fmtData, inicioMes, mesAtual } from '../lib/format'
import { MonthPicker } from './ui'

interface Venda { id_orcamento: number; vendedor: string; data_pagamento: string; valor_liquido: number; tipo: string | null }
const chave = (v: { id_orcamento: number; vendedor: string }) => `${v.id_orcamento}|${v.vendedor}`

/**
 * Transferência de vendas: quando alguém lança a venda no login de outra pessoa.
 * A transferência fica guardada pela linha da exportação (ID Orç. + vendedor) e
 * sobrevive à reimportação; vale nas premiações e na disputa das aplicadoras.
 */
export default function TransferirVendas({ setErro }: { setErro: (s: string | null) => void }) {
  const { unidades, colaboradores, usuarios } = useApp()
  const [sel, setSel] = useState('')
  const [mes, setMes] = useState(mesAtual())
  const [vendedor, setVendedor] = useState('')
  const [soTransferidas, setSoTransferidas] = useState(false)
  const [vendas, setVendas] = useState<Venda[] | null>(null)
  const [transf, setTransf] = useState<Map<string, string>>(new Map()) // chave da venda → colaborador_id
  const unidade = unidades.find((u) => u.id === sel) ?? unidades[0]
  const pessoas = colaboradores.filter((c) => c.ativo && c.unidade_id === unidade?.id).sort((a, b) => a.nome.localeCompare(b.nome))
  const quemEra = useMemo(() => criarResolvedor(colaboradores, usuarios), [colaboradores, usuarios])

  const carregar = useCallback(async () => {
    if (!unidade) return
    setVendas(null)
    const v = await supabase.from('vendas').select('id_orcamento, vendedor, data_pagamento, valor_liquido, tipo')
      .eq('estabelecimento', unidade.estabelecimento).gte('data_pagamento', inicioMes(mes)).lte('data_pagamento', fimMes(mes))
      .order('data_pagamento').order('id_orcamento')
    if (v.error) { setErro(v.error.message); return }
    const lista = (v.data ?? []) as Venda[]
    const ids = [...new Set(lista.map((x) => x.id_orcamento))]
    const mapa = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 200) {
      const t = await supabase.from('vendas_transferidas').select('id_orcamento, vendedor, colaborador_id').in('id_orcamento', ids.slice(i, i + 200))
      if (t.error) { setErro(t.error.message); return }
      for (const x of t.data ?? []) mapa.set(chave(x), x.colaborador_id)
    }
    setErro(null); setTransf(mapa); setVendas(lista)
  }, [unidade, mes, setErro])

  useEffect(() => { carregar() }, [carregar])

  async function transferir(v: Venda, colaboradorId: string) {
    const r = colaboradorId
      ? await supabase.from('vendas_transferidas').upsert({ id_orcamento: v.id_orcamento, vendedor: v.vendedor, colaborador_id: colaboradorId })
      : await supabase.from('vendas_transferidas').delete().eq('id_orcamento', v.id_orcamento).eq('vendedor', v.vendedor)
    if (r.error) { setErro(r.error.message); return }
    setErro(null)
    setTransf((m) => {
      const n = new Map(m)
      if (colaboradorId) n.set(chave(v), colaboradorId); else n.delete(chave(v))
      return n
    })
  }

  const vendedores = useMemo(() => [...new Set((vendas ?? []).map((v) => v.vendedor))].sort(), [vendas])
  const visiveis = (vendas ?? []).filter((v) => (!vendedor || v.vendedor === vendedor) && (!soTransferidas || transf.has(chave(v))))
  const nomeDe = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? '—'

  return (
    <section className="card overflow-x-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="max-w-3xl">
          <div className="text-sm font-semibold">Transferência de vendas</div>
          <p className="text-xs text-slate-500">
            Para venda lançada no login de outra pessoa: escolha em <b>Conta para</b> quem de fato vendeu. Vale nas premiações e na
            disputa das aplicadoras, e continua valendo depois das importações. Para alguém que usou o login de outra por dias inteiros,
            prefira o vínculo com período em Equipe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-40" value={unidade?.id ?? ''} onChange={(e) => { setSel(e.target.value); setVendedor('') }}>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <MonthPicker value={mes} onChange={(m) => { setMes(m); setVendedor('') }} />
          <select className="input w-56" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={soTransferidas} onChange={(e) => setSoTransferidas(e.target.checked)} />
            Só transferidas ({transf.size})
          </label>
        </div>
      </div>
      {!vendas ? <div className="p-4 text-sm text-slate-500">Carregando…</div> : visiveis.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Nenhuma venda {soTransferidas ? 'transferida ' : ''}neste mês.</div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50">
              <tr><th className="th">Pagamento</th><th className="th">ID Orç.</th><th className="th">Lançada por</th><th className="th text-right">Valor líquido</th><th className="th">Conta para</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visiveis.map((v) => {
                const destino = transf.get(chave(v)) ?? ''
                const dono = unidade ? quemEra(unidade.id, v.vendedor, v.data_pagamento) : null
                return (
                  <tr key={chave(v)} className={destino ? 'bg-amber-50/60' : ''}>
                    <td className="td whitespace-nowrap">{fmtData(v.data_pagamento)}</td>
                    <td className="td tabular-nums">{v.id_orcamento}</td>
                    <td className="td">
                      <div>{v.vendedor}</div>
                      {dono && <div className="text-xs text-slate-500">{dono.nome}</div>}
                    </td>
                    <td className={`td text-right tabular-nums ${v.valor_liquido < 0 ? 'text-red-600' : ''}`}>{fmtBRL(v.valor_liquido)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        {destino && <ArrowRight size={14} className="shrink-0 text-amber-600" />}
                        <select className="input min-w-48" value={destino} onChange={(e) => transferir(v, e.target.value)}
                          title={destino ? `Transferida para ${nomeDe(destino)}` : 'Conta para quem lançou'}>
                          <option value="">{dono ? `${dono.nome} (quem lançou)` : 'Quem lançou'}</option>
                          {pessoas.filter((p) => p.id !== dono?.id).map((p) => <option key={p.id} value={p.id}>{p.nome} · {p.funcao}</option>)}
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
