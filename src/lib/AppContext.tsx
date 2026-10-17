import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Colaborador, ColaboradorUsuario, Unidade } from './types'

export type Perfil = 'admin' | 'consulta'

interface Ctx {
  session: Session | null
  membro: boolean | null
  perfil: Perfil | null
  admin: boolean
  unidades: Unidade[]
  colaboradores: Colaborador[]
  usuarios: ColaboradorUsuario[]
  reloadCadastros: () => Promise<void>
}
const AppCtx = createContext<Ctx>({ session: null, membro: null, perfil: null, admin: false, unidades: [], colaboradores: [], usuarios: [], reloadCadastros: async () => {} })

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [membro, setMembro] = useState<boolean | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [usuarios, setUsuarios] = useState<ColaboradorUsuario[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reloadCadastros = useCallback(async () => {
    if (!session) { setMembro(null); setPerfil(null); return }
    const { data: p } = await supabase.rpc('meu_perfil')
    setPerfil((p as Perfil | null) ?? null)
    setMembro(Boolean(p))
    if (!p) return
    const [u, c, cu] = await Promise.all([
      supabase.from('unidades').select('*').order('ordem'),
      supabase.from('colaboradores').select('*').order('ordem'),
      supabase.from('colaborador_usuarios').select('*'),
    ])
    setUnidades((u.data ?? []) as Unidade[])
    setColaboradores(((c.data ?? []) as Colaborador[]).map((x) => ({ ...x, valor_fixo: Number(x.valor_fixo) })))
    setUsuarios((cu.data ?? []) as ColaboradorUsuario[])
  }, [session])

  useEffect(() => { reloadCadastros() }, [reloadCadastros])

  if (!ready) return null
  return <AppCtx.Provider value={{ session, membro, perfil, admin: perfil === 'admin', unidades, colaboradores, usuarios, reloadCadastros }}>{children}</AppCtx.Provider>
}

export const useApp = () => useContext(AppCtx)
