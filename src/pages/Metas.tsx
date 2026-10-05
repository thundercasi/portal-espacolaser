import { useEffect, useState } from 'react'
import { Copy, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { addMeses, fmtBRL, fmtNum, inicioMes, mesAtual, nomeMes } from '../lib/format'
import type { Meta } from '../lib/types'
import { ErrorBox, Field, MonthPicker, NumInput, PageHeader, PctInput } from '../components/ui'

const vazia = (unidade_id: string, mes: string): Meta => ({
  unidade_id, mes: inicioMes(mes), meta_leads: 0, meta_agendamentos: 0, taxa_comparecimento: 0.26, taxa_conversao: 0.51,
  ticket_medio: 1500, share_avaliacoes: 0.37, meta_faturamento: 0, super_meta: 0, dias_nao_uteis: [], dias_uteis_extra: [],
})

export default function Metas() {
  const { unidades } = useApp()
  const ativas = unidades.filter((u) => u.ativo)
  const [mes, setMes] = useState(mesAtual())
  const [unidadeId, setUnidadeId] = useState('')
  const [m, setM] = useState<Meta | null>(null)
  const [existe, setExiste] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const uid = unidadeId || ativas[0]?.id || ''

  useEffect(() => {
    if (!uid) return
    // esconde o formulário até carregar, para não salvar os dados da unidade/mês anterior por cima desta
    let vivo = true
    setM(null); setMsg(null); setErro(null)
    supabase.from('metas').select('*').eq('unidade_id', uid).eq('mes', inicioMes(mes)).maybeSingle().then(({ data }) => {
      if (!vivo) return
      setExiste(Boolean(data))
      setM(data ? (data as Meta) : vazia(uid, mes))
    })
    return () => { vivo = false }
  }, [uid, mes])

  async function copiarAnterior() {
    const ant = addMeses(inicioMes(mes), -1)
    const { data } = await supabase.from('metas').select('*').eq('unidade_id', uid).eq('mes', ant).maybeSingle()
    if (!data) { setErro(`Não há metas em ${nomeMes(ant.slice(0, 7)).toLowerCase()} para copiar.`); return }
    setErro(null)
    setM({ ...(data as Meta), mes: inicioMes(mes), dias_nao_uteis: [], dias_uteis_extra: [] })
  }

  async function salvar() {
    if (!m) return
    setBusy(true); setErro(null); setMsg(null)
    const { error } = await supabase.from('metas').upsert({ ...m, updated_at: new Date().toISOString() })
    if (error) setErro(error.message)
    else { setMsg('Metas salvas.'); setExiste(true) }
    setBusy(false)
  }

  if (!ativas.length) return <div><PageHeader title="Metas" /><p className="text-sm text-slate-500">Cadastre uma unidade primeiro.</p></div>

  const set = <K extends keyof Meta>(k: K, v: Meta[K]) => setM((x) => (x ? { ...x, [k]: v } : x))

  // calendário
  const [ano, mm] = mes.split('-').map(Number)
  const n = new Date(Date.UTC(ano, mm, 0)).getUTCDate()
  const offset = new Date(Date.UTC(ano, mm - 1, 1)).getUTCDay()
  const ehUtil = (d: number) => {
    if (!m) return false
    const dom = new Date(Date.UTC(ano, mm - 1, d)).getUTCDay() === 0
    return (!dom || m.dias_uteis_extra.includes(d)) && !m.dias_nao_uteis.includes(d)
  }
  const alternar = (d: number) => {
    if (!m) return
    const dom = new Date(Date.UTC(ano, mm - 1, d)).getUTCDay() === 0
    if (dom) set('dias_uteis_extra', m.dias_uteis_extra.includes(d) ? m.dias_uteis_extra.filter((x) => x !== d) : [...m.dias_uteis_extra, d])
    else set('dias_nao_uteis', m.dias_nao_uteis.includes(d) ? m.dias_nao_uteis.filter((x) => x !== d) : [...m.dias_nao_uteis, d])
  }
  const totalUteis = Array.from({ length: n }, (_, k) => k + 1).filter(ehUtil).length

  const pres = m ? m.meta_agendamentos * m.taxa_comparecimento : 0
  const vendas = m ? pres * m.taxa_conversao : 0
  const rAv = m ? vendas * m.ticket_medio : 0
  const rClinica = m && m.share_avaliacoes ? rAv / m.share_avaliacoes : 0

  return (
    <div>
      <PageHeader title="Metas" subtitle="Metas mensais de cada unidade e dias de funcionamento"
        actions={<>
          <select className="input w-44" value={uid} onChange={(e) => setUnidadeId(e.target.value)}>
            {ativas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <MonthPicker value={mes} onChange={setMes} />
        </>} />
      <ErrorBox msg={erro} />
      {msg && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}
      {m && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            {!existe && <p className="mb-4 text-sm text-amber-700">Ainda não há metas para este mês. Preencha ou copie do mês anterior.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Meta de leads (mês)"><NumInput step="1" value={m.meta_leads} onChange={(v) => set('meta_leads', v)} /></Field>
              <Field label="Meta de agendamentos (mês)"><NumInput step="1" value={m.meta_agendamentos} onChange={(v) => set('meta_agendamentos', v)} /></Field>
              <Field label="Taxa de comparecimento (presenças ÷ agendamentos)"><PctInput value={m.taxa_comparecimento} onChange={(v) => set('taxa_comparecimento', v)} /></Field>
              <Field label="Taxa de conversão (vendas ÷ presenças)"><PctInput value={m.taxa_conversao} onChange={(v) => set('taxa_conversao', v)} /></Field>
              <Field label="Ticket médio meta (R$)"><NumInput value={m.ticket_medio} onChange={(v) => set('ticket_medio', v)} /></Field>
              <Field label="Share das avaliações no faturamento"><PctInput value={m.share_avaliacoes} onChange={(v) => set('share_avaliacoes', v)} /></Field>
              <Field label="Meta de faturamento da clínica (R$)"><NumInput value={m.meta_faturamento} onChange={(v) => set('meta_faturamento', v)} /></Field>
              <Field label="Super meta (R$)"><NumInput value={m.super_meta} onChange={(v) => set('super_meta', v)} /></Field>
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="mb-1 font-medium">Funil que essas metas geram</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-600 sm:grid-cols-3">
                <span>Presenças: <b className="text-slate-800">{fmtNum(Math.round(pres * 10) / 10)}</b></span>
                <span>Vendas de avaliação: <b className="text-slate-800">{fmtNum(Math.round(vendas * 10) / 10)}</b></span>
                <span>R$ avaliação: <b className="text-slate-800">{fmtBRL(rAv)}</b></span>
                <span>R$ clínica (pelo share): <b className="text-slate-800">{fmtBRL(rClinica)}</b></span>
                <span>Leads/dia útil: <b className="text-slate-800">{totalUteis ? fmtNum(Math.round((m.meta_leads / totalUteis) * 10) / 10) : '—'}</b></span>
                <span>Agend./dia útil: <b className="text-slate-800">{totalUteis ? fmtNum(Math.round((m.meta_agendamentos / totalUteis) * 10) / 10) : '—'}</b></span>
              </div>
              <p className="mt-2 text-xs text-slate-500">No painel, a meta de R$ total usa a meta de faturamento; se ela estiver zerada, usa o R$ clínica calculado pelo share. As metas de leads e agendamentos são divididas igualmente entre as atendentes marcadas como "participa da meta".</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={copiarAnterior}><Copy size={16} /> Copiar do mês anterior</button>
              <button className="btn-primary" onClick={salvar} disabled={busy}><Save size={16} /> Salvar</button>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-1 text-sm font-semibold">Dias úteis: {totalUteis}</div>
            <p className="mb-3 text-xs text-slate-500">Clique num dia para marcar como fechado (feriado) ou, no domingo, como aberto. Salve depois.</p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, k) => <div key={k} className="py-1 font-medium text-slate-400">{d}</div>)}
              {Array.from({ length: offset }, (_, k) => <div key={`v${k}`} />)}
              {Array.from({ length: n }, (_, k) => k + 1).map((d) => (
                <button key={d} onClick={() => alternar(d)}
                  className={`rounded-md py-2 tabular-nums transition ${ehUtil(d) ? 'bg-brand-50 font-medium text-brand-700 hover:bg-brand-100' : 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
