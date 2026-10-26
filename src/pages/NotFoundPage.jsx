import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
  <div className="text-center py-5">
      <h1 className="display-5 fw-bold">404</h1>
      <p className="text-secondary">No hemos encontrado esta página.</p>
      <Link to="/" className="btn btn-success">Volver al inicio</Link>
    </div>
  )
}
