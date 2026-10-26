import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'

export default function AppLayout() {
  const { profile, signOut, changePassword } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordNotice, setPasswordNotice] = useState(null)
  const [savingPassword, setSavingPassword] = useState(false)


  async function handleChangePassword(event) {
    event.preventDefault()
    setPasswordNotice(null)

    if (newPassword.length < 8) {
      setPasswordNotice({
        type: 'danger',
        text: 'La nueva contraseña debe tener al menos 8 caracteres.',
      })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordNotice({
        type: 'danger',
        text: 'Las nuevas contraseñas no coinciden.',
      })
      return
    }

    setSavingPassword(true)

    try {
      await changePassword(currentPassword, newPassword)

      setPasswordNotice({
        type: 'success',
        text: 'Tu contraseña se ha cambiado correctamente.',
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setPasswordNotice({
        type: 'danger',
        text: error.message || 'No se ha podido cambiar la contraseña.',
      })
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    setError('')
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch {
      setError('No se ha podido cerrar la sesión. Inténtalo de nuevo.')
    } finally {
      setSigningOut(false)
    }
  }

  const linkClass = ({ isActive }) => `nav-link ${isActive ? 'active fw-semibold' : ''}`

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
        <div className="container">
          <NavLink className="navbar-brand fw-bold" to="/">Olivillatres</NavLink>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNavigation" aria-controls="mainNavigation" aria-expanded="false" aria-label="Mostrar navegación">
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="mainNavigation">
            <div className="navbar-nav me-auto">
              <NavLink className={linkClass} to="/parte">Nuevo parte</NavLink>
              {profile?.role !== 'admin' && <NavLink className={linkClass} to="/mis-partes">Mis partes</NavLink>}
              {profile?.role === 'admin' && <>
                <NavLink className={linkClass} to="/obras">Obras</NavLink>
                <NavLink className={linkClass} to="/trabajadores">Trabajadores</NavLink>
                <NavLink className={linkClass} to="/revisiones">Revisiones</NavLink>
                <NavLink className={linkClass} to="/ausencias">Ausencias</NavLink>
                <NavLink className={linkClass} to="/exportar">Exportar Excel</NavLink>
              </>}
            </div>
            <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2 text-white">
              <span className="small">
                {profile?.display_name} · {profile?.role === 'admin' ? 'Administrador' : 'Trabajador'}
              </span>

              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={() => {
                  setShowPasswordForm((previous) => !previous)
                  setPasswordNotice(null)
                }}
              >
                {showPasswordForm ? 'Ocultar contraseña' : 'Cambiar contraseña'}
              </button>

              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={handleSignOut}
                disabled={signingOut}
              >
                {signingOut ? 'Cerrando...' : 'Cerrar sesión'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="container py-4 py-lg-5">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        {showPasswordForm && (
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <h2 className="h5 mb-3">Cambiar contraseña</h2>

              <p className="text-secondary small">
                Introduce tu contraseña actual y elige una nueva de al menos 8 caracteres.
              </p>

              {passwordNotice && (
                <div className={`alert alert-${passwordNotice.type}`} role="alert">
                  {passwordNotice.text}
                </div>
              )}

              <form onSubmit={handleChangePassword}>
                <div className="mb-3">
                  <label htmlFor="currentPassword" className="form-label">
                    Contraseña actual
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    className="form-control"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="newPassword" className="form-label">
                    Nueva contraseña
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    className="form-control"
                    autoComplete="new-password"
                    minLength={8}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label htmlFor="confirmPassword" className="form-label">
                    Repite la nueva contraseña
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className="form-control"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>

                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingPassword}
                  >
                    {savingPassword ? 'Guardando...' : 'Guardar contraseña'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setShowPasswordForm(false)
                      setPasswordNotice(null)
                      setCurrentPassword('')
                      setNewPassword('')
                      setConfirmPassword('')
                    }}
                    disabled={savingPassword}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <Outlet />
      </main>
      <footer className="container pb-4 text-center text-secondary small">
        Trabajadores Olivillatres
      </footer>
    </div>
  )
}
