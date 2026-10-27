import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import { canAccessSection } from '../lib/permissions'

export default function LoginPage() {
  const { user, profile, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <div className="container py-5 text-center"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando...</span></div></div>
  if (user && profile?.active) return <Navigate to={profile.role === 'worker' ? '/parte' : '/panel'} replace />


  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const signedInProfile = await signIn(username.trim(), password)
      navigate(
        signedInProfile.role === 'worker' ? '/parte' : '/panel',
        { replace: true }
      )
    } catch (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Usuario o contraseña incorrectos.'
          : signInError.message || 'No se ha podido iniciar sesión.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-vh-100 bg-light d-flex align-items-center py-5">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-sm-9 col-md-7 col-lg-5 col-xl-4">
            <div className="text-center mb-4">
              <h1 className="h3 fw-bold mb-2">Trabajadores Olivillatres</h1>
              <p className="text-secondary mb-0">Inicia sesión para acceder a los partes de trabajo.</p>
            </div>

            <div className="card border-0 shadow-sm">
              <div className="card-body p-4 p-lg-5">
                {!isSupabaseConfigured && <div className="alert alert-warning">Supabase aún no está configurado. Completa las variables de entorno siguiendo SETUP.md.</div>}
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
                <form onSubmit={handleSubmit}>

                  <div className="mb-3">
                    <label htmlFor="username" className="form-label">Usuario</label>
                    <input id="username" type="text" className="form-control form-control-lg" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ej.: admin" />
                  </div>

                  <div className="mb-4">
                    <label htmlFor="password" className="form-label">Contraseña</label>
                    <input id="password" type="password" className="form-control form-control-lg" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" />
                  </div>
                  <button type="submit" className="btn btn-success btn-lg w-100" disabled={submitting || !isSupabaseConfigured}>
                    {submitting ? 'Accediendo...' : 'Iniciar sesión'}
                  </button>
                </form>
                <p className="text-secondary small mt-3 mb-0 text-center">Si tienes algún problema para iniciar sesión, contacta con el administrador.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
