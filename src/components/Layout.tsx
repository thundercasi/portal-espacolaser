import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Upload, Target, Users, LogOut, Menu, Filter, Calculator } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

const NAV = [
  {
    titulo: 'Funil',
    itens: [
      { to: '/', label: 'Painel', icon: BarChart3, end: true },
      { to: '/importar', label: 'Importar', icon: Upload },
      { to: '/metas', label: 'Metas', icon: Target },
    ],
  },
  {
    titulo: 'Ferramentas',
    itens: [
      { to: '/cancelamento', label: 'Cancelamento', icon: Calculator },
    ],
  },
  {
    titulo: 'Configurações',
    itens: [
      { to: '/cadastros', label: 'Cadastros', icon: Users },
    ],
  },
]

export default function Layout() {
  const [aberto, setAberto] = useState(false)
  const { session } = useApp()
  return (
    <div className="flex min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-40 w-56 transform bg-slate-900 text-slate-200 transition lg:static lg:translate-x-0 ${aberto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600"><Filter size={17} className="text-white" /></div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">Funil Espaçolaser</div>
            <div className="text-[11px] text-slate-400">Leads → vendas</div>
          </div>
        </div>
        <nav className="space-y-4 px-3">
          {NAV.map((grupo) => (
            <div key={grupo.titulo}>
              <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{grupo.titulo}</div>
              <div className="space-y-0.5">
                {grupo.itens.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={() => setAberto(false)}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-800 font-medium text-white' : 'text-slate-300 hover:bg-slate-800/60'}`}>
                    <Icon size={17} /> {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-800 p-3">
          <div className="truncate px-2 pb-2 text-xs text-slate-400">{session?.user.email}</div>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      {aberto && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setAberto(false)} />}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button className="btn-ghost p-1.5" onClick={() => setAberto(true)} aria-label="Menu"><Menu size={20} /></button>
          <span className="font-semibold">Funil Espaçolaser</span>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6"><Suspense fallback={<div className="text-sm text-slate-500">Carregando…</div>}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
