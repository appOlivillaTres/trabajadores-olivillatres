import { useEffect, useState } from 'react'
import { readSessionDraft, removeSessionDraft, writeSessionDraft } from '../../../lib/sessionDrafts'

const FIELD_LABELS = {
  work_date: 'Fecha del trabajo',
  worksite_id: 'Obra',
  activity_description: 'Trabajo realizado',
  observations: 'Observaciones',
  has_incident: 'Si hubo incidencia',
  incident_details: 'Detalle de la incidencia',
  hours: 'Horas del trabajador',
  add_worksite: 'Añadir una obra olvidada',
}

function getParticipant(request) {
  return request.report?.participants?.find((participant) => participant.id === request.target_worker_row_id)
}

function getCurrentValue(request) {
  const report = request.report
  if (!report) return ''
  if (request.target_type === 'worker_hours') return String(getParticipant(request)?.hours ?? '')
  switch (request.field_name) {
    case 'work_date': return report.work_date ?? ''
    case 'worksite_id': return report.worksite_id ?? ''
    case 'activity_description': return report.activity_description ?? ''
    case 'observations': return report.observations ?? ''
    case 'has_incident': return String(Boolean(report.has_incident))
    case 'incident_details': return report.incident_details ?? ''
    default: return ''
  }
}

function getInitialValue(request, worksites) {
  const current = getCurrentValue(request)
  const suggested = String(request.suggested_value ?? '').trim()
  if (!suggested) return current
  if (request.field_name === 'worksite_id') {
    const normalized = suggested.toLocaleLowerCase('es')
    const proposed = worksites.find((worksite) => worksite.name.trim().toLocaleLowerCase('es') === normalized)
    return proposed?.id ?? current
  }
  if (request.field_name === 'has_incident') {
    const normalized = suggested.toLocaleLowerCase('es')
    if (['true', 'sí', 'si', 'sí hubo', 'hubo'].includes(normalized)) return 'true'
    if (['false', 'no', 'no hubo'].includes(normalized)) return 'false'
    return current
  }
  if (request.field_name === 'work_date' && !/^\d{4}-\d{2}-\d{2}$/.test(suggested)) return current
  if (request.target_type === 'worker_hours') {
    const numeric = suggested.replace(',', '.')
    return /^\d+(?:\.\d+)?$/.test(numeric) ? numeric : current
  }
  return suggested
}

function displayOriginal(request) {
  if (request.field_name === 'worksite_id') return request.report?.worksite?.name ?? 'Obra no disponible'
  if (request.target_type === 'worker_hours') {
    const participant = getParticipant(request)
    const workerName = participant?.profile?.display_name ?? 'Trabajador'
    return `${workerName}: ${participant?.hours ?? '—'} h`
  }
  const value = getCurrentValue(request)
  if (request.field_name === 'has_incident') return value === 'true' ? 'Sí' : 'No'
  return value || '—'
}

