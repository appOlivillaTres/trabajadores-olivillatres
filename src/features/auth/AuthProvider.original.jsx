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
      .select('id, username, display_name, role, active')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setProfileError('No se ha podido cargar tu perfil. Comprueba la configuración de Supabase.')
      setProfile(null)
      return null
    }

    let permissions = []
    if (data?.active && data.role !== 'admin_general') {
      const { data: permissionRows, error: permissionError } = await supabase
        .from('user_section_permissions').select('section').eq('user_id', userId)
      if (permissionError) {
        setProfileError('No se han podido cargar tus permisos. Comprueba que la migración de permisos se haya ejecutado en Supabase.')
        setProfile(null)
        return null
      }
      permissions = (permissionRows || []).map((row) => row.section)
    }
    const completeProfile = { ...data, permissions }
    setProfileError('')
    setProfile(completeProfile)
    return completeProfile
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
      .select('id, username, role, active')
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

    let permissions = []
    if (userProfile.role !== 'admin_general') {
      const { data: rows, error: permissionError } = await supabase
        .from('user_section_permissions').select('section').eq('user_id', data.user.id)
      if (permissionError) {
        await supabase.auth.signOut()
        throw new Error('No se han podido cargar tus permisos. Comprueba la migración de Supabase.')
      }
      permissions = (rows || []).map((row) => row.section)
    }
    return { ...userProfile, permissions }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (!supabase || !session?.user?.email) {
      throw new Error('No se ha podido identificar tu cuenta.')
    }

    if (!currentPassword || !newPassword) {
      throw new Error('Completa todos los campos.')
    }

    if (newPassword.length < 8) {
      throw new Error('La nueva contraseña debe tener al menos 8 caracteres.')
    }

    if (currentPassword === newPassword) {
      throw new Error('La nueva contraseña debe ser diferente de la actual.')
    }

    // Comprobar la contraseña actual sin permitir cambiar otra cuenta.
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    })

    if (loginError || data.user?.id !== session.user.id) {
      throw new Error('La contraseña actual es incorrecta.')
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      throw new Error('No se ha podido actualizar la contraseña. Inténtalo de nuevo.')
    }
  }, [session])

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
    changePassword,
    signOut,
    refreshProfile: () => session?.user?.id ? loadProfile(session.user.id) : null,
  }), [session, profile, loading, profileError, signIn, signOut, changePassword, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
