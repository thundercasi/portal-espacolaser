import { useCallback, useEffect, useMemo, useState } from 'react'
import { Crown, Maximize2, Minimize2, RefreshCw, Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtPct, hojeISO } from '../lib/format'
import { ErrorBox } from '../components/ui'

interface Disputa { id: string; nome: string; premio: string | null; inicio: string; fim: string }
interface Linha { participante: string; unidade: string; leads: number; comparecimentos: number }

// cor de cada unidade (pela ordem alfabética do nome, estável entre telas)
const CORES = [
  { chip: 'bg-pink-100 text-pink-700 ring-pink-200', barra: 'bg-pink-500' },
  { chip: 'bg-sky-100 text-sky-700 ring-sky-200', barra: 'bg-sky-500' },
  { chip: 'bg-emerald-100 text-emerald-700 ring-emerald-200', barra: 'bg-emerald-500' },
  { chip: 'bg-violet-100 text-violet-700 ring-violet-200', barra: 'bg-violet-500' },
]
const MEDALHAS = [
  { nome: '1º', fundo: 'from-amber-300 to-yellow-500', anel: 'ring-amber-300', altura: 'sm:pt-0', texto: 'text-amber-900' },
  { nome: '2º', fundo: 'from-slate-200 to-slate-400', anel: 'ring-slate-300', altura: 'sm:pt-8', texto: 'text-slate-800' },
  { nome: '3º', fundo: 'from-orange-300 to-amber-700', anel: 'ring-orange-300', altura: 'sm:pt-14', texto: 'text-orange-950' },
]

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

