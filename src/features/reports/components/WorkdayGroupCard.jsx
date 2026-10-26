import { useEffect, useState } from 'react'
import AdminReportEditForm from './AdminReportEditForm'
import { readSessionDraft, writeSessionDraft, removeSessionDraft } from '../../../lib/sessionDrafts'
import CorrectionRequestForm from '../../corrections/components/CorrectionRequestForm'
import ReportChangeHistory from '../../corrections/components/ReportChangeHistory'

const STATUS_LABELS = {
  pending: { label: 'Pendiente de revisión', className: 'text-bg-warning' },
  approved: { label: 'Revisado', className: 'text-bg-success' },
  needs_changes: { label: 'Necesita corrección', className: 'text-bg-danger' },
  partial: { label: 'Revisión parcial', className: 'text-bg-info' },
}

const REPORT_STATUS_LABELS = {
  pending: { label: 'Pendiente', className: 'text-bg-warning' },
  approved: { label: 'Revisado', className: 'text-bg-success' },
  needs_changes: { label: 'Necesita corrección', className: 'text-bg-danger' },
}

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatHours(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(value) || 0)
}

export default function WorkdayGroupCard({
  group,
  view = 'worker',
  canReview = false,
  canRequestCorrection = false,
  currentUserId = '',
  updatingId = '',
  onReviewStatusChange,
  onCorrectionSubmitted,
  worksites = [],
  onSaveReportEdit,
  showDate = true,
}) {
  const editKey = `olivillatres:admin-editing-report:${group.id}`
  const [editingReportId, setEditingReportId] = useState(() => readSessionDraft(editKey)?.reportId ?? '')
  useEffect(() => {
    if (editingReportId) writeSessionDraft(editKey, { reportId: editingReportId })
    else removeSessionDraft(editKey)
  }, [editKey, editingReportId])

  const summaryStatus = STATUS_LABELS[group.summaryStatus] ?? STATUS_LABELS.pending
  const workerName = group.worker?.display_name ?? 'Trabajador'

  return (
    <article className="card border-0 shadow-sm mb-4">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
          <div>
            {showDate && <div className="small text-secondary">{formatDate(group.workDate)}</div>}
            <h2 className="h5 fw-bold mb-1">{view === 'admin' ? workerName : 'Mi jornada'}</h2>
            {view === 'admin' && group.worker?.username && (
              <div className="small text-secondary">Usuario: {group.worker.username}</div>
            )}
            <div className="small text-secondary mt-1">
              {group.reports.length} {group.reports.length === 1 ? 'obra' : 'obras'} · {view === 'admin' ? 'Total del trabajador' : 'Total del día'}: <strong>{formatHours(group.totalHours)} h</strong>
            </div>
          </div>
          <span className={`badge ${summaryStatus.className}`}>{summaryStatus.label}</span>
        </div>

        <div className="d-grid gap-3">
          {group.reports.map((report, index) => {
            const status = REPORT_STATUS_LABELS[report.review_status] ?? REPORT_STATUS_LABELS.pending
            const busy = updatingId === report.id

            return (
              <section key={report.id} className={`border rounded-3 p-3 ${index === group.reports.length - 1 ? '' : ''}`}>
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                  <div>
                    <h3 className="h6 fw-bold mb-1">{report.worksite?.name ?? 'Obra no disponible'}</h3>
                    {report.worksite?.address && <div className="small text-secondary">{report.worksite.address}</div>}
                  </div>
                  {view === 'admin' && <span className={`badge ${status.className}`}>{status.label}</span>}
                </div>

                <div className="row g-3">
                  <div className="col-12 col-lg-8">
                    <div className="small fw-semibold text-secondary mb-1">Trabajo realizado</div>
                    <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{report.activity_description}</p>
                  </div>
                  <div className="col-12 col-lg-4">
                    <div className="small fw-semibold text-secondary mb-1">
                      {view === 'admin' ? `Horas de ${workerName}` : 'Tus horas'}
                    </div>
                    <div className="fs-5 fw-semibold">{formatHours(report.dayWorkerHours)} h</div>
                  </div>
                </div>

                {report.participants?.length > 0 && (
                  <div className="mt-3">
                    <div className="small fw-semibold text-secondary mb-1">Equipo registrado en esta obra</div>
                    <div className="d-flex flex-wrap gap-2">
                      {report.participants.map((participant) => (
                        <span key={participant.id} className="badge rounded-pill text-bg-light border text-dark px-2 py-2">
                          {participant.profile?.display_name ?? 'Trabajador'} · {formatHours(participant.hours)} h
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {report.observations && (
                  <div className="alert alert-light border py-2 mt-3 mb-0">
                    <strong>Observaciones:</strong> {report.observations}
                  </div>
                )}
                {report.has_incident && (
                  <div className="alert alert-warning py-2 mt-3 mb-0">
                    <strong>Incidencia:</strong> {report.incident_details || 'Marcada sin detalle.'}
                  </div>
                )}

                {view === 'admin' && (
                  <div className="small text-secondary mt-3">
                    Registrado por: {report.author?.display_name ?? 'Usuario'}
                    {report.author?.username ? ` (${report.author.username})` : ''}
                  </div>
                )}

                {canRequestCorrection && currentUserId && report.participants?.some((participant) => participant.worker_id === currentUserId) && (
                  <CorrectionRequestForm
                    report={report}
                    currentUserId={currentUserId}
                    onSubmitted={onCorrectionSubmitted}
                    existingWorksiteIds={group.reports.flatMap((dayReport) => [
                      dayReport.worksite_id,
                      ...(dayReport.correctionRequests ?? [])
                        .filter((request) => request.status === 'pending' && request.target_type === 'new_worksite')
                        .map((request) => request.requested_worksite_id),
                    ])}
                  />
                )}

                <ReportChangeHistory entries={report.changeHistory ?? []} />

                {canReview && (
                  <div className="border-top pt-3 mt-3">
                    <div className="small text-secondary mb-2">El estado se aplica a este bloque de obra, y queda guardado en el historial.</div>
                    <div className="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        disabled={busy || report.review_status === 'approved'}
                        onClick={() => onReviewStatusChange(report.id, 'approved')}
                      >
                        {busy ? 'Guardando…' : 'Marcar revisado'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={busy || report.review_status === 'needs_changes'}
                        onClick={() => onReviewStatusChange(report.id, 'needs_changes')}
                      >
                        Marcar necesita corrección
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={busy}
                        onClick={() => setEditingReportId((current) => current === report.id ? '' : report.id)}
                      >
                        {editingReportId === report.id ? 'Cerrar edición' : 'Editar parte'}
                      </button>
                      {report.review_status !== 'pending' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={busy}
                          onClick={() => onReviewStatusChange(report.id, 'pending')}
                        >
                          Volver a pendiente
                        </button>
                      )}
                    </div>
                    {editingReportId === report.id && (
                      <AdminReportEditForm
                        report={report}
                        worksites={worksites}
                        busy={busy}
                        onCancel={() => setEditingReportId('')}
                        onSave={async (values) => {
                          const success = await onSaveReportEdit?.(report.id, values)
                          if (success) setEditingReportId('')
                          return Boolean(success)
                        }}
                      />
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </article>
  )
}
