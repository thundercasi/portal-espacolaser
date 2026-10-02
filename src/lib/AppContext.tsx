import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Atendente, Unidade } from './types'

interface Ctx {
  session: Session | null
  membro: boolean | null
  unidades: Unidade[]
  atendentes: Atendente[]
  reloadCadastros: () => Promise<void>
}
const AppCtx = createContext<Ctx>({ session: null, membro: null, unidades: [], atendentes: [], reloadCadastros: async () => {} })

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [membro, setMembro] = useState<boolean | null>(null)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [atendentes, setAtendentes] = useState<Atendente[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reloadCadastros = useCallback(async () => {
    if (!session) { setMembro(null); return }
    const { data: ok } = await supabase.rpc('is_membro')
    setMembro(Boolean(ok))
    if (!ok) return
    const [u, a] = await Promise.all([
      supabase.from('unidades').select('*').order('ordem'),
      supabase.from('atendentes').select('*').order('ordem'),
    ])
    setUnidades((u.data ?? []) as Unidade[])
    setAtendentes((a.data ?? []) as Atendente[])
  }, [session])

  useEffect(() => { reloadCadastros() }, [reloadCadastros])

  if (!ready) return null
  return <AppCtx.Provider value={{ session, membro, unidades, atendentes, reloadCadastros }}>{children}</AppCtx.Provider>
}

export const useApp = () => useContext(AppCtx)
