import { useCorrectionRequests } from '../hooks/useCorrectionRequests'
import CorrectionRequestReviewCard from './CorrectionRequestReviewCard'

export default function CorrectionRequestsPanel({ filters, onResolved }) {
  const { requests, worksites, loading, resolvingId, error, notice, load, resolve } = useCorrectionRequests(filters)

  async function handleResolve(values) {
    const succeeded = await resolve(values)
    if (succeeded) await onResolved?.()
    return succeeded
  }

  return (
    <section>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h2 className="h4 fw-bold mb-1">Correcciones solicitadas</h2>
          <p className="text-secondary mb-0">Revisa el motivo, compara el valor original y guarda el dato correcto. Las solicitudes resueltas se mostrarán al trabajador en su historial.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar solicitudes'}
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando solicitudes…</span></div></div>
      ) : requests.length === 0 ? (
        <div className="card border-0 bg-light"><div className="card-body text-center py-5"><h3 className="h5">No hay solicitudes pendientes</h3><p className="text-secondary mb-0">Cuando un trabajador solicite una corrección, aparecerá en esta sección.</p></div></div>
      ) : (
        <>
          <p className="small text-secondary">Solicitudes pendientes: {requests.length}</p>
          {requests.map((request) => (
            <CorrectionRequestReviewCard
              key={request.id}
              request={request}
              worksites={worksites}
              busy={resolvingId === request.id}
              onResolve={handleResolve}
            />
          ))}
        </>
      )}
    </section>
  )
}
