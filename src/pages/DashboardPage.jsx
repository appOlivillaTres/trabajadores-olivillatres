import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function DashboardPage() {
  const { profile } = useAuth()

  return (
    <>
      <div className="mb-4">
        <p className="text-success text-uppercase small fw-semibold mb-1">Panel de administración</p>
        <h1 className="h2 fw-bold">Bienvenido, {profile?.display_name}</h1>
        <p className="text-secondary">Desde aquí podrás gestionar las obras, los trabajadores, las revisiones y las exportaciones.</p>
      </div>
      <div className="row g-3">
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100"><div className="card-body p-4"><h2 className="h5">Obras</h2><p className="text-secondary">Crear y mantener las obras disponibles para los partes.</p><Link className="btn btn-outline-success" to="/obras">Gestionar obras</Link></div></div>
        </div>
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100"><div className="card-body p-4"><h2 className="h5">Trabajadores</h2><p className="text-secondary">Consultar los perfiles y administrar las cuentas.</p><Link className="btn btn-outline-success" to="/trabajadores">Ver trabajadores</Link></div></div>
        </div>
        <div className="col-12 col-md-6 col-xl-4">
          <div className="card border-0 shadow-sm h-100"><div className="card-body p-4"><h2 className="h5">Revisiones y Excel</h2><p className="text-secondary">Revisar partes y preparar las exportaciones por periodo.</p><Link className="btn btn-outline-success" to="/revisiones">Revisar partes</Link></div></div>
        </div>
      </div>
    </>
  )
}