export default function DisputaPage() {
  const [disputa, setDisputa] = useState<Disputa | null>(null)
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [unidade, setUnidade] = useState('todas')
  const [erro, setErro] = useState<string | null>(null)
  const [atualizado, setAtualizado] = useState<Date | null>(null)
  const [cheia, setCheia] = useState(false)

  const carregar = useCallback(async () => {
    const d = await supabase.from('disputas').select('*').eq('ativa', true).order('fim', { ascending: false }).limit(1).maybeSingle()
    if (d.error) { setErro(d.error.message); return }
    if (!d.data) { setDisputa(null); setLinhas([]); return }
    setDisputa(d.data as Disputa)
    const r = await supabase.rpc('ranking_disputa', { p_disputa: d.data.id })
    if (r.error) { setErro(r.error.message); return }
    setErro(null)
    setLinhas(((r.data ?? []) as Linha[]).map((x) => ({ ...x, leads: Number(x.leads), comparecimentos: Number(x.comparecimentos) })))
    setAtualizado(new Date())
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5 * 60 * 1000) // atualiza sozinho (tela na TV)
    return () => clearInterval(t)
  }, [carregar])

  useEffect(() => {
    const f = () => setCheia(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const alternarTelaCheia = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})

  const unidades = useMemo(() => [...new Set((linhas ?? []).map((l) => l.unidade))].sort(), [linhas])
  const corDe = (u: string) => CORES[Math.max(0, unidades.indexOf(u)) % CORES.length]
  const ranking = useMemo(() => (linhas ?? [])
    .filter((l) => unidade === 'todas' || l.unidade === unidade)
    .filter((l) => l.leads > 0)
    .sort((a, b) => b.comparecimentos - a.comparecimentos || (b.comparecimentos / (b.leads || 1)) - (a.comparecimentos / (a.leads || 1)) || a.participante.localeCompare(b.participante)),
  [linhas, unidade])
  const lider = ranking[0]?.comparecimentos || 1
  const hoje = hojeISO()
  const faltam = disputa ? diasEntre(hoje, disputa.fim) : 0
  const encerrada = disputa ? hoje > disputa.fim : false
  const nomeCurto = (n: string) => n.split(' ').slice(0, 2).map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(' ')

  return (
    <div className={cheia ? 'min-h-screen bg-slate-950 p-6' : ''}>
      <ErrorBox msg={erro} />

      {/* topo */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-brand-200">
              <Smartphone size={16} /> Prêmio: {disputa?.premio ?? '—'}
            </div>
            <h1 className="mt-1 text-2xl font-bold sm:text-4xl">{disputa?.nome ?? 'Disputa'}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Quem tiver mais <b className="text-white">leads captados que compareceram à avaliação</b> leva.
              {disputa && <> Leads de {fmtData(disputa.inicio)} a {fmtData(disputa.fim)}; cada cliente conta uma vez, para quem o captou primeiro.</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {disputa && (
              <div className="rounded-xl bg-white/10 px-4 py-3 text-center ring-1 ring-white/20 backdrop-blur">
                <div className="text-3xl font-bold tabular-nums">{encerrada ? '🏁' : Math.max(faltam, 0)}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-300">{encerrada ? 'encerrada' : faltam === 1 ? 'dia restante' : 'dias restantes'}</div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <button className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20" onClick={alternarTelaCheia}>
                {cheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />} {cheia ? 'Sair' : 'Tela cheia'}
              </button>
              <button className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20" onClick={carregar}><RefreshCw size={16} /> Atualizar</button>
            </div>
          </div>
        </div>
        {/* filtro por unidade */}
        <div className="relative mt-5 flex flex-wrap gap-1.5">
          {['todas', ...unidades].map((u) => (
            <button key={u} onClick={() => setUnidade(u)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${unidade === u ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200 hover:bg-white/20'}`}>
              {u === 'todas' ? 'Todas as unidades' : u}
            </button>
          ))}
        </div>
      </div>

      {!linhas ? <div className="mt-6 text-sm text-slate-500">Carregando…</div> : ranking.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm text-slate-500">Ainda não há leads no período da disputa.</div>
      ) : (
        <>
          {/* pódio */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3 sm:items-end">
            {[1, 0, 2].map((pos) => {
              const l = ranking[pos]
              if (!l) return <div key={pos} className="hidden sm:block" />
              const m = MEDALHAS[pos]
              return (
                <div key={pos} className={`${pos === 0 ? 'order-first sm:order-none' : ''} ${m.altura}`}>
                  <div className={`relative rounded-2xl bg-white p-5 text-center shadow-md ring-2 ${m.anel}`}>
                    {pos === 0 && <Crown className="absolute -top-5 left-1/2 -translate-x-1/2 text-amber-400 drop-shadow" size={40} fill="currentColor" />}
                    <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br ${m.fundo} text-lg font-extrabold ${m.texto} shadow`}>{m.nome}</div>
                    <div className="mt-3 truncate text-lg font-bold text-slate-900" title={l.participante}>{nomeCurto(l.participante)}</div>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${corDe(l.unidade).chip}`}>{l.unidade}</span>
                    <div className="mt-3 text-5xl font-extrabold tabular-nums text-slate-900">{l.comparecimentos}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">comparecimentos</div>
                    <div className="mt-2 text-sm text-slate-600">{l.leads} leads · {fmtPct(l.comparecimentos / (l.leads || 1), 1)} compareceram</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ranking completo */}
          <div className="card mt-6 overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-semibold">Classificação</span>
              {atualizado && <span className="text-xs text-slate-500">Atualizado às {atualizado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · dados do ELOS até a última coleta</span>}
            </div>
            <ol className="divide-y divide-slate-100">
              {ranking.map((l, i) => (
                <li key={l.participante + l.unidade} className={`flex items-center gap-4 px-5 py-3 ${i < 3 ? 'bg-amber-50/40' : ''}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i < 3 ? `bg-gradient-to-br ${MEDALHAS[i].fundo} ${MEDALHAS[i].texto}` : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-slate-900" title={l.participante}>{nomeCurto(l.participante)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${corDe(l.unidade).chip}`}>{l.unidade}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${corDe(l.unidade).barra} transition-all duration-700`} style={{ width: `${(l.comparecimentos / lider) * 100}%` }} />
                    </div>
                  </div>
                  <div className="w-20 text-right">
                    <div className="text-2xl font-bold tabular-nums text-slate-900">{l.comparecimentos}</div>
                    <div className="text-[11px] text-slate-500">comparec.</div>
                  </div>
                  <div className="hidden w-28 text-right text-sm text-slate-600 sm:block">
                    <div className="tabular-nums">{l.leads} leads</div>
                    <div className="text-[11px] text-slate-500">{fmtPct(l.comparecimentos / (l.leads || 1), 1)} compareceram</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Empate: vence quem tiver a maior taxa de comparecimento. Lead e avaliação são ligados pelo telefone do cliente; leads com telefone oculto no ELOS não pontuam.
          </p>
        </>
      )}
    </div>
  )
}
