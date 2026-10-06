import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import readXlsxFile from 'read-excel-file/browser'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { diagnosticar, lerCSV, lerLinhas, normalizar, type Lote } from '../lib/importar'
import { addMeses, fimMes, fmtData, inicioMes, mesAtual } from '../lib/format'
import type { Importacao } from '../lib/types'
import { Badge, Empty, ErrorBox, MonthPicker, PageHeader } from '../components/ui'

const TIPO_LABEL = {
  leads: 'Leads', agendamentos: 'Agendamentos', vendas: 'Vendas', vendas_vendedor: 'Vendas por vendedor', cancelamentos: 'Cancelamentos',
} as const
const CHAVE = {
  leads: 'id_lead', agendamentos: 'chave', vendas: 'id_orcamento', vendas_vendedor: 'mes,estabelecimento,vendedor', cancelamentos: 'orcamento,item',
} as const
const LOTE_DB = 500

function descreverIgnorada(nome: string, linhas: Parameters<typeof diagnosticar>[0]) {
  const d = diagnosticar(linhas)
  return d ? `${nome} (parece ${TIPO_LABEL[d.tipo]}, mas falta a coluna ${d.faltando.map((x) => `"${x}"`).join(', ')})` : nome
}

async function lerArquivo(f: File): Promise<{ lotes: Lote[]; ignoradas: string[] }> {
  const lotes: Lote[] = [], ignoradas: string[] = []
  if (/\.csv$|\.txt$/i.test(f.name)) {
    const buf = await f.arrayBuffer()
    let texto = new TextDecoder('utf-8').decode(buf)
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
    const linhas = lerCSV(texto.replace(/^﻿/, ''))
    const lote = await lerLinhas(linhas, f.name)
    if (lote) lotes.push(lote); else ignoradas.push(descreverIgnorada(f.name, linhas))
  } else {
    for (const s of await readXlsxFile(f)) {
      const lote = await lerLinhas(s.data as never, `${f.name} › ${s.sheet}`)
      if (lote) lotes.push(lote); else ignoradas.push(descreverIgnorada(`${f.name} › ${s.sheet}`, s.data as never))
    }
  }
  return { lotes, ignoradas }
}

