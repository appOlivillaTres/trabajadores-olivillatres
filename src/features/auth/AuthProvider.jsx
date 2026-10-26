import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { usernameToAuthEmail } from './usernameAuth'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setProfile(null)
      return null
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, role, active')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setProfileError('No se ha podido cargar tu perfil. Comprueba la configuración de Supabase.')
      setProfile(null)
      return null
    }

    setProfileError('')
    setProfile(data)
    return data
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return undefined
    }

    let alive = true

    const applySession = async (nextSession) => {
      if (!alive) return
      setSession(nextSession)

      if (!nextSession?.user) {
        setProfile(null)
        setProfileError('')
        setLoading(false)
        return
      }

      setLoading(true)
      await loadProfile(nextSession.user.id)
      if (alive) setLoading(false)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setProfileError('No se ha podido recuperar la sesión.')
      return applySession(data?.session ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      Promise.resolve().then(() => applySession(nextSession))
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [loadProfile])


  const signIn = useCallback(async (username, password) => {
    if (!supabase) {
      throw new Error('Falta configurar Supabase en el archivo .env.local.')
    }

    const email = usernameToAuthEmail(username)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    const { data: userProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileLookupError) {
      await supabase.auth.signOut()
      throw profileLookupError
    }

    if (!userProfile || !userProfile.active) {
      await supabase.auth.signOut()
      throw new Error(
        'Tu usuario no tiene un perfil activo. Contacta con el administrador.'
      )
    }

    return userProfile
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    profileError,
    signIn,
    signOut,
    refreshProfile: () => session?.user?.id ? loadProfile(session.user.id) : null,
  }), [session, profile, loading, profileError, signIn, signOut, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
