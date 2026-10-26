import CorrectionRequestForm from '../../corrections/components/CorrectionRequestForm'
import ReportChangeHistory from '../../corrections/components/ReportChangeHistory'

const STATUS_LABELS = {
  pending: { label: 'Pendiente de revisión', className: 'text-bg-warning' },
  approved: { label: 'Revisado', className: 'text-bg-success' },
  needs_changes: { label: 'Necesita corrección', className: 'text-bg-danger' },
}

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatHours(value) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2,
  }).format(Number(value))
}

export default function WorkReportCard({
  report,
  canReview = false,
  updating = false,
  onReviewStatusChange,
  canRequestCorrection = false,
  currentUserId = '',
  onCorrectionSubmitted,
}) {
  const status = STATUS_LABELS[report.review_status] ?? STATUS_LABELS.pending

  return (
    <article className="card border-0 shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <div className="small text-secondary">{formatDate(report.work_date)}</div>
            <h2 className="h5 fw-bold mb-1">{report.worksite?.name ?? 'Obra no disponible'}</h2>
            {report.worksite?.address && (
              <div className="small text-secondary">{report.worksite.address}</div>
            )}
          </div>
          <span className={`badge ${status.className}`}>{status.label}</span>
        </div>

        <div className="mb-3">
          <div className="small fw-semibold text-secondary mb-1">Trabajo realizado</div>
          <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{report.activity_description}</p>
        </div>

        <div className="mb-3">
          <div className="small fw-semibold text-secondary mb-1">Trabajadores y horas</div>
          {report.participants.length ? (
            <div className="d-flex flex-wrap gap-2">
              {report.participants.map((participant) => (
                <span key={participant.id} className="badge rounded-pill text-bg-light border text-dark py-2 px-3">
                  {participant.profile?.display_name ?? 'Trabajador'} · {formatHours(participant.hours)} h
                </span>
              ))}
            </div>
          ) : <span className="text-secondary">No hay participantes asociados.</span>}
        </div>

        {report.observations && (
          <div className="alert alert-light border py-2 mb-3">
            <strong>Observaciones:</strong> {report.observations}
          </div>
        )}

        {report.has_incident && (
          <div className="alert alert-warning py-2 mb-3">
            <strong>Incidencia:</strong> {report.incident_details || 'Marcada sin detalle.'}
          </div>
        )}

        <div className="small text-secondary mb-3">
          Registrado por: {report.author?.display_name ?? 'Usuario'}
          {report.author?.username ? ` (${report.author.username})` : ''}
        </div>

        {canRequestCorrection && currentUserId && report.participants.some((participant) => participant.worker_id === currentUserId) && (
          <CorrectionRequestForm
            report={report}
            currentUserId={currentUserId}
            onSubmitted={onCorrectionSubmitted}
          />
        )}

        <ReportChangeHistory entries={report.changeHistory ?? []} />

        {canReview && (
          <div className="border-top pt-3">
            <div className="small text-secondary mb-2">
              Cambiar el estado registra una entrada en el historial de revisión.
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-success"
                disabled={updating || report.review_status === 'approved'}
                onClick={() => onReviewStatusChange(report.id, 'approved')}
              >
                {updating ? 'Guardando…' : 'Marcar revisado'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={updating || report.review_status === 'needs_changes'}
                onClick={() => onReviewStatusChange(report.id, 'needs_changes')}
              >
                Solicitar corrección
              </button>
              {report.review_status !== 'pending' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={updating}
                  onClick={() => onReviewStatusChange(report.id, 'pending')}
                >
                  Volver a pendiente
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