export default function Importar() {
  const { unidades } = useApp()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [ignoradas, setIgnoradas] = useState<string[]>([])
  const [lendo, setLendo] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [historico, setHistorico] = useState<Importacao[]>([])
  const [arrastando, setArrastando] = useState(false)
  // o relatório de vendas por vendedor não tem data: por padrão, mês anterior (fechamento)
  const [mesVendedor, setMesVendedor] = useState(addMeses(inicioMes(mesAtual()), -1).slice(0, 7))

  const carregarHistorico = () =>
    supabase.from('importacoes').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setHistorico((data ?? []) as Importacao[]))
  useEffect(() => { carregarHistorico() }, [])

  async function selecionar(files: FileList | null) {
    if (!files?.length) return
    setLendo(true); setErro(null); setOk(null); setLotes([]); setIgnoradas([])
    try {
      const todos: Lote[] = [], ign: string[] = []
      for (const f of Array.from(files)) {
        const r = await lerArquivo(f)
        todos.push(...r.lotes); ign.push(...r.ignoradas)
      }
      setLotes(todos); setIgnoradas(ign)
      if (!todos.length) setErro(ign.some((x) => x.includes('falta a coluna'))
        ? `Nenhuma aba reconhecida: ${ign.filter((x) => x.includes('falta a coluna')).join('; ')}.`
        : 'Nenhuma aba reconhecida. O arquivo precisa ter os cabeçalhos da exportação (ex.: "Id Lead", "Data Agendada", "ID Orç.", "Vendedor", "Valor Cancelado").')
    } catch (e) {
      setErro(`Não foi possível ler o arquivo: ${(e as Error).message}`)
    }
    setLendo(false)
  }

  async function importar() {
    setErro(null); setOk(null)
    try {
      for (const l of lotes) {
        for (let i = 0; i < l.linhas.length; i += LOTE_DB) {
          setProgresso(`${TIPO_LABEL[l.tipo]}: ${Math.min(i + LOTE_DB, l.linhas.length)} de ${l.linhas.length}`)
          const linhas = l.tipo === 'vendas_vendedor' ? l.linhas.map((r) => ({ ...r, mes: inicioMes(mesVendedor) })) : l.linhas
          const { error } = await supabase.from(l.tipo).upsert(linhas.slice(i, i + LOTE_DB) as never[], { onConflict: CHAVE[l.tipo] })
          if (error) throw error
        }
        await supabase.from('importacoes').insert({
          arquivo: l.origem, tipo: l.tipo, linhas: l.linhas.length, periodo_ini: l.tipo === 'vendas_vendedor' ? inicioMes(mesVendedor) : l.periodo?.[0] ?? null,
          periodo_fim: l.tipo === 'vendas_vendedor' ? fimMes(mesVendedor) : l.periodo?.[1] ?? null,
        })
      }
      setOk(`Importação concluída: ${lotes.map((l) => `${l.linhas.length} ${TIPO_LABEL[l.tipo].toLowerCase()}`).join(', ')}.`)
      setLotes([])
      carregarHistorico()
    } catch (e) {
      setErro(`Erro ao gravar: ${(e as Error).message}`)
    }
    setProgresso(null)
  }

  const estabsConhecidos = new Set(unidades.map((u) => normalizar(u.estabelecimento)))
  const desconhecidos = [...new Set(lotes.flatMap((l) => (l.linhas as { estabelecimento: string }[]).map((r) => r.estabelecimento)))]
    .filter((e) => !estabsConhecidos.has(normalizar(e)))

  const onDrop = (e: DragEvent) => { e.preventDefault(); setArrastando(false); selecionar(e.dataTransfer.files) }

  return (
    <div>
      <PageHeader title="Importar" subtitle="Envie as exportações de Leads, Agendamentos e Vendas (.xlsx ou .csv). Pode ser a planilha inteira: cada aba é reconhecida pelos cabeçalhos." />

      <label onDragOver={(e) => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)} onDrop={onDrop}
        className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-4 py-10 text-center transition ${arrastando ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:bg-slate-50'}`}>
        <Upload className="text-slate-400" />
        <span className="text-sm font-medium">{lendo ? 'Lendo arquivo…' : 'Clique ou arraste os arquivos aqui'}</span>
        <span className="text-xs text-slate-500">Registros já importados são atualizados (sem duplicar)</span>
        <input type="file" multiple accept=".xlsx,.csv,.txt" className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => { selecionar(e.target.files); e.target.value = '' }} />
      </label>

      <div className="mt-4"><ErrorBox msg={erro} /></div>
      {ok && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</div>}

      {lotes.length > 0 && (
        <div className="card mb-6 p-4">
          <div className="mb-3 text-sm font-semibold">Conferir antes de gravar</div>
          <div className="space-y-2">
            {lotes.map((l, k) => (
              <div key={k} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <FileSpreadsheet size={16} className="text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{l.origem}</span>
                <Badge className="bg-brand-100 text-brand-700">{TIPO_LABEL[l.tipo]}</Badge>
                <span className="tabular-nums">{l.linhas.length.toLocaleString('pt-BR')} registros</span>
                {l.periodo && <span className="text-slate-500">{fmtData(l.periodo[0])} a {fmtData(l.periodo[1])}</span>}
                {l.tipo === 'vendas_vendedor' && (
                  <span className="flex items-center gap-2 text-slate-600">Mês das vendas: <MonthPicker value={mesVendedor} onChange={setMesVendedor} /></span>
                )}
                {l.ignoradas > 0 && <span className="text-amber-700">{l.ignoradas} linhas sem data/ID ignoradas</span>}
              </div>
            ))}
          </div>
          {ignoradas.length > 0 && <p className="mt-2 text-xs text-slate-500">Abas não reconhecidas (ignoradas): {ignoradas.join(', ')}</p>}
          {desconhecidos.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Estabelecimentos que não estão em Cadastros → Unidades (serão gravados, mas não aparecem no painel): {desconhecidos.join('; ')}
            </p>
          )}
          <div className="mt-4 flex items-center justify-end gap-3">
            {progresso && <span className="text-sm text-slate-500">{progresso}</span>}
            <button className="btn-ghost" onClick={() => setLotes([])} disabled={!!progresso}>Cancelar</button>
            <button className="btn-primary" onClick={importar} disabled={!!progresso}>Gravar</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Últimas importações</div>
        {historico.length === 0 ? <Empty>Nenhuma importação ainda.</Empty> : (
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className="th">Quando</th><th className="th">Arquivo</th><th className="th">Tipo</th><th className="th text-right">Registros</th><th className="th">Período</th><th className="th">Por</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {historico.map((h) => (
                <tr key={h.id}>
                  <td className="td">{new Date(h.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="td max-w-xs truncate">{h.arquivo}</td>
                  <td className="td">{TIPO_LABEL[h.tipo]}</td>
                  <td className="td text-right tabular-nums">{h.linhas.toLocaleString('pt-BR')}</td>
                  <td className="td">{h.periodo_ini ? `${fmtData(h.periodo_ini)} a ${fmtData(h.periodo_fim)}` : '—'}</td>
                  <td className="td text-slate-500">{h.usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
