import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ allowedRoles }) {
  const { user, profile, loading, profileError } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="container min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center" role="status">
          <div className="spinner-border text-success mb-3" aria-hidden="true" />
          <p className="text-secondary mb-0">Comprobando sesión...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  if (profileError) {
    return <div className="container py-5"><div className="alert alert-danger">{profileError}</div></div>
  }

  if (!profile || !profile.active) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning">
          Tu cuenta no tiene un perfil activo. Contacta con el administrador.
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/sin-permiso" replace />
  }

  return <Outlet />
}
