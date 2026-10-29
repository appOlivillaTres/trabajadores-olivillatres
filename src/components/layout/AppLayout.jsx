
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  canAccessSection,
  canManagePermissions,
  SECTION,
} from '../../lib/permissions'

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
  const [openMenu, setOpenMenu] = useState(null)

  const isWorker = profile?.role === 'worker'
  const canParts = canAccessSection(profile, SECTION.PARTS)
  const canWorkers = canAccessSection(profile, SECTION.WORKERS)
  const canVehicles = canAccessSection(profile, SECTION.VEHICLES)
  const canEpisRopa = canAccessSection(profile, SECTION.EPIS_ROPA)
  const canPermissions = canManagePermissions(profile)

  const linkClass = ({ isActive }) =>
    `nav-link ${isActive ? 'active fw-semibold' : ''}`

  const menuButtonClass = (active) =>
    `nav-link dropdown-toggle ${active ? 'active fw-semibold' : ''}`

  function toggleMenu(menu) {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function closeMenu() {
    setOpenMenu(null)
  }

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

  const menuItemClass = ({ isActive }) =>
    `dropdown-item ${isActive ? 'active' : ''}`

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
        <div className="container">
          <NavLink
            className="navbar-brand fw-bold"
            to={isWorker ? '/parte' : '/panel'}
            onClick={closeMenu}
          >
            Olivillatres
          </NavLink>

          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNavigation"
            aria-controls="mainNavigation"
            aria-expanded="false"
            aria-label="Mostrar navegación"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="mainNavigation">
            <div className="navbar-nav me-auto align-items-lg-center">
              {isWorker ? (
                <>
                  <NavLink
                    className={linkClass}
                    to="/parte"
                    onClick={closeMenu}
                  >
                    Nuevo parte
                  </NavLink>

                  <NavLink
                    className={linkClass}
                    to="/mis-partes"
                    onClick={closeMenu}
                  >
                    Mis partes
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink
                    className={linkClass}
                    to="/panel"
                    onClick={closeMenu}
                  >
                    Panel
                  </NavLink>

                  {canParts && (
                    <div
                      className="nav-item dropdown"
                      onMouseEnter={() => setOpenMenu('parts')}
                      onMouseLeave={closeMenu}
                    >
                      <button
                        type="button"
                        className={menuButtonClass(openMenu === 'parts')}
                        aria-expanded={openMenu === 'parts'}
                        onClick={() => toggleMenu('parts')}
                      >
                        Partes de trabajo
                      </button>

                      <div
                        className={`dropdown-menu ${
                          openMenu === 'parts' ? 'show' : ''
                        }`}
                      >
                        <NavLink
                          className={menuItemClass}
                          to="/parte"
                          onClick={closeMenu}
                        >
                          Nuevo parte
                        </NavLink>

                        <NavLink
                          className={menuItemClass}
                          to="/revisiones"
                          onClick={closeMenu}
                        >
                          Revisiones
                        </NavLink>

                        <NavLink
                          className={menuItemClass}
                          to="/obras"
                          onClick={closeMenu}
                        >
                          Obras
                        </NavLink>

                        <NavLink
                          className={menuItemClass}
                          to="/ausencias"
                          onClick={closeMenu}
                        >
                          Ausencias
                        </NavLink>

                        <NavLink
                          className={menuItemClass}
                          to="/exportar"
                          onClick={closeMenu}
                        >
                          Exportar a Excel
                        </NavLink>

                        <div className="dropdown-divider" />

                        <NavLink
                          className={menuItemClass}
                          to="/usuarios"
                          onClick={closeMenu}
                        >
                          Usuarios
                        </NavLink>

                        {canPermissions && profile?.role !== 'admin_general' && (
                          <NavLink
                            className={menuItemClass}
                            to="/usuarios-permisos"
                            onClick={closeMenu}
                          >
                            Usuarios y permisos
                          </NavLink>
                        )}
                      </div>
                    </div>
                  )}

                  {canWorkers && (
                    <div
                      className="nav-item dropdown"
                      onMouseEnter={() => setOpenMenu('workers')}
                      onMouseLeave={closeMenu}
                    >
                      <button
                        type="button"
                        className={menuButtonClass(openMenu === 'workers')}
                        aria-expanded={openMenu === 'workers'}
                        onClick={() => toggleMenu('workers')}
                      >
                        Trabajadores
                      </button>

                      <div
                        className={`dropdown-menu ${
                          openMenu === 'workers' ? 'show' : ''
                        }`}
                      >
                        <NavLink
                          className={menuItemClass}
                          to="/trabajadores"
                          onClick={closeMenu}
                        >
                          Fichas de trabajadores
                        </NavLink>
                      </div>
                    </div>
                  )}

                  {canEpisRopa && (
                    <div className="nav-item dropdown" onMouseEnter={() => setOpenMenu('episRopa')} onMouseLeave={closeMenu}>
                      <button type="button" className={menuButtonClass(openMenu === 'episRopa')} aria-expanded={openMenu === 'episRopa'} onClick={() => toggleMenu('episRopa')}>EPIS y ROPA</button>
                      <div className={`dropdown-menu ${openMenu === 'episRopa' ? 'show' : ''}`}>
                        <NavLink className={menuItemClass} to="/epis" onClick={closeMenu}>EPIS / Entregas</NavLink>
                        <NavLink className={menuItemClass} to="/ropa" onClick={closeMenu}>ROPA / Stock</NavLink>
                      </div>
                    </div>
                  )}

                  {canVehicles && (
                    <div
                      className="nav-item dropdown"
                      onMouseEnter={() => setOpenMenu('vehicles')}
                      onMouseLeave={closeMenu}
                    >
                      <button
                        type="button"
                        className={menuButtonClass(openMenu === 'vehicles')}
                        aria-expanded={openMenu === 'vehicles'}
                        onClick={() => toggleMenu('vehicles')}
                      >
                        Vehículos
                      </button>

                      <div
                        className={`dropdown-menu dropdown-menu-lg-end ${
                          openMenu === 'vehicles' ? 'show' : ''
                        }`}
                      >
                        <NavLink
                          className={menuItemClass}
                          to="/vehiculos"
                          onClick={closeMenu}
                        >
                          Gestión de vehículos
                        </NavLink>
                      </div>
                    </div>
                  )}

                  {canPermissions && (
                    <NavLink
                      className={linkClass}
                      to="/usuarios-permisos"
                      onClick={closeMenu}
                    >
                      Permisos
                    </NavLink>
                  )}
                </>
              )}
            </div>

            <div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2 text-white mt-3 mt-lg-0">
              <span className="small">
                {profile?.display_name} ·{' '}
                {isWorker
                  ? 'Trabajador'
                  : profile?.role === 'admin_general'
                    ? 'Administrador general'
                    : 'Responsable'}
              </span>

              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={() => {
                  setShowPasswordForm((previous) => !previous)
                  setPasswordNotice(null)
                }}
              >
                {showPasswordForm
                  ? 'Ocultar contraseña'
                  : 'Cambiar contraseña'}
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
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}

        {showPasswordForm && (
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <h2 className="h5 mb-3">Cambiar contraseña</h2>

              <p className="text-secondary small">
                Introduce tu contraseña actual y elige una nueva de al menos
                8 caracteres.
              </p>

              {passwordNotice && (
                <div
                  className={`alert alert-${passwordNotice.type}`}
                  role="alert"
                >
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
                    onChange={(event) =>
                      setCurrentPassword(event.target.value)
                    }
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
                    onChange={(event) =>
                      setNewPassword(event.target.value)
                    }
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
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
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
