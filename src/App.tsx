import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { lazy } from 'react'
import { AppProvider, useApp } from './lib/AppContext'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'

const Painel = lazy(() => import('./pages/Painel'))
const Importar = lazy(() => import('./pages/Importar'))
const Metas = lazy(() => import('./pages/Metas'))
const Cadastros = lazy(() => import('./pages/Cadastros'))
const Cancelamento = lazy(() => import('./pages/Cancelamento'))
const Premiacoes = lazy(() => import('./pages/Premiacoes'))

function SemAcesso() {
  const { session } = useApp()
  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 p-4">
      <div className="card w-full max-w-sm p-6 text-sm">
        <p className="font-semibold">Acesso não liberado</p>
        <p className="mt-2 text-slate-600">O e-mail <b>{session?.user.email}</b> ainda não está na lista de usuários. Peça para um administrador incluí-lo em <b>Cadastros → Usuários</b>.</p>
        <button className="btn-ghost mt-4 w-full" onClick={() => supabase.auth.signOut()}>Sair</button>
      </div>
    </div>
  )
}

function Rotas() {
  const { session, membro } = useApp()
  if (!session) return <Login />
  if (membro === null) return null
  if (!membro) return <SemAcesso />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route path="importar" element={<Importar />} />
        <Route path="metas" element={<Metas />} />
        <Route path="cadastros" element={<Cadastros />} />
        <Route path="cancelamento" element={<Cancelamento />} />
        <Route path="premiacoes" element={<Premiacoes />} />
        <Route path="*" element={<Painel />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <AppProvider><BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}><Rotas /></BrowserRouter></AppProvider>
}
