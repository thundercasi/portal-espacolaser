import { useEffect, useMemo, useState } from 'react'
import { Copy, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { calcularCancelamento, type AreaContrato, type ResultadoCancelamento } from '../lib/cancelamento'
import { fmtBRL } from '../lib/format'
import { Field, NumInput, PageHeader, PctInput } from '../components/ui'

type Area = Omit<AreaContrato, 'parcelamento' | 'parcelasPagas'>

interface Contrato {
  nome: string
  sessoes: number
  multaPct: number
  parcelamento: number
  parcelasPagas: number
  areas: Area[]
}

const novaArea = (): Area => ({ area: '', valor: 0, sessoesRealizadas: 0 })
const novoContrato = (n: number): Contrato => ({ nome: `Contrato ${n}`, sessoes: 5, multaPct: 0.3, parcelamento: 1, parcelasPagas: 0, areas: [novaArea()] })
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

// o último cálculo fica salvo neste navegador para sobreviver ao recarregar a página
const CHAVE_RASCUNHO = 'cancelamento:rascunho'
function lerRascunho(): { cliente: string; contratos: Contrato[] } | null {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) ?? 'null')
    if (!r || !Array.isArray(r.contratos) || !r.contratos.length) return null
    const contratos = (r.contratos as Partial<Contrato>[]).map((c, i) => ({
      ...novoContrato(i + 1), ...c, areas: Array.isArray(c.areas) && c.areas.length ? c.areas.map((a) => ({ ...novaArea(), ...a })) : [novaArea()],
    }))
    return { cliente: String(r.cliente ?? ''), contratos }
  } catch {
    return null
  }
}

