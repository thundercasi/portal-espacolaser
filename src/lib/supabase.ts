import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabaseConfigurado = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'anon')

/**
 * Cria a conta de login de outro usuário sem trocar a sessão de quem está cadastrando
 * (cliente separado, que não guarda sessão). A confirmação por e-mail está desligada no
 * Supabase, então a conta já nasce pronta para uso e nenhum e-mail é enviado.
 */
export async function criarContaDeLogin(email: string, senha: string): Promise<{ criada: boolean; erro: string | null }> {
  const temp = createClient(url || 'http://localhost', key || 'anon', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cadastro-temporario' },
  })
  const { data, error } = await temp.auth.signUp({ email, password: senha })
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { criada: false, erro: null }
    return { criada: false, erro: error.message }
  }
  // e-mail que já tinha conta: o Supabase devolve um usuário sem identidades
  return { criada: (data.user?.identities?.length ?? 0) > 0, erro: null }
}
