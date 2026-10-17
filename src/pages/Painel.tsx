import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { calcularPainel, metasNoNivel, ORIGENS_AVALIACAO, type NivelMeta, type ConjuntoIndicadores, type Indicador, type Painel as TPainel } from '../lib/painel'
import { fimMes, fmtBRL, fmtNum, fmtPct, hojeISO, inicioMes, mesAtual, nomeMes } from '../lib/format'
import type { LinhaPainel, Meta } from '../lib/types'
import { ErrorBox, MonthPicker, PageHeader } from '../components/ui'

const int = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'))
const dec = (v: number | null | undefined) => (v == null ? '—' : fmtNum(Math.round(v * 10) / 10))
const brl0 = (v: number | null | undefined) => (v == null ? '—' : fmtBRL(Math.round(v)).replace(/,00$/, ''))

export default function Painel() {
  const { unidades, colaboradores, usuarios, admin } = useApp()
  const [mes, setMes] = useState(mesAtual())
  const [unidadeId, setUnidadeId] = useState<string>('todas')
  // nível das metas exibidas (lembrado neste navegador)
  const [nivel, setNivelState] = useState<NivelMeta>(() => {
    try { return localStorage.getItem('painel:nivel') === 'super' ? 'super' : 'meta' } catch { return 'meta' }
  })
  const setNivel = (n: NivelMeta) => { setNivelState(n); try { localStorage.setItem('painel:nivel', n) } catch { /* sem armazenamento */ } }
  const [linhas, setLinhas] = useState<LinhaPainel[] | null>(null)
  const [metas, setMetas] = useState<Meta[]>([])
  const [ultimaImport, setUltimaImport] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setLinhas(null); setErro(null)
    Promise.all([
      supabase.rpc('painel_diario', { p_ini: inicioMes(mes), p_fim: fimMes(mes), p_origens_av: ORIGENS_AVALIACAO }),
      supabase.from('metas').select('*').eq('mes', inicioMes(mes)),
      supabase.from('importacoes').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([p, m, i]) => {
      if (!vivo) return
      if (p.error) setErro(p.error.message)
      setLinhas((p.data ?? []) as LinhaPainel[])
      setMetas((m.data ?? []) as Meta[])
      setUltimaImport(i.data?.created_at ?? null)
    })
    return () => { vivo = false }
  }, [mes])

  const ativas = useMemo(() => unidades.filter((u) => u.ativo), [unidades])
  const sel = useMemo(() => (unidadeId === 'todas' ? ativas : ativas.filter((u) => u.id === unidadeId)), [ativas, unidadeId])
  const nivelMetas = useMemo(() => metasNoNivel(metas, nivel), [metas, nivel])
  const p = useMemo(() => {
    if (!linhas) return null
    return calcularPainel({ mes, hoje: hojeISO(), unidades: sel, colaboradores, usuarios, metas: nivelMetas.metas, linhas })
  }, [linhas, nivelMetas, mes, sel, colaboradores, usuarios])
  // unidades selecionadas que têm meta no mês mas não têm super meta
  const semSuper = sel.filter((u) => nivelMetas.semSuper.includes(u.id)).map((u) => u.nome)
  const fatoresSel = sel.map((u) => nivelMetas.fatores.get(u.id)).filter((x): x is number => x != null)

  return (
    <div>
      <PageHeader
        title="Painel do funil"
        subtitle={p ? `${nomeMes(mes)} · ${p.diasUteis} dias úteis, ${p.diasPassados} já passaram${ultimaImport ? ` · última importação ${new Date(ultimaImport).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}` : nomeMes(mes)}
        actions={<>
          <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200" role="group" aria-label="Metas exibidas">
            {([['meta', 'Meta'], ['super', 'Super meta']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setNivel(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${nivel === k ? (k === 'super' ? 'bg-amber-500 text-white' : 'bg-brand-600 text-white') : 'text-slate-600 hover:bg-slate-100'}`}>
                {l}
              </button>
            ))}
          </div>
          <MonthPicker value={mes} onChange={setMes} />
        </>}
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {/* quem só tem acesso a uma unidade não precisa da aba "Todas" */}
        {(ativas.length > 1 ? [{ id: 'todas', nome: 'Todas' }, ...ativas] : ativas).map((u) => (
          <button key={u.id} onClick={() => setUnidadeId(u.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${unidadeId === u.id || ativas.length === 1 ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}>
            {u.nome}
          </button>
        ))}
      </div>
      <ErrorBox msg={erro} />
      {!p ? <div className="text-sm text-slate-500">Carregando…</div> : (
        <>
          {nivel === 'super' && p.temMeta && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Exibindo a <b>super meta</b>
              {fatoresSel.length > 0 && <>: metas de leads, agendamentos, presenças e vendas {fatoresSel.length === 1
                ? `+${fmtPct(fatoresSel[0] - 1, 0)}`
                : `+${fmtPct(Math.min(...fatoresSel) - 1, 0)} a +${fmtPct(Math.max(...fatoresSel) - 1, 0)}`} sobre a meta (proporção super meta ÷ meta de faturamento)</>}.
              {semSuper.length > 0 && <> Sem super meta cadastrada (mostrando a meta normal): <b>{semSuper.join(', ')}</b>.</>}
            </div>
          )}
          {!p.temMeta && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Sem metas cadastradas para {nomeMes(mes).toLowerCase()}. {admin && <Link to="/metas" className="font-medium underline">Cadastrar metas</Link>}
            </div>
          )}
          {linhas?.length === 0 && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              Nenhum dado importado para este mês. {admin && <Link to="/importar" className="font-medium text-brand-700 underline">Importar exportações</Link>}
            </div>
          )}
          <DestaqueMetaDiaria p={p} nivel={nivel} />
          <Kpis p={p} />
          <div className="mt-4 grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3"><Funil p={p} /></div>
            <div className="xl:col-span-2"><Grafico p={p} /></div>
          </div>
          {p.temMeta && <QuadroDezenas p={p} />}
          <TabelaDiaria p={p} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Destaque no topo: quanto precisa vender por dia para bater a dezena atual e o mês (R$ vendas total). */
function DestaqueMetaDiaria({ p, nivel }: { p: TPainel; nivel: NivelMeta }) {
  if (!p.temMeta) return null
  const encerrado = p.diaHoje > p.diasNoMes
  const futuro = p.diaHoje === 0
  const uteis = (a: number, b: number) => { let t = 0; for (let d = Math.max(a, p.diaHoje || 1); d <= b; d++) if (p.util[d]) t++; return t }
  const dez = p.dezenas.find((d) => d.atual) ?? (futuro ? p.dezenas[0] : null)
  const mes = p.ind.vendasTotal
  const superDia = p.superMeta != null && p.diasRestantes ? Math.max(p.superMeta - mes.realizado, 0) / p.diasRestantes : null

  if (encerrado) {
    const ok = mes.meta != null && mes.realizado >= mes.meta
    return (
      <div className={`mb-4 rounded-xl border px-5 py-4 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Mês encerrado — vendas total</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {brl0(mes.realizado)} <span className="text-base font-normal text-slate-500">de {brl0(mes.meta)} ({mes.meta ? fmtPct(mes.realizado / mes.meta, 0) : '—'})</span>
        </div>
      </div>
    )
  }

  const blocos = [
    dez && {
      titulo: `Por dia para bater a ${nivel === 'super' ? 'super meta da ' : ''}${dez.numero}ª dezena (${dez.inicio}–${dez.fim})`,
      ind: dez.acumulado.vendasTotal,
      dias: uteis(dez.inicio, dez.fim),
      nota: dez.numero > 1 ? 'inclui o que faltou das dezenas anteriores' : null,
      extra: null as string | null,
    },
    {
      titulo: nivel === 'super' ? 'Por dia para bater a super meta do mês' : 'Por dia para bater a meta do mês',
      ind: mes,
      dias: p.diasRestantes,
      nota: null as string | null,
      extra: nivel === 'meta' && superDia != null ? `Super meta: ${brl0(superDia)}/dia` : null,
    },
  ].filter(Boolean) as { titulo: string; ind: Indicador; dias: number; nota: string | null; extra: string | null }[]

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      {blocos.map((b) => {
        const batida = b.ind.restante != null && b.ind.restante <= 0
        const pct = b.ind.meta ? Math.min(b.ind.realizado / b.ind.meta, 1) : 0
        return (
          <div key={b.titulo} className={`rounded-xl border px-5 py-4 shadow-sm ${batida ? 'border-emerald-200 bg-emerald-50' : 'border-brand-200 bg-brand-50'}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">{b.titulo}</div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${batida ? 'text-emerald-700' : 'text-slate-900'}`}>
              {batida ? 'Meta batida ✓' : b.ind.metaDia != null ? <>{brl0(b.ind.metaDia)}<span className="text-base font-medium text-slate-500"> /dia</span></> : '—'}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
              <div className={`h-full rounded-full ${batida ? 'bg-emerald-500' : 'bg-brand-600'}`} style={{ width: `${pct * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
              <span>Vendido <b className="tabular-nums text-slate-800">{brl0(b.ind.realizado)}</b> de {brl0(b.ind.meta)}</span>
              {!batida && <span>Faltam <b className="tabular-nums text-slate-800">{brl0(b.ind.restante)}</b> em {b.dias} {b.dias === 1 ? 'dia útil' : 'dias úteis'}</span>}
              {b.extra && <span>{b.extra}</span>}
              {b.nota && <span className="text-slate-500">({b.nota})</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Kpi({ label, i, fmt, extra }: { label: string; i: Indicador; fmt: (v: number | null) => string; extra?: ReactNode }) {
  const pct = i.meta ? Math.min(i.realizado / i.meta, 1) : 0
  const tendOk = i.meta != null && i.tendencia != null ? i.tendencia >= i.meta : null
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums text-slate-900">{fmt(i.realizado)}</span>
        {i.meta != null && <span className="text-xs text-slate-500">de {fmt(i.meta)}</span>}
      </div>
      {i.meta != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tendOk === false ? 'bg-amber-500' : 'bg-brand-600'}`} style={{ width: `${pct * 100}%` }} />
        </div>
      )}
      <div className="mt-2 space-y-0.5 text-xs text-slate-500">
        {i.tendencia != null && (
          <div>Tendência <b className={tendOk == null ? 'text-slate-700' : tendOk ? 'text-emerald-700' : 'text-red-600'}>{fmt(i.tendencia)}</b></div>
        )}
        {i.metaDia != null && <div>Precisa de <b className="text-slate-700">{fmt(i.metaDia)}</b>/dia</div>}
        {extra}
      </div>
    </div>
  )
}

function Kpis({ p }: { p: TPainel }) {
  const { ind, taxas } = p
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Leads" i={ind.leadsTotal} fmt={int} />
      <Kpi label="Avaliações agendadas" i={ind.avaliacoes} fmt={int} extra={<div>{fmtPct(taxas.agendamento.real)} dos leads</div>} />
      <Kpi label="Presenças" i={ind.presencas} fmt={dec} extra={<div>Comparecimento <b className="text-slate-700">{fmtPct(taxas.comparecimento.real)}</b></div>} />
      <Kpi label="Vendas de avaliação" i={ind.vendasAvQtd} fmt={dec} extra={<div>Conversão <b className="text-slate-700">{fmtPct(taxas.conversao.real)}</b></div>} />
      <Kpi label="R$ vendas avaliação" i={ind.vendasAvValor} fmt={brl0} extra={<div>Ticket médio <b className="text-slate-700">{brl0(taxas.ticket.real)}</b></div>} />
      <Kpi label="R$ vendas total" i={ind.vendasTotal} fmt={brl0} extra={p.superMeta ? <div>Super meta {brl0(p.superMeta)}</div> : null} />
    </div>
  )
}

function Funil({ p }: { p: TPainel }) {
  const { ind, taxas } = p
  const dia = (v: number) => (p.diasPassados ? v / p.diasPassados : null)
  const linhas: { nome: string; i?: Indicador; taxa?: { meta: number | null; real: number | null }; fmt: (v: number | null) => string; valor?: { meta: number | null; real: number | null } }[] = [
    { nome: 'Leads', i: ind.leadsTotal, fmt: int },
    { nome: 'Agendaram', i: ind.avaliacoes, taxa: taxas.agendamento, fmt: int },
    { nome: 'Compareceram', i: ind.presencas, taxa: taxas.comparecimento, fmt: dec },
    { nome: 'Compraram', i: ind.vendasAvQtd, taxa: taxas.conversao, fmt: dec },
    { nome: 'Ticket médio', valor: taxas.ticket, fmt: brl0 },
    { nome: 'Vendas avaliação', i: ind.vendasAvValor, fmt: brl0 },
    { nome: 'Vendas clínica', i: ind.vendasTotal, fmt: brl0 },
    { nome: 'Share avaliações', valor: { meta: taxas.share.meta, real: taxas.share.real }, fmt: (v) => fmtPct(v) },
  ]
  return (
    <div className="card overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Meta × realizado × tendência</div>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Etapa</th>
            <th className="th text-right">Meta</th><th className="th text-right">%</th>
            <th className="th text-right">Realizado</th><th className="th text-right">%</th><th className="th text-right">Por dia</th>
            <th className="th text-right">Tendência</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => {
            const ok = l.i && l.i.meta != null && l.i.tendencia != null ? l.i.tendencia >= l.i.meta : null
            return (
              <tr key={l.nome}>
                <td className="td font-medium">{l.nome}</td>
                <td className="td text-right tabular-nums">{l.fmt(l.i ? l.i.meta : l.valor!.meta)}</td>
                <td className="td text-right tabular-nums text-slate-500">{l.taxa ? fmtPct(l.taxa.meta) : ''}</td>
                <td className="td text-right font-medium tabular-nums">{l.fmt(l.i ? l.i.realizado : l.valor!.real)}</td>
                <td className="td text-right tabular-nums text-slate-500">{l.taxa ? fmtPct(l.taxa.real) : ''}</td>
                <td className="td text-right tabular-nums text-slate-500">{l.i ? l.fmt(dia(l.i.realizado)) : ''}</td>
                <td className={`td text-right font-medium tabular-nums ${ok == null ? '' : ok ? 'text-emerald-700' : 'text-red-600'}`}>{l.i ? l.fmt(l.i.tendencia) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Grafico({ p }: { p: TPainel }) {
  const dados = useMemo(() => {
    const meta = p.ind.vendasTotal.meta
    let acum = 0, uteis = 0
    const out = []
    for (let d = 1; d <= p.diasNoMes; d++) {
      acum += p.vendasTotal[d]
      if (p.util[d]) uteis++
      out.push({ dia: d, realizado: acum, ritmo: meta != null && p.diasUteis ? (meta * uteis) / p.diasUteis : null })
    }
    return out
  }, [p])
  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-semibold">Vendas acumuladas × ritmo da meta</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={4} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip formatter={(v, n) => [brl0(Number(v)), n === 'realizado' ? 'Realizado' : 'Ritmo da meta']} labelFormatter={(d) => `Dia ${d}`} />
            <Area type="monotone" dataKey="realizado" stroke="#db2777" strokeWidth={2} fill="#fce7f3" fillOpacity={0.6} />
            <Line type="monotone" dataKey="ritmo" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-brand-600" />Realizado</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-slate-400" />Ritmo da meta (por dia útil)</span>
      </div>
    </div>
  )
}

function QuadroDezenas({ p }: { p: TPainel }) {
  const linhas: { nome: string; k: keyof ConjuntoIndicadores; fmt: (v: number | null) => string }[] = [
    { nome: 'Leads', k: 'leadsTotal', fmt: int },
    { nome: 'Agend. criados', k: 'agendTotal', fmt: int },
    { nome: 'Avaliações', k: 'avaliacoes', fmt: int },
    { nome: 'Presenças', k: 'presencas', fmt: dec },
    { nome: 'Vendas av (qtd)', k: 'vendasAvQtd', fmt: dec },
    { nome: 'R$ vendas av', k: 'vendasAvValor', fmt: brl0 },
    { nome: 'R$ vendas total', k: 'vendasTotal', fmt: brl0 },
  ]
  const sep = 'border-l border-slate-200'
  return (
    <div className="card mt-4 overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Dezenas — meta × realizado de cada dezena</div>
      <table className="w-full text-right">
        <thead className="bg-slate-50">
          <tr className="text-[11px]">
            <th className="th" />
            {p.dezenas.map((d) => (
              <th key={d.numero} colSpan={3} className={`th text-center ${sep} ${d.atual ? 'bg-brand-50 text-brand-700' : ''}`}>
                {d.numero}ª dezena ({d.inicio}–{d.fim}){d.atual ? ' · atual' : ''}
              </th>
            ))}
          </tr>
          <tr>
            <th className="th text-left">Indicador</th>
            {p.dezenas.map((d) => [
              <th key={`${d.numero}r`} className={`th text-right ${sep}`}>Realizado</th>,
              <th key={`${d.numero}m`} className="th text-right">Meta</th>,
              <th key={`${d.numero}p`} className="th text-right">%</th>,
            ])}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {linhas.map((l) => (
            <tr key={l.k}>
              <td className="td text-left font-medium">{l.nome}</td>
              {p.dezenas.map((d) => {
                const i = d.periodo[l.k] as Indicador
                const pct = i.meta ? i.realizado / i.meta : null
                return [
                  <td key={`${d.numero}r`} className={`td font-medium ${sep}`}>{l.fmt(i.realizado)}</td>,
                  <td key={`${d.numero}m`} className="td text-slate-500">{l.fmt(i.meta)}</td>,
                  <td key={`${d.numero}p`} className={`td ${pct == null ? '' : pct >= 1 ? 'font-medium text-emerald-700' : 'text-slate-500'}`}>{pct == null ? '—' : fmtPct(pct, 0)}</td>,
                ]
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabelaDiaria({ p }: { p: TPainel }) {
  const cols = p.colunas
  const pct = (a: number, b: number) => (b ? fmtPct(a / b, 0) : '—')
  type Resumo = { nome: string; v: (i: Indicador) => number | null }
  const base: Resumo[] = [
    { nome: 'Realizado', v: (i) => i.realizado },
    { nome: 'Meta', v: (i) => i.meta },
    { nome: 'Restante', v: (i) => i.restante },
    { nome: 'Meta/dia', v: (i) => i.metaDia },
  ]
  const rodapes: Resumo[] = [...base, { nome: 'Tendência', v: (i) => i.tendencia }]
  const sep = 'border-l border-slate-200'
  const dias = Array.from({ length: p.diasNoMes }, (_, k) => k + 1)

  const linhasResumo = (conj: ConjuntoIndicadores, lista: Resumo[], prefixo: string, comTaxas: boolean, classe: string) => lista.map((r) => {
    const dx = r.nome === 'Realizado' || r.nome === 'Meta' || r.nome === 'Restante' ? int : dec
    return (
      <tr key={prefixo + r.nome} className={`font-medium ${classe}`}>
        <td className="td text-left text-xs uppercase tracking-wide text-slate-500">{r.nome}</td>
        {cols.map((c, k) => <td key={c.chave} className={`td ${k === 0 ? sep : ''}`}>{dx(r.v(conj.leads[c.chave]))}</td>)}
        <td className="td">{dx(r.v(conj.leadsTotal))}</td>
        {cols.map((c, k) => <td key={c.chave} className={`td ${k === 0 ? sep : ''}`}>{dx(r.v(conj.agend[c.chave]))}</td>)}
        <td className="td">{dx(r.v(conj.agendTotal))}</td>
        <td className={`td ${sep}`}>{dx(r.v(conj.avaliacoes))}</td>
        <td className="td">{dec(r.v(conj.presencas))}</td>
        <td className="td text-slate-500">{comTaxas && r.nome === 'Realizado' ? fmtPct(p.taxas.comparecimento.real, 0) : comTaxas && r.nome === 'Meta' ? fmtPct(p.taxas.comparecimento.meta, 0) : ''}</td>
        <td className={`td ${sep}`}>{dec(r.v(conj.vendasAvQtd))}</td>
        <td className="td text-slate-500">{comTaxas && r.nome === 'Realizado' ? fmtPct(p.taxas.conversao.real, 0) : comTaxas && r.nome === 'Meta' ? fmtPct(p.taxas.conversao.meta, 0) : ''}</td>
        <td className="td">{brl0(r.v(conj.vendasAvValor))}</td>
        <td className="td">{brl0(r.v(conj.vendasTotal))}</td>
      </tr>
    )
  })

  return (
    <div className="card mt-4 overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Dia a dia</div>
      <table className="w-full text-right">
        <thead className="bg-slate-50">
          <tr className="text-[11px]">
            <th className="th" />
            <th className={`th text-center ${sep}`} colSpan={cols.length + 1}>Leads</th>
            <th className={`th text-center ${sep}`} colSpan={cols.length + 1}>Agendamentos criados</th>
            <th className={`th text-center ${sep}`} colSpan={3}>Avaliações</th>
            <th className={`th text-center ${sep}`} colSpan={4}>Vendas</th>
          </tr>
          <tr>
            <th className="th">Dia</th>
            {cols.map((c, k) => <th key={c.chave} className={`th text-right ${k === 0 ? sep : ''}`}>{c.apelido}</th>)}
            <th className="th text-right">Total</th>
            {cols.map((c, k) => <th key={c.chave} className={`th text-right ${k === 0 ? sep : ''}`}>{c.apelido}</th>)}
            <th className="th text-right">Total</th>
            <th className={`th text-right ${sep}`}>Agend.</th><th className="th text-right">Pres.</th><th className="th text-right">%</th>
            <th className={`th text-right ${sep}`}>Qtd av</th><th className="th text-right">Conv.</th><th className="th text-right">R$ av</th><th className="th text-right">R$ total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {dias.map((d) => {
            const tl = cols.reduce((s, c) => s + p.leads[c.chave][d], 0)
            const ta = cols.reduce((s, c) => s + p.agend[c.chave][d], 0)
            // subtotal acumulado ao fim da 1ª e da 2ª dezena (o fim do mês fica no rodapé)
            const dez = p.dezenas.find((x) => x.fim === d && x.numero < 3)
            return [
              <tr key={d} className={p.util[d] ? '' : 'bg-slate-50 text-slate-400'}>
                <td className="td text-left font-medium">{d}</td>
                {cols.map((c, k) => <td key={c.chave} className={`td ${k === 0 ? sep : ''}`}>{p.leads[c.chave][d] || ''}</td>)}
                <td className="td font-medium">{tl || ''}</td>
                {cols.map((c, k) => <td key={c.chave} className={`td ${k === 0 ? sep : ''}`}>{p.agend[c.chave][d] || ''}</td>)}
                <td className="td font-medium">{ta || ''}</td>
                <td className={`td ${sep}`}>{p.avaliacoes[d] || ''}</td>
                <td className="td">{p.presencas[d] || ''}</td>
                <td className="td text-slate-500">{p.avaliacoes[d] ? pct(p.presencas[d], p.avaliacoes[d]) : ''}</td>
                <td className={`td ${sep}`}>{p.vendasAvQtd[d] || ''}</td>
                <td className="td text-slate-500">{p.presencas[d] ? pct(p.vendasAvQtd[d], p.presencas[d]) : ''}</td>
                <td className="td">{p.vendasAvValor[d] ? brl0(p.vendasAvValor[d]) : ''}</td>
                <td className="td">{p.vendasTotal[d] ? brl0(p.vendasTotal[d]) : ''}</td>
              </tr>,
              dez && (
                <tr key={`dz${dez.numero}`} className="border-t-2 border-brand-100 bg-brand-50">
                  <td className="td text-left text-xs font-semibold text-brand-700" colSpan={2 * cols.length + 10}>
                    Acumulado até o dia {dez.fim} ({dez.numero === 1 ? '1ª dezena' : '1ª + 2ª dezenas'})
                  </td>
                </tr>
              ),
              dez && linhasResumo(dez.acumulado, base, `dz${dez.numero}`, false, 'bg-brand-50/60'),
            ]
          })}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50 tabular-nums">
          {linhasResumo(p.ind, rodapes, 'mes', true, '')}
        </tfoot>
      </table>
    </div>
  )
}