export default function Cancelamento() {
  const [inicial] = useState(lerRascunho)
  const [cliente, setCliente] = useState(inicial?.cliente ?? '')
  const [contratos, setContratos] = useState<Contrato[]>(inicial?.contratos ?? [novoContrato(1)])
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ cliente, contratos })) } catch { /* armazenamento indisponível */ }
  }, [cliente, contratos])

  const resultados = useMemo(() => contratos.map((c) =>
    calcularCancelamento(c.areas.map((a) => ({ ...a, parcelamento: c.parcelamento, parcelasPagas: c.parcelasPagas })), c.sessoes, c.multaPct)), [contratos])
  const total = useMemo(() => {
    const soma = (f: (r: ResultadoCancelamento) => number) => resultados.reduce((s, r) => s + f(r), 0)
    return {
      compraTotal: soma((r) => r.compraTotal), totalPago: soma((r) => r.totalPago), saldoUtilizado: soma((r) => r.saldoUtilizado),
      multa: soma((r) => r.multa), saldoDevido: soma((r) => r.saldoDevido),
    }
  }, [resultados])
  const devolver = total.saldoDevido < 0

  const setContrato = (ci: number, patch: Partial<Contrato>) => setContratos((cs) => cs.map((c, k) => (k === ci ? { ...c, ...patch } : c)))
  const setArea = (ci: number, ai: number, patch: Partial<Area>) =>
    setContratos((cs) => cs.map((c, k) => (k === ci ? { ...c, areas: c.areas.map((a, j) => (j === ai ? { ...a, ...patch } : a)) } : c)))

  function limpar() {
    setCliente(''); setContratos([novoContrato(1)])
  }

  async function copiarResumo() {
    const blocos = contratos.map((c, ci) => {
      const r = resultados[ci]
      const areas = r.linhas.filter((l) => l.valor > 0).map((l) =>
        `  • ${l.area || 'Área'}: valor ${fmtBRL(l.valor)}, pago ${fmtBRL(l.totalPago)}, ${l.sessoesRealizadas} sessões — utilizado ${fmtBRL(l.saldoUtilizado)}, multa ${fmtBRL(l.multa)}`)
      return [`${c.nome} (${c.parcelasPagas}/${c.parcelamento} parcelas pagas, ${c.sessoes} sessões, multa ${pct(c.multaPct)}):`, ...areas,
        `  Subtotal: ${r.saldoDevido < 0 ? `devolver ${fmtBRL(-r.saldoDevido)}` : `devido ${fmtBRL(r.saldoDevido)}`}`].join('\n')
    })
    const texto = [
      `Cálculo de cancelamento${cliente ? ` — ${cliente}` : ''}`,
      ...blocos,
      '',
      `Compra total: ${fmtBRL(total.compraTotal)}`,
      `Total pago: ${fmtBRL(total.totalPago)}`,
      `Saldo utilizado: ${fmtBRL(total.saldoUtilizado)}`,
      `Multa: ${fmtBRL(total.multa)}`,
      devolver ? `Valor a devolver ao cliente: ${fmtBRL(-total.saldoDevido)}` : `Saldo devido pelo cliente: ${fmtBRL(total.saldoDevido)}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true); setTimeout(() => setCopiado(false), 2000)
    } catch { /* navegador sem permissão de área de transferência */ }
  }

  return (
    <div>
      <PageHeader title="Cálculo de cancelamento" subtitle="Multa e saldo devido no cancelamento de contratos"
        actions={<>
          <button className="btn-ghost" onClick={limpar}><RotateCcw size={16} /> Limpar</button>
          <button className="btn-primary" onClick={copiarResumo}><Copy size={16} /> {copiado ? 'Copiado!' : 'Copiar resumo'}</button>
        </>} />

      <div className="card mb-4 p-4">
        <Field label="Cliente (opcional)" className="max-w-md"><input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></Field>
      </div>

      <div className="space-y-4">
        {contratos.map((c, ci) => {
          const r = resultados[ci]
          return (
            <section key={ci} className="card overflow-hidden">
              <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_8rem_9rem_8rem_auto] sm:items-end">
                <Field label="Contrato"><input className="input" value={c.nome} onChange={(e) => setContrato(ci, { nome: e.target.value })} /></Field>
                <Field label="Parcelas"><NumInput step="1" value={c.parcelamento} onChange={(v) => setContrato(ci, { parcelamento: Math.max(0, Math.round(v)) })} /></Field>
                <Field label="Parcelas pagas"><NumInput step="1" value={c.parcelasPagas} onChange={(v) => setContrato(ci, { parcelasPagas: Math.max(0, Math.round(v)) })} /></Field>
                <Field label="Sessões p/ cálculo"><NumInput step="1" value={c.sessoes} onChange={(v) => setContrato(ci, { sessoes: Math.max(1, Math.round(v)) })} /></Field>
                <Field label="Multa"><PctInput value={c.multaPct} onChange={(v) => setContrato(ci, { multaPct: v })} /></Field>
                {contratos.length > 1 && (
                  <button className="btn-danger" onClick={() => setContratos((cs) => cs.filter((_, k) => k !== ci))}><Trash2 size={16} /> Remover contrato</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Área</th>
                      <th className="th text-right">Valor (R$)</th>
                      <th className="th text-right">Sessões feitas</th>
                      <th className="th border-l border-slate-200 text-right">Total pago</th>
                      <th className="th text-right">Saldo utilizado</th>
                      <th className="th text-right">Multa</th>
                      <th className="th text-right">Saldo devido</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.linhas.map((l, ai) => (
                      <tr key={ai}>
                        <td className="td"><input className="input min-w-40" placeholder="Ex.: Virilha" value={l.area} onChange={(e) => setArea(ci, ai, { area: e.target.value })} /></td>
                        <td className="td"><NumInput className="w-28 text-right" value={l.valor} onChange={(v) => setArea(ci, ai, { valor: v })} /></td>
                        <td className="td"><NumInput step="1" className="w-20 text-right" value={l.sessoesRealizadas} onChange={(v) => setArea(ci, ai, { sessoesRealizadas: Math.max(0, Math.round(v)) })} /></td>
                        <td className="td border-l border-slate-200 text-right tabular-nums">{fmtBRL(l.totalPago)}</td>
                        <td className="td text-right tabular-nums">{fmtBRL(l.saldoUtilizado)}</td>
                        <td className="td text-right tabular-nums">{fmtBRL(l.multa)}</td>
                        <td className={`td text-right font-medium tabular-nums ${l.saldoDevido < 0 ? 'text-emerald-700' : ''}`}>{fmtBRL(l.saldoDevido)}</td>
                        <td className="td text-right">
                          {c.areas.length > 1 && (
                            <button className="btn-danger p-1.5" onClick={() => setContrato(ci, { areas: c.areas.filter((_, j) => j !== ai) })} aria-label="Remover área"><Trash2 size={16} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50 font-medium tabular-nums">
                    <tr>
                      <td className="td">
                        <button className="btn-ghost -ml-2 px-2 py-1" onClick={() => setContrato(ci, { areas: [...c.areas, novaArea()] })}><Plus size={15} /> Adicionar área</button>
                      </td>
                      <td className="td text-right">{fmtBRL(r.compraTotal)}</td>
                      <td className="td" />
                      <td className="td border-l border-slate-200 text-right">{fmtBRL(r.totalPago)}</td>
                      <td className="td text-right">{fmtBRL(r.saldoUtilizado)}</td>
                      <td className="td text-right">{fmtBRL(r.multa)}</td>
                      <td className={`td text-right ${r.saldoDevido < 0 ? 'text-emerald-700' : ''}`}>{fmtBRL(r.saldoDevido)}</td>
                      <td className="td" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )
        })}
      </div>

      <button className="btn-ghost mt-3" onClick={() => setContratos((cs) => [...cs, novoContrato(cs.length + 1)])}><Plus size={16} /> Adicionar contrato</button>

      <div className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">{contratos.length > 1 ? `Total dos ${contratos.length} contratos` : 'Total'}</div>
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Resumo label="Compra total" valor={total.compraTotal} />
        <Resumo label="Total pago" valor={total.totalPago} />
        <Resumo label="Saldo utilizado" valor={total.saldoUtilizado} />
        <Resumo label="Multa" valor={total.multa} />
        <div className={`card col-span-2 p-4 md:col-span-1 ${devolver ? 'border-emerald-200 bg-emerald-50' : 'border-brand-100 bg-brand-50'}`}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{devolver ? 'Devolver ao cliente' : 'Cliente deve pagar'}</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${devolver ? 'text-emerald-700' : 'text-brand-700'}`}>{fmtBRL(Math.abs(total.saldoDevido))}</div>
        </div>
      </div>

      <details className="mt-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Como é calculado</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Cada contrato usa o próprio nº de sessões e a própria multa.</li>
          <li><b>Valor da sessão</b> = valor da área ÷ nº de sessões para cálculo do contrato.</li>
          <li><b>Sessões consideradas</b> = sessões feitas, limitadas ao nº de sessões para cálculo.</li>
          <li><b>Saldo utilizado</b> = valor da sessão × sessões consideradas.</li>
          <li><b>Multa</b> = sessões não feitas × valor da sessão × % de multa do contrato.</li>
          <li><b>Total pago</b> = valor da área ÷ parcelas do contrato × parcelas pagas.</li>
          <li><b>Saldo devido</b> = saldo utilizado + multa − total pago. O total do cliente soma todos os contratos; se ficar negativo, é o valor a devolver.</li>
        </ul>
      </details>
    </div>
  )
}

function Resumo({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{fmtBRL(valor)}</div>
    </div>
  )
}
