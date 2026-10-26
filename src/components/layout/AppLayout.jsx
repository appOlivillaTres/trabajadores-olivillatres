import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

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
              <span className="small">{profile?.display_name} · {profile?.role === 'admin' ? 'Administrador' : 'Trabajador'}</span>
              <button className="btn btn-outline-light btn-sm" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Cerrando...' : 'Cerrar sesión'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="container py-4 py-lg-5">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <Outlet />
      </main>
      <footer className="container pb-4 text-center text-secondary small">
        Trabajadores Olivillatres
      </footer>
    </div>
  )
}
