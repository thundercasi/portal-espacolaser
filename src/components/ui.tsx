import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, wide, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 sm:p-6">
      <div className={`card my-4 w-full ${wide ? 'max-w-5xl' : 'max-w-xl'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="label">{label}</span>{children}</label>
}

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'pos' | 'neg' }) {
  const cor = tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-red-600' : 'text-slate-900'
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl ${cor}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>
}

export function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="month" className="input w-40" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
}

/** input numérico que aceita vírgula */
export function NumInput({ value, onChange, step, className = '', placeholder, disabled }: {
  value: number | null | undefined; onChange: (n: number) => void; step?: string; className?: string; placeholder?: string; disabled?: boolean
}) {
  return (
    <input type="number" inputMode="decimal" step={step ?? '0.01'} className={`input tabular-nums ${className}`} placeholder={placeholder}
      disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
  )
}

/** percentual digitado como 40 -> salvo como 0.40 */
export function PctInput({ value, onChange, className = '' }: { value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <div className="relative">
      <input type="number" step="0.01" className={`input pr-7 tabular-nums ${className}`}
        value={Number.isFinite(value) ? +(value * 100).toFixed(4) : ''} onChange={(e) => onChange(Number(e.target.value || 0) / 100)} />
      <span className="pointer-events-none absolute right-2.5 top-2 text-sm text-slate-400">%</span>
    </div>
  )
}
