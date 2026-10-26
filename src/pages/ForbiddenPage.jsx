import { Link } from 'react-router-dom'

export default function ForbiddenPage() {
  return (
    <div className="text-center py-5">
      <h1 className="h2">Acceso no permitido</h1>
      <p className="text-secondary">Tu cuenta no tiene permiso para consultar esta sección.</p>
      <Link to="/parte" className="btn btn-success">Volver a mis partes</Link>
    </div>
  )
}
