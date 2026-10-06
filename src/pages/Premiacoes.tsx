import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { addMeses, fimMes, fmtBRL, inicioMes, mesAtual, nomeMes } from '../lib/format'
import {
  ajustePadrao, calcularPremiacoes, STATUS,
  type Ajuste, type BlocoUnidade, type Cancelamento, type Contagem, type Regras, type Status, type VendaVendedor,
} from '../lib/premiacoes'
import { ORIGENS_AVALIACAO } from '../lib/painel'
import type { LinhaPainel, Meta } from '../lib/types'
import { ErrorBox, MonthPicker, NumInput, PageHeader, PctInput } from '../components/ui'

const brl0 = (v: number) => fmtBRL(v)

export default function Premiacoes() {
  const [aba, setAba] = useState<'calculo' | 'regras'>('calculo')
  // premiação é paga sobre o mês fechado: abre no mês anterior
  const [mes, setMes] = useState(addMeses(inicioMes(mesAtual()), -1).slice(0, 7))
  const [regras, setRegras] = useState<Regras | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('premiacao_regras').select('regras').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) setErro(error.message)
      setRegras((data?.regras ?? null) as Regras | null)
    })
  }, [])

  return (
    <div>
      <PageHeader title="Premiações" subtitle="Cálculo mensal dos prêmios da equipe"
        actions={aba === 'calculo' ? <MonthPicker value={mes} onChange={setMes} /> : null} />
      <div className="mb-4 flex gap-1.5">
        {([['calculo', 'Cálculo do mês'], ['regras', 'Regras']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${aba === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'}`}>
            {l}
          </button>
        ))}
      </div>
      <ErrorBox msg={erro} />
      {!regras ? <div className="text-sm text-slate-500">Carregando…</div>
        : aba === 'calculo' ? <Calculo mes={mes} regras={regras} setErro={setErro} />
        : <EditorRegras regras={regras} onSalvo={setRegras} setErro={setErro} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Calculo({ mes, regras, setErro }: { mes: string; regras: Regras; setErro: (s: string | null) => void }) {
  const { unidades, colaboradores, usuarios } = useApp()
  const [dados, setDados] = useState<{
    vendas: VendaVendedor[]; cancelamentos: Cancelamento[]; contagens: Contagem[]; metas: Meta[]
    status: Map<string, Status>; ajustes: Map<string, Ajuste>
  } | null>(null)

  const carregar = useCallback(async () => {
    const ini = inicioMes(mes), fim = fimMes(mes)
    const [v, c, p, m, s, a] = await Promise.all([
      supabase.from('vendas_vendedor').select('estabelecimento, vendedor, valor_liquido').eq('mes', ini),
      supabase.from('cancelamentos').select('estabelecimento, data_cancelamento, data_venda, valor_cancelado').gte('data_cancelamento', ini).lte('data_cancelamento', fim),
      supabase.rpc('painel_diario', { p_ini: ini, p_fim: fim, p_origens_av: ORIGENS_AVALIACAO }),
      supabase.from('metas').select('*').eq('mes', ini),
      supabase.from('premiacao_status').select('unidade_id, status').eq('mes', ini),
      supabase.from('premiacao_ajustes').select('*').eq('mes', ini),
    ])
    const err = [v, c, p, m, s, a].find((r) => r.error)?.error
    setErro(err ? err.message : null)
    // leads e agendamentos criados no mês, por estabelecimento + usuário
    const cont = new Map<string, Contagem>()
    for (const l of (p.data ?? []) as LinhaPainel[]) {
      if (l.metrica !== 'leads' && l.metrica !== 'agend_criados') continue
      const k = `${l.estabelecimento}|${l.pessoa}`
      const t = cont.get(k) ?? { estabelecimento: l.estabelecimento, usuario: l.pessoa, leads: 0, agendamentos: 0 }
      if (l.metrica === 'leads') t.leads += Number(l.qtd); else t.agendamentos += Number(l.qtd)
      cont.set(k, t)
    }
    setDados({
      vendas: (v.data ?? []) as VendaVendedor[],
      cancelamentos: (c.data ?? []) as Cancelamento[],
      contagens: [...cont.values()],
      metas: (m.data ?? []) as Meta[],
      status: new Map(((s.data ?? []) as { unidade_id: string | null; status: Status }[]).map((x) => [x.unidade_id ?? 'rede', x.status])),
      ajustes: new Map(((a.data ?? []) as (Ajuste & { colaborador_id: string })[]).map((x) => [x.colaborador_id, { ...x, func_mes: Number(x.func_mes) }])),
    })
  }, [mes, setErro])

  useEffect(() => { setDados(null); carregar() }, [carregar])

  const ativas = useMemo(() => unidades.filter((u) => u.ativo), [unidades])
  const r = useMemo(() => dados && calcularPremiacoes({
    unidades: ativas, colaboradores, usuarios, regras, status: dados.status, ajustes: dados.ajustes,
    vendas: dados.vendas, cancelamentos: dados.cancelamentos, contagens: dados.contagens,
  }), [dados, ativas, colaboradores, usuarios, regras])

  async function salvarStatus(unidadeId: string | null, status: Status) {
    const ini = inicioMes(mes)
    const q = supabase.from('premiacao_status').delete().eq('mes', ini)
    const del = await (unidadeId ? q.eq('unidade_id', unidadeId) : q.is('unidade_id', null))
    const ins = del.error ? del : await supabase.from('premiacao_status').insert({ mes: ini, unidade_id: unidadeId, status })
    setErro(ins.error?.message ?? null)
    setDados((d) => d && { ...d, status: new Map(d.status).set(unidadeId ?? 'rede', status) })
  }

  async function salvarAjuste(colaboradorId: string, patch: Partial<Ajuste>) {
    const atual = dados?.ajustes.get(colaboradorId) ?? ajustePadrao
    const novo = { ...atual, ...patch }
    setDados((d) => d && { ...d, ajustes: new Map(d.ajustes).set(colaboradorId, novo) })
    const { error } = await supabase.from('premiacao_ajustes').upsert({
      mes: inicioMes(mes), colaborador_id: colaboradorId, bateu_meta: novo.bateu_meta, func_mes: novo.func_mes,
      sem_garantido: novo.sem_garantido, observacao: novo.observacao, updated_at: new Date().toISOString(),
    })
    setErro(error?.message ?? null)
  }

  function exportarCSV() {
    if (!r) return
    const cab = ['Unidade', 'Nome', 'Função', 'Vendas', 'Faixa', 'Agendamentos', 'Captações', 'Bateu meta', 'Prêmio agend.', 'Prêmio capt.', 'Prêmio vendas', 'Func. mês', 'Garantido', 'Fixo', 'Total']
    const num = (n: number) => n.toFixed(2).replace('.', ',')
    const linhas = r.blocos.flatMap((b) => b.linhas.map((l) => [
      b.unidade?.nome ?? 'Rede', l.colaborador.nome, l.colaborador.funcao, num(l.vendas), l.faixa, l.agendamentos, l.captacoes,
      l.ajuste.bateu_meta ? 'S' : 'N', num(l.premioAgendamentos), num(l.premioCaptacoes), num(l.premioVendas), num(l.funcMes),
      num(l.garantido), num(l.fixo), num(l.total),
    ]))
    const csv = '﻿' + [cab, ...linhas].map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `premiacoes-${mes}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  if (!dados || !r) return <div className="text-sm text-slate-500">Carregando…</div>
  const metaDe = (unidadeId: string) => dados.metas.find((m) => m.unidade_id === unidadeId)

  return (
    <div className="space-y-4">
      {dados.vendas.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Não há vendas por vendedor importadas para {nomeMes(mes).toLowerCase()}. <Link to="/importar" className="font-medium underline">Importar o relatório</Link> (escolha o mês na conferência).
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="card px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total de premiações — {nomeMes(mes)}</div>
          <div className="text-2xl font-semibold tabular-nums text-brand-700">{brl0(r.total)}</div>
        </div>
        <button className="btn-ghost" onClick={exportarCSV}><Download size={16} /> Exportar planilha (CSV)</button>
      </div>

      {r.blocos.map((b) => (
        <BlocoCard key={b.unidade?.id ?? 'rede'} b={b} regras={regras}
          meta={b.unidade ? metaDe(b.unidade.id) : undefined} metasRede={b.unidade ? undefined : dados.metas}
          onStatus={(st) => salvarStatus(b.unidade?.id ?? null, st)} onAjuste={salvarAjuste} />
      ))}

      {colaboradores.filter((c) => !c.unidade_id && c.ativo).length === 0 && (
        <p className="text-xs text-slate-500">
          Para calcular o prêmio da gerente sobre as 3 unidades, cadastre-a em <Link to="/cadastros" className="underline">Cadastros → Equipe → Rede</Link> com a função Gerente.
        </p>
      )}

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Como é calculado</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Status</b> da unidade (Nenhum, Meta ou Super) é escolhido à mão; a Rede tem status próprio para a gerente.</li>
          <li><b>Vendas líquidas da unidade</b> = vendas do relatório por vendedor − cancelamentos do mês. Cancelamentos de vendas feitas há mais de 1 ano são ignorados.</li>
          <li><b>Faixa</b> = vendas da pessoa ÷ 10.000 (sem casas). Acima da última faixa da tabela, paga a última faixa.</li>
          <li><b>Consultora</b>: prêmio de vendas pela faixa; + prêmio de agendamentos se tiver ≥ {regras.limiteAgendamentos}; + prêmio de captações (leads) se tiver ≥ {regras.limiteCaptacoes}.</li>
          <li><b>Aplicadora</b>: prêmio de vendas pela tabela das esteticistas.</li>
          <li><b>Subgerente</b>: % das vendas líquidas da unidade. <b>Gerente</b>: % das vendas líquidas das unidades (Rede).</li>
          <li><b>Funcionário do mês</b> só conta quando o status é Super. Os prêmios só são pagos se "Bateu meta" estiver marcado.</li>
          <li><b>Garantido</b>: consultora sem prêmio de meta recebe {brl0(regras.garantidoConsultora)}, a menos que seja retirado (faltas etc.).</li>
          <li><b>Valor fixo</b>: exceções cadastradas em Cadastros → Equipe (ex.: limpeza), pago todo mês.</li>
          <li>Agendamentos = criados no mês pelo usuário; captações = leads cadastrados no mês pelo usuário. Usuários são ligados às pessoas pelo de/para da Equipe.</li>
        </ul>
      </details>
    </div>
  )
}

function BlocoCard({ b, regras, meta, metasRede, onStatus, onAjuste }: {
  b: BlocoUnidade; regras: Regras; meta?: Meta; metasRede?: Meta[]
  onStatus: (s: Status) => void; onAjuste: (colaboradorId: string, patch: Partial<Ajuste>) => void
}) {
  const refMeta = meta ? Number(meta.meta_faturamento) : metasRede?.reduce((s, m) => s + Number(m.meta_faturamento), 0) ?? 0
  const refSuper = meta ? Number(meta.super_meta) : metasRede?.reduce((s, m) => s + Number(m.super_meta), 0) ?? 0
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="text-base font-semibold">{b.unidade?.nome ?? 'Rede (3 unidades)'}</div>
        <label className="flex items-center gap-2 text-sm">
          Status
          <select className="input w-32" value={b.status} onChange={(e) => onStatus(e.target.value as Status)}>
            {STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <div className="text-sm text-slate-600">
          Vendas <b className="tabular-nums text-slate-800">{brl0(b.vendas)}</b>
          {' − '}cancel. <b className="tabular-nums text-slate-800">{brl0(b.cancelamentos)}</b>
          {' = '}líquido <b className="tabular-nums text-slate-900">{brl0(b.liquido)}</b>
        </div>
        {(refMeta > 0 || refSuper > 0) && (
          <div className="text-xs text-slate-500">
            {refMeta > 0 && <>Meta {brl0(refMeta)} {b.liquido >= refMeta ? '✓' : ''}</>}
            {refMeta > 0 && refSuper > 0 && ' · '}
            {refSuper > 0 && <>Super {brl0(refSuper)} {b.liquido >= refSuper ? '✓' : ''}</>}
          </div>
        )}
        {b.cancelamentosIgnorados > 0 && (
          <div className="text-xs text-slate-500">{brl0(b.cancelamentosIgnorados)} em cancelamentos de vendas com mais de 1 ano ignorados</div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead>
            <tr>
              <th className="th text-left">Nome</th><th className="th text-left">Função</th>
              <th className="th text-right">Vendas</th><th className="th text-right">Faixa</th>
              <th className="th text-right">Agend.</th><th className="th text-right">Capt.</th>
              <th className="th text-center">Bateu meta</th>
              <th className="th border-l border-slate-200 text-right">Pr. agend.</th><th className="th text-right">Pr. capt.</th><th className="th text-right">Pr. vendas</th>
              <th className="th text-right">Func. mês</th><th className="th text-right">Garantido</th><th className="th text-right">Fixo</th>
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {b.linhas.length === 0 && (
              <tr><td className="td text-left text-slate-500" colSpan={14}>Ninguém cadastrado. <Link to="/cadastros" className="underline">Cadastrar a equipe</Link></td></tr>
            )}
            {b.linhas.map((l) => {
              const c = l.colaborador
              const usaMetas = c.funcao !== 'Outro'
              return (
                <tr key={c.id}>
                  <td className="td text-left font-medium">{c.nome}</td>
                  <td className="td text-left text-slate-500">{c.funcao}</td>
                  <td className="td">{b.unidade ? brl0(l.vendas) : '—'}</td>
                  <td className="td" title={l.faixaAcimaDaTabela ? 'Acima da última faixa da tabela: paga a última faixa' : undefined}>
                    {b.unidade ? <>{l.faixa}{l.faixaAcimaDaTabela && <span className="text-amber-600">↑</span>}</> : '—'}
                  </td>
                  <td className={`td ${c.funcao === 'Consultora' && l.agendamentos >= regras.limiteAgendamentos ? 'font-semibold text-emerald-700' : ''}`}>{b.unidade ? l.agendamentos : '—'}</td>
                  <td className={`td ${l.captacoes >= regras.limiteCaptacoes ? 'font-semibold text-emerald-700' : ''}`}>{b.unidade ? l.captacoes : '—'}</td>
                  <td className="td text-center">
                    {usaMetas && <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={l.ajuste.bateu_meta} onChange={(e) => onAjuste(c.id, { bateu_meta: e.target.checked })} />}
                  </td>
                  <td className="td border-l border-slate-200">{l.premioAgendamentos ? brl0(l.premioAgendamentos) : ''}</td>
                  <td className="td">{l.premioCaptacoes ? brl0(l.premioCaptacoes) : ''}</td>
                  <td className="td">{l.premioVendas ? brl0(l.premioVendas) : ''}</td>
                  <td className="td">
                    {usaMetas && b.status === 'Super'
                      ? <NumInput className="ml-auto w-24 text-right" value={l.ajuste.func_mes || null} placeholder="0" onChange={(v) => onAjuste(c.id, { func_mes: v })} />
                      : ''}
                  </td>
                  <td className="td">
                    {c.funcao === 'Consultora' && (l.calculado === 0 || l.ajuste.sem_garantido) && (
                      <label className="inline-flex items-center justify-end gap-1.5" title="Desmarque para retirar o garantido (faltas etc.)">
                        <span className={l.garantido ? '' : 'text-slate-400 line-through'}>{brl0(regras.garantidoConsultora)}</span>
                        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!l.ajuste.sem_garantido} onChange={(e) => onAjuste(c.id, { sem_garantido: !e.target.checked })} />
                      </label>
                    )}
                  </td>
                  <td className="td">{l.fixo ? brl0(l.fixo) : ''}</td>
                  <td className="td font-semibold">{brl0(l.total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold tabular-nums">
            <tr><td className="td text-left" colSpan={13}>Total {b.unidade?.nome ?? 'Rede'}</td><td className="td">{brl0(b.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      {b.semVinculo.length > 0 && (
        <div className="border-t border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">
          Usuários sem vínculo com a equipe (não entram em ninguém):{' '}
          {b.semVinculo.slice(0, 8).map((s) => `${s.usuario} (${[s.vendas ? brl0(s.vendas) : '', s.leads ? `${s.leads} leads` : '', s.agendamentos ? `${s.agendamentos} agend.` : ''].filter(Boolean).join(', ')})`).join('; ')}
          {b.semVinculo.length > 8 && ` e mais ${b.semVinculo.length - 8}`}. <Link to="/cadastros" className="font-medium underline">Ajustar de/para</Link>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function EditorRegras({ regras, onSalvo, setErro }: { regras: Regras; onSalvo: (r: Regras) => void; setErro: (s: string | null) => void }) {
  const [r, setR] = useState<Regras>(regras)
  const [ok, setOk] = useState(false)
  const set = (patch: Partial<Regras>) => { setR({ ...r, ...patch }); setOk(false) }

  async function salvar() {
    const ordenado = { ...r, consultora: [...r.consultora].sort((a, b) => a.faixa - b.faixa), aplicadora: [...r.aplicadora].sort((a, b) => a.faixa - b.faixa) }
    const { error } = await supabase.from('premiacao_regras').update({ regras: ordenado, updated_at: new Date().toISOString() }).eq('id', 1)
    setErro(error?.message ?? null)
    if (!error) { setR(ordenado); onSalvo(ordenado); setOk(true) }
  }

  const setCons = (i: number, st: 'Meta' | 'Super', campo: 'captacoes' | 'agendamentos' | 'vendas', v: number) =>
    set({ consultora: r.consultora.map((x, k) => (k === i ? { ...x, [st]: { ...x[st], [campo]: v } } : x)) })

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-4 sm:grid-cols-3">
        <label className="block"><span className="label">Mínimo de captações (leads) para o prêmio</span><NumInput step="1" value={r.limiteCaptacoes} onChange={(v) => set({ limiteCaptacoes: v })} /></label>
        <label className="block"><span className="label">Mínimo de agendamentos para o prêmio</span><NumInput step="1" value={r.limiteAgendamentos} onChange={(v) => set({ limiteAgendamentos: v })} /></label>
        <label className="block"><span className="label">Garantido da consultora sem prêmio (R$)</span><NumInput value={r.garantidoConsultora} onChange={(v) => set({ garantidoConsultora: v })} /></label>
        <label className="block"><span className="label">Subgerente — % na Meta</span><PctInput value={r.subgerente.Meta} onChange={(v) => set({ subgerente: { ...r.subgerente, Meta: v } })} /></label>
        <label className="block"><span className="label">Subgerente — % na Super</span><PctInput value={r.subgerente.Super} onChange={(v) => set({ subgerente: { ...r.subgerente, Super: v } })} /></label>
        <div />
        <label className="block"><span className="label">Gerente — % na Meta</span><PctInput value={r.gerente.Meta} onChange={(v) => set({ gerente: { ...r.gerente, Meta: v } })} /></label>
        <label className="block"><span className="label">Gerente — % na Super</span><PctInput value={r.gerente.Super} onChange={(v) => set({ gerente: { ...r.gerente, Super: v } })} /></label>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Consultoras — prêmios por faixa (faixa = vendas ÷ 10.000)</div>
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Faixa</th>
              <th className="th border-l border-slate-200" colSpan={3}>Meta: captações · agend. · vendas</th>
              <th className="th border-l border-slate-200" colSpan={3}>Super: captações · agend. · vendas</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.consultora.map((x, i) => (
              <tr key={i}>
                <td className="td"><NumInput step="1" className="w-16" value={x.faixa} onChange={(v) => set({ consultora: r.consultora.map((y, k) => (k === i ? { ...y, faixa: v } : y)) })} /></td>
                {(['Meta', 'Super'] as const).map((st) => (['captacoes', 'agendamentos', 'vendas'] as const).map((campo, j) => (
                  <td key={st + campo} className={`td ${j === 0 ? 'border-l border-slate-200' : ''}`}>
                    <NumInput className="w-24 text-right" value={x[st][campo]} onChange={(v) => setCons(i, st, campo, v)} />
                  </td>
                )))}
                <td className="td text-right"><button className="btn-danger p-1.5" onClick={() => set({ consultora: r.consultora.filter((_, k) => k !== i) })} aria-label="Remover faixa"><Trash2 size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-slate-100 p-3">
          <button className="btn-ghost" onClick={() => {
            const ult = r.consultora[r.consultora.length - 1]
            set({ consultora: [...r.consultora, ult ? { ...ult, faixa: ult.faixa + 1 } : { faixa: 2, Meta: { captacoes: 0, agendamentos: 0, vendas: 0 }, Super: { captacoes: 0, agendamentos: 0, vendas: 0 } }] })
          }}><Plus size={16} /> Adicionar faixa</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Aplicadoras (esteticistas) — prêmio de vendas por faixa</div>
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th className="th">Faixa</th><th className="th">Meta (R$)</th><th className="th">Super (R$)</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {r.aplicadora.map((x, i) => (
              <tr key={i}>
                <td className="td"><NumInput step="1" className="w-16" value={x.faixa} onChange={(v) => set({ aplicadora: r.aplicadora.map((y, k) => (k === i ? { ...y, faixa: v } : y)) })} /></td>
                <td className="td"><NumInput className="w-28 text-right" value={x.Meta} onChange={(v) => set({ aplicadora: r.aplicadora.map((y, k) => (k === i ? { ...y, Meta: v } : y)) })} /></td>
                <td className="td"><NumInput className="w-28 text-right" value={x.Super} onChange={(v) => set({ aplicadora: r.aplicadora.map((y, k) => (k === i ? { ...y, Super: v } : y)) })} /></td>
                <td className="td text-right"><button className="btn-danger p-1.5" onClick={() => set({ aplicadora: r.aplicadora.filter((_, k) => k !== i) })} aria-label="Remover faixa"><Trash2 size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-slate-100 p-3">
          <button className="btn-ghost" onClick={() => {
            const ult = r.aplicadora[r.aplicadora.length - 1]
            set({ aplicadora: [...r.aplicadora, ult ? { ...ult, faixa: ult.faixa + 1 } : { faixa: 2, Meta: 0, Super: 0 }] })
          }}><Plus size={16} /> Adicionar faixa</button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {ok && <span className="text-sm text-emerald-700">Regras salvas.</span>}
        <button className="btn-primary" onClick={salvar}><Save size={16} /> Salvar regras</button>
      </div>
    </div>
  )
}
