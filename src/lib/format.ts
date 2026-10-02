const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export const fmtBRL = (v: number | null | undefined) => brl.format(Number(v ?? 0))
export const fmtMoeda = (v: number | null | undefined, moeda = 'USD') =>
  moeda === 'BRL' ? brl.format(Number(v ?? 0)) : moeda === 'USD' ? usd.format(Number(v ?? 0)) : `${moeda} ${num.format(Number(v ?? 0))}`
export const fmtNum = (v: number | null | undefined) => num.format(Number(v ?? 0))
export const fmtPct = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : `${(Number(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
export const fmtData = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export const hojeISO = () => {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
export const mesAtual = () => hojeISO().slice(0, 7)
export const inicioMes = (ym: string) => `${ym}-01`
export const fimMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}
export const nomeMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const addMeses = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}
/** aceita "1.234,56", "1234.56", "1234,5" */
export const parseNum = (s: string | number | null | undefined): number => {
  if (typeof s === 'number') return s
  if (!s) return 0
  const t = String(s).trim()
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(norm)
  return Number.isFinite(n) ? n : 0
}
