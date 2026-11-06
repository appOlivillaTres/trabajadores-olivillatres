import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { usernameToAuthEmail } from './usernameAuth'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  // Evita volver a consultar el perfil cuando Supabase restaura/revalida
  // la misma sesión al recuperar el foco de la pestaña.
  const loadedProfileUserIdRef = useRef(null)
  const sessionRef = useRef(null)
  const profileRequestRef = useRef(null)

  const loadProfile = useCallback(async (userId, { force = false } = {}) => {
    if (!supabase || !userId) {
      loadedProfileUserIdRef.current = null
      setProfile(null)
      return null
    }

    if (!force && loadedProfileUserIdRef.current === userId) return profileRequestRef.current?.userId === userId ? profileRequestRef.current.promise : null
    if (!force && profileRequestRef.current?.userId === userId) return profileRequestRef.current.promise

    const request = (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, role, active')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      setProfileError('No se ha podido cargar tu perfil. Comprueba la configuración de Supabase.')
      loadedProfileUserIdRef.current = null
      setProfile(null)
      return null
    }

    let permissions = []
    if (data?.active && data.role !== 'admin_general') {
      const { data: permissionRows, error: permissionError } = await supabase
        .from('user_section_permissions').select('section').eq('user_id', userId)
      if (permissionError) {
        setProfileError('No se han podido cargar tus permisos. Comprueba que la migración de permisos se haya ejecutado en Supabase.')
        loadedProfileUserIdRef.current = null
        setProfile(null)
        return null
      }
      permissions = (permissionRows || []).map((row) => row.section)
    }
    const completeProfile = { ...data, permissions }
    setProfileError('')
    loadedProfileUserIdRef.current = userId
    setProfile(completeProfile)
    return completeProfile
    })()
    profileRequestRef.current = { userId, promise: request }
    try {
      return await request
    } finally {
      if (profileRequestRef.current?.promise === request) profileRequestRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return undefined
    }

    let alive = true

    const applySession = async (nextSession, event = 'INITIAL_SESSION') => {
      if (!alive) return
      const nextUserId = nextSession?.user?.id || null
      const currentUserId = sessionRef.current?.user?.id || null

      if (!nextUserId) {
        sessionRef.current = null
        setSession((current) => current === null ? current : null)
        loadedProfileUserIdRef.current = null
        profileRequestRef.current = null
        setProfile(null)
        setProfileError('')
        setLoading(false)
        return
      }

      const identityChanged = nextUserId !== currentUserId
      const sessionNeedsUpdate = identityChanged || !sessionRef.current || event === 'USER_UPDATED'

      // TOKEN_REFRESHED ocurre de forma habitual al recuperar una pestaña.
      // Supabase actualiza internamente su token; no necesitamos propagar un
      // nuevo objeto de sesión por todo React ni volver a montar la interfaz.
      if (sessionNeedsUpdate) {
        sessionRef.current = nextSession
        setSession(nextSession)
      }

      if (!identityChanged && loadedProfileUserIdRef.current === nextUserId && event !== 'USER_UPDATED') {
        return
      }

      // Solo mostramos la pantalla inicial cuando cambia la identidad o aún
      // no se ha cargado el perfil. Un refresco de token no activa loading.
      if (identityChanged || !loadedProfileUserIdRef.current) setLoading(true)
      await loadProfile(nextUserId, { force: event === 'USER_UPDATED' })
      if (alive) setLoading(false)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setProfileError('No se ha podido recuperar la sesión.')
      return applySession(data?.session ?? null, 'INITIAL_SESSION')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // No ignoramos el evento: actualizamos el objeto de sesión, pero
      // applySession evita recargar el perfil si el usuario no ha cambiado.
      Promise.resolve().then(() => applySession(nextSession, event))
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

  const refreshProfile = useCallback(() => (sessionRef.current?.user?.id ? loadProfile(sessionRef.current.user.id, { force: true }) : null), [loadProfile])

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
    refreshProfile,
  }), [session, profile, loading, profileError, signIn, signOut, changePassword, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