export default function CorrectionRequestReviewCard({ request, worksites, busy, onResolve }) {
  const draftKey = `olivillatres:correction-review-draft:${request.id}`
  const initialDraft = readSessionDraft(draftKey)
  const [correctedValue, setCorrectedValue] = useState(() => initialDraft?.correctedValue ?? getInitialValue(request, worksites))
  const [adminResponse, setAdminResponse] = useState(() => initialDraft?.adminResponse ?? '')
  const [localError, setLocalError] = useState('')
  const report = request.report

  useEffect(() => {
    writeSessionDraft(draftKey, { correctedValue, adminResponse })
  }, [draftKey, correctedValue, adminResponse])

  if (!report) {
    return (
      <article className="card border-0 shadow-sm mb-3">
        <div className="card-body">
          <h2 className="h6">Solicitud {request.id.slice(0, 8)}</h2>
          <p className="text-danger mb-0">No se ha podido cargar el parte asociado. Comprueba las políticas RLS de Supabase.</p>
        </div>
      </article>
    )
  }

  const inputId = `corrected-value-${request.id}`
  const isWorksite = request.field_name === 'worksite_id'
  const isBoolean = request.field_name === 'has_incident'
  const isDate = request.field_name === 'work_date'
  const isHours = request.target_type === 'worker_hours'
  const isAddWorksite = request.target_type === 'new_worksite'
  const requestedWorksite = worksites.find((worksite) => worksite.id === request.requested_worksite_id)
  const isLongText = ['activity_description', 'observations', 'incident_details'].includes(request.field_name)

  async function handleResolve(decision) {
    setLocalError('')
    if (decision === 'rejected' && adminResponse.trim().length < 3) {
      setLocalError('Explica al menos brevemente por qué se rechaza la solicitud.')
      return
    }
    if (decision === 'accepted' && !isAddWorksite && correctedValue === '' && !['observations', 'incident_details'].includes(request.field_name)) {
      setLocalError('Introduce el valor que debe quedar guardado.')
      return
    }
    const succeeded = await onResolve({
      requestId: request.id,
      decision,
      correctedValue,
      adminResponse,
      targetType: request.target_type,
    })
    if (succeeded) removeSessionDraft(draftKey)
  }

  return (
    <article className="card border-0 shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <div className="small text-secondary">{report.work_date} · {isAddWorksite ? 'Jornada de referencia' : (report.worksite?.name ?? 'Obra no disponible')}</div>
            <h2 className="h5 fw-bold mb-1">{FIELD_LABELS[request.field_name] ?? request.field_name}</h2>
            <div className="small text-secondary">Solicitado por: {request.requester?.display_name ?? 'Trabajador'}{request.requester?.username ? ` (${request.requester.username})` : ''}</div>
          </div>
          <span className="badge text-bg-warning">Pendiente</span>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-lg-6">
            <div className="small fw-semibold text-secondary">Motivo</div>
            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{request.reason}</p>
          </div>
          <div className="col-12 col-lg-6">
            <div className="small fw-semibold text-secondary">{isAddWorksite ? 'Obra que se solicita añadir' : 'Valor original'}</div>
            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{isAddWorksite ? (requestedWorksite?.name ?? 'Obra seleccionada no disponible') : displayOriginal(request)}</p>
            {isAddWorksite && (
              <div className="mt-2 small">
                <div className="fw-semibold mt-1">Trabajadores y horas</div>
                <ul className="mb-2">
                  {(request.requested_participants?.length
                    ? request.requested_participants
                    : [{ worker_id: request.requested_by, hours: request.requested_hours }]
                  ).map((participant) => (
                    <li key={participant.worker_id}>
                      {participant.worker?.display_name ?? (participant.worker_id === request.requested_by ? request.requester?.display_name : null) ?? 'Trabajador'}: {participant.hours} h
                    </li>
                  ))}
                </ul>
                <div className="mt-1"><strong>Trabajo realizado:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{request.requested_activity_description}</span></div>
                {request.requested_observations && <div className="mt-1"><strong>Observaciones:</strong> {request.requested_observations}</div>}
                {request.requested_has_incident && <div className="mt-1"><strong>Incidencia:</strong> {request.requested_incident_details}</div>}
              </div>
            )}
            {request.suggested_value && <div className="small text-secondary mt-2"><strong>Propuesta del trabajador:</strong> {request.suggested_value}</div>}
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void handleResolve('accepted') }}>
          {!isAddWorksite && <div className="mb-3">
            <label className="form-label fw-semibold" htmlFor={inputId}>Valor correcto *</label>
            {isWorksite ? (
              <select id={inputId} className="form-select" required value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)}>
                <option value="">Selecciona la obra correcta</option>
                {worksites.map((worksite) => (
                  <option key={worksite.id} value={worksite.id}>{worksite.name}{worksite.active ? '' : ' (inactiva)'}</option>
                ))}
              </select>
            ) : isBoolean ? (
              <select id={inputId} className="form-select" required value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            ) : isDate ? (
              <input id={inputId} type="date" className="form-control" required value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)} />
            ) : isHours ? (
              <input id={inputId} type="number" className="form-control" min="0.25" max="24" step="0.25" required value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)} />
            ) : isLongText ? (
              <textarea id={inputId} className="form-control" rows={3} maxLength={2000} required={request.field_name === 'activity_description'} value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)} />
            ) : (
              <input id={inputId} className="form-control" value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)} />
            )}
            {isHours && <div className="form-text">Las horas deben ser múltiplos de 0,25. El sistema comprobará el total diario antes de guardar.</div>}
          </div>}
          {isAddWorksite && <div className="alert alert-info py-2">Al aprobar, se creará una actividad nueva para esta fecha con las horas de cada trabajador y la descripción propuestas. Se comprobarán duplicados y el máximo de 24 horas diarias para cada persona.</div>}
          <div className="mb-3">
            <label className="form-label" htmlFor={`admin-response-${request.id}`}>Respuesta al trabajador {`(obligatoria si rechazas)`}</label>
            <textarea id={`admin-response-${request.id}`} className="form-control" rows={2} maxLength={2000} value={adminResponse} onChange={(event) => setAdminResponse(event.target.value)} placeholder="Explicación o comentario de la resolución" />
          </div>
          {localError && <div className="alert alert-danger py-2" role="alert">{localError}</div>}
          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-success" disabled={busy}> {busy ? 'Guardando…' : (isAddWorksite ? 'Añadir obra y aceptar' : 'Aplicar corrección y aceptar')} </button>
            <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => void handleResolve('rejected')}>Rechazar solicitud</button>
          </div>
          <div className="small text-secondary mt-2">Al aceptar se guardará el valor original en la auditoría. Si el parte estaba revisado, volverá a quedar pendiente.</div>
        </form>
      </div>
    </article>
  )
}
