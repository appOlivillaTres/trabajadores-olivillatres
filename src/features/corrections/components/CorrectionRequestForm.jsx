import { useEffect, useMemo, useState } from 'react'
import { createCorrectionRequest } from '../services/correctionRequestsService'
import { getWorksites } from '../../worksites/services/worksitesService'
import { getActiveWorkers } from '../../employees/services/employeesService'
import { readSessionDraft, writeSessionDraft } from '../../../lib/sessionDrafts'

const REPORT_FIELDS = [
  ['activity_description', 'Trabajo realizado'],
  ['worksite_id', 'Obra ya registrada'],
  ['work_date', 'Fecha del trabajo'],
  ['observations', 'Observaciones'],
  ['has_incident', 'Si hubo incidencia'],
  ['incident_details', 'Detalle de la incidencia'],
  ['add_worksite', 'Añadir una obra olvidada'],
]

export default function CorrectionRequestForm({ report, currentUserId, onSubmitted, existingWorksiteIds = [] }) {
  const draftKey = `olivillatres:correction-request-draft:${currentUserId}:${report.id}`
  const initialDraft = readSessionDraft(draftKey)
  const [open, setOpen] = useState(() => Boolean(initialDraft?.open))
  const [fieldName, setFieldName] = useState(() => initialDraft?.fieldName ?? 'activity_description')
  const [reason, setReason] = useState(() => initialDraft?.reason ?? '')
  const [suggestedValue, setSuggestedValue] = useState(() => initialDraft?.suggestedValue ?? '')
  const [requestedWorksiteId, setRequestedWorksiteId] = useState(() => initialDraft?.requestedWorksiteId ?? '')
  const [requestedActivityDescription, setRequestedActivityDescription] = useState(() => initialDraft?.requestedActivityDescription ?? '')
  const [requestedParticipants, setRequestedParticipants] = useState(() => initialDraft?.requestedParticipants ?? { [currentUserId]: initialDraft?.requestedHours ?? '' })
  const [activeWorkers, setActiveWorkers] = useState([])
  const [workerSearch, setWorkerSearch] = useState('')
  const [loadingWorkers, setLoadingWorkers] = useState(false)
  const [requestedObservations, setRequestedObservations] = useState(() => initialDraft?.requestedObservations ?? '')
  const [requestedHasIncident, setRequestedHasIncident] = useState(() => Boolean(initialDraft?.requestedHasIncident))
  const [requestedIncidentDetails, setRequestedIncidentDetails] = useState(() => initialDraft?.requestedIncidentDetails ?? '')
  const [worksites, setWorksites] = useState([])
  const [loadingWorksites, setLoadingWorksites] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    writeSessionDraft(draftKey, {
      open, fieldName, reason, suggestedValue, requestedWorksiteId,
      requestedActivityDescription, requestedParticipants, requestedObservations,
      requestedHasIncident, requestedIncidentDetails,
    })
  }, [draftKey, open, fieldName, reason, suggestedValue, requestedWorksiteId, requestedActivityDescription, requestedParticipants, requestedObservations, requestedHasIncident, requestedIncidentDetails])

  useEffect(() => {
    if (!open || fieldName !== 'add_worksite') return undefined
    let cancelled = false
    setLoadingWorksites(true)
    getWorksites()
      .then((rows) => { if (!cancelled) setWorksites(rows.filter((worksite) => worksite.active)) })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'No se han podido cargar las obras.') })
      .finally(() => { if (!cancelled) setLoadingWorksites(false) })
    return () => { cancelled = true }
  }, [open, fieldName])

  useEffect(() => {
    if (!open || fieldName !== 'add_worksite') return undefined
    let cancelled = false
    setLoadingWorkers(true)
    getActiveWorkers()
      .then((rows) => {
        if (cancelled) return
        setActiveWorkers(rows)
        setRequestedParticipants((current) => current[currentUserId]
          ? current
          : { [currentUserId]: '', ...current })
      })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'No se han podido cargar los trabajadores.') })
      .finally(() => { if (!cancelled) setLoadingWorkers(false) })
    return () => { cancelled = true }
  }, [open, fieldName, currentUserId])

  const myParticipant = useMemo(
    () => report.participants?.find((participant) => participant.worker_id === currentUserId),
    [report.participants, currentUserId],
  )
  const pendingRequests = report.correctionRequests ?? []
  const isAddWorksite = fieldName === 'add_worksite'
  const targetType = isAddWorksite ? 'new_worksite' : fieldName === 'hours' ? 'worker_hours' : 'report'
  const targetWorkerRowId = fieldName === 'hours' ? myParticipant?.id ?? null : null
  const hasPendingForField = pendingRequests.some((request) => {
    if (request.status !== 'pending') return false
    if (isAddWorksite) {
      return request.target_type === 'new_worksite' && request.requested_worksite_id === requestedWorksiteId && Boolean(requestedWorksiteId)
    }
    return request.field_name === fieldName
      && request.target_type === targetType
      && (request.target_worker_row_id ?? null) === targetWorkerRowId
  })

  const requesterHours = requestedParticipants[currentUserId] ?? ''
  const chosenParticipantIds = Object.keys(requestedParticipants)
  const existingWorksiteKeys = existingWorksiteIds.filter(Boolean).map(String).sort().join('|')
  const existingWorksiteIdSet = new Set(existingWorksiteKeys ? existingWorksiteKeys.split('|') : [])
  const availableWorksites = worksites.filter((worksite) => !existingWorksiteIdSet.has(String(worksite.id)))
  const selectedWorksiteAlreadyExists = Boolean(requestedWorksiteId) && existingWorksiteIdSet.has(String(requestedWorksiteId))

  useEffect(() => {
    // Si había una selección guardada en borrador y esa obra ya aparece en la jornada,
    // la eliminamos de la selección automáticamente.
    if (requestedWorksiteId && existingWorksiteKeys.split('|').includes(String(requestedWorksiteId))) {
      setRequestedWorksiteId('')
    }
  }, [existingWorksiteKeys, requestedWorksiteId])
  const visibleWorkers = activeWorkers.filter((worker) => {
    const query = workerSearch.trim().toLocaleLowerCase('es')
    return !query || `${worker.display_name ?? ''} ${worker.username ?? ''}`.toLocaleLowerCase('es').includes(query)
  })

  function toggleRequestedWorker(workerId, checked) {
    if (workerId === currentUserId && !checked) return
    setRequestedParticipants((current) => {
      if (checked) return { ...current, [workerId]: current[workerId] ?? '' }
      const next = { ...current }
      delete next[workerId]
      return next
    })
  }

  function updateRequestedParticipantHours(workerId, hours) {
    setRequestedParticipants((current) => ({ ...current, [workerId]: hours }))
  }

  function resetAddedWorksiteFields() {
    setRequestedWorksiteId('')
    setRequestedActivityDescription('')
    setRequestedParticipants({ [currentUserId]: '' })
    setWorkerSearch('')
    setRequestedObservations('')
    setRequestedHasIncident(false)
    setRequestedIncidentDetails('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (isAddWorksite) {
        if (selectedWorksiteAlreadyExists) throw new Error('Esa obra ya está incluida en tu jornada de ese día. No puedes solicitar añadirla otra vez.')
        if (!availableWorksites.some((worksite) => String(worksite.id) === String(requestedWorksiteId))) throw new Error('Selecciona una obra que todavía no esté incluida en tu jornada.')
        if (!chosenParticipantIds.includes(currentUserId)) throw new Error('Debes incluirte en la solicitud.')
        if (chosenParticipantIds.length < 1) throw new Error('Selecciona al menos un trabajador.')
        for (const workerId of chosenParticipantIds) {
          const value = requestedParticipants[workerId]
          const numeric = Number(String(value ?? '').replace(',', '.'))
          if (value === '' || !Number.isFinite(numeric) || numeric <= 0 || numeric > 24 || Math.abs(numeric * 4 - Math.round(numeric * 4)) > 0.00001) {
            const person = activeWorkers.find((worker) => worker.id === workerId)
            throw new Error(`Indica las horas de ${person?.display_name ?? 'cada trabajador'} en incrementos de 0,25, entre 0,25 y 24.`)
          }
        }
      }
      await createCorrectionRequest({
        reportId: report.id,
        targetType,
        targetWorkerRowId,
        fieldName,
        reason,
        suggestedValue,
        requestedWorksiteId,
        requestedActivityDescription,
        requestedHours: requesterHours,
        requestedParticipants: chosenParticipantIds.map((workerId) => ({
          workerId,
          hours: Number(String(requestedParticipants[workerId]).replace(',', '.')),
        })),
        requestedObservations,
        requestedHasIncident,
        requestedIncidentDetails,
      })
      setReason('')
      setSuggestedValue('')
      resetAddedWorksiteFields()
      setOpen(false)
      setNotice(isAddWorksite
        ? 'Solicitud para añadir la obra enviada. No se añadirá al parte hasta que la apruebe el administrador.'
        : 'Solicitud enviada. El parte no se cambiará hasta que la revise el administrador.')
      await onSubmitted?.()
    } catch (submitError) {
      setError(submitError.message || 'No se ha podido enviar la solicitud.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-top pt-3 mt-3">
      {notice && <div className="alert alert-success py-2" role="status">{notice}</div>}
      {pendingRequests.length > 0 && (
        <div className="mb-2">
          {pendingRequests.map((request) => {
            const status = request.status === 'accepted'
              ? { label: 'Aceptada', className: 'text-bg-success' }
              : request.status === 'rejected'
                ? { label: 'Rechazada', className: 'text-bg-danger' }
                : { label: 'Corrección pendiente', className: 'text-bg-warning' }
            const label = REPORT_FIELDS.find(([value]) => value === request.field_name)?.[1] ?? (request.field_name === 'hours' ? 'Mis horas' : request.field_name)
            return (
              <div className="small border rounded p-2 mb-2" key={request.id}>
                <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
                  <span className={`badge ${status.className}`}>{status.label}</span>
                  <span>{label}</span>
                </div>
                <div>{request.reason}</div>
                {request.target_type === 'new_worksite' && <div className="text-secondary mt-1">{worksites.find((worksite) => worksite.id === request.requested_worksite_id)?.name ?? 'Obra solicitada'} · {(request.requested_participants?.length ? request.requested_participants : [{ worker_id: request.requested_by, hours: request.requested_hours }]).map((participant) => `${participant.worker?.display_name ?? (participant.worker_id === currentUserId ? 'Tú' : 'Trabajador')}: ${participant.hours} h`).join(' · ')}</div>}
                {request.admin_response && <div className="text-secondary mt-1"><strong>Respuesta:</strong> {request.admin_response}</div>}
              </div>
            )
          })}
        </div>
      )}
      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => { setOpen((value) => !value); setError('') }}>
        {open ? 'Cancelar solicitud' : 'Solicitar corrección o añadir una obra'}
      </button>

      {open && (
        <form className="card card-body bg-light mt-3" onSubmit={handleSubmit}>
          <h3 className="h6 fw-bold">¿Qué necesitas cambiar?</h3>
          <div className="mb-3">
            <label className="form-label" htmlFor={`correction-field-${report.id}`}>Tipo de solicitud</label>
            <select
              id={`correction-field-${report.id}`}
              className="form-select"
              value={fieldName}
              onChange={(event) => { setFieldName(event.target.value); setError('') }}
            >
              {REPORT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              {myParticipant && <option value="hours">Corregir mis horas ({myParticipant.hours} h actualmente)</option>}
            </select>
          </div>

          {isAddWorksite ? (
            <>
              <div className="alert alert-info py-2">Esta petición añadirá una actividad nueva a la misma fecha. Solo se incorporará al parte cuando el administrador la apruebe.</div>
              <div className="mb-3">
                <label className="form-label" htmlFor={`add-worksite-${report.id}`}>Obra que falta *</label>
                <select id={`add-worksite-${report.id}`} className="form-select" required value={requestedWorksiteId} onChange={(event) => setRequestedWorksiteId(event.target.value)} disabled={loadingWorksites || saving || availableWorksites.length === 0}>
                  <option value="">{loadingWorksites ? 'Cargando obras…' : availableWorksites.length ? 'Selecciona una obra' : 'No quedan obras nuevas para esta jornada'}</option>
                  {availableWorksites.map((worksite) => <option key={worksite.id} value={worksite.id}>{worksite.name}{worksite.address ? ` · ${worksite.address}` : ''}</option>)}
                </select>
                {availableWorksites.length === 0 && !loadingWorksites && <div className="form-text text-danger">Todas las obras activas ya figuran en tu jornada o tienen una solicitud pendiente para esta fecha.</div>}
                {availableWorksites.length > 0 && <div className="form-text">Las obras que ya aparecen en tu jornada o tienen una solicitud pendiente no se muestran para evitar duplicados.</div>}
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor={`add-description-${report.id}`}>Trabajo realizado en esa obra *</label>
                <textarea id={`add-description-${report.id}`} className="form-control" rows={3} minLength={2} maxLength={3000} required value={requestedActivityDescription} onChange={(event) => setRequestedActivityDescription(event.target.value)} placeholder="Describe el trabajo que olvidaste incluir." />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor={`add-worker-search-${report.id}`}>Trabajadores que realizaron esta actividad *</label>
                <p className="form-text mt-0">Estás incluido por defecto. Puedes añadir a los compañeros que también trabajaron en esta obra e indicar las horas individuales de cada uno.</p>
                <input id={`add-worker-search-${report.id}`} className="form-control mb-2" type="search" value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} placeholder="Buscar por nombre o usuario…" disabled={loadingWorkers || saving} />
                {loadingWorkers ? <div className="small text-secondary">Cargando trabajadores…</div> : (
                  <div className="border rounded p-2" style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                    {visibleWorkers.map((worker) => (
                      <label key={worker.id} className="form-check d-flex align-items-center gap-2 py-1">
                        <input className="form-check-input mt-0" type="checkbox" checked={chosenParticipantIds.includes(worker.id)} disabled={worker.id === currentUserId || saving} onChange={(event) => toggleRequestedWorker(worker.id, event.target.checked)} />
                        <span>{worker.display_name}{worker.username ? <span className="text-secondary small ms-2">@{worker.username}</span> : null}{worker.id === currentUserId ? <span className="badge text-bg-success ms-2">Tú</span> : null}</span>
                      </label>
                    ))}
                    {visibleWorkers.length === 0 && <p className="small text-secondary mb-0">No hay trabajadores que coincidan con la búsqueda.</p>}
                  </div>
                )}
              </div>
              <div className="mb-3">
                <div className="form-label">Horas por trabajador *</div>
                {chosenParticipantIds.map((workerId) => {
                  const worker = activeWorkers.find((candidate) => candidate.id === workerId)
                  return (
                    <div className="row align-items-center g-2 mb-2" key={workerId}>
                      <div className="col"><label className="form-label mb-0" htmlFor={`add-hours-${report.id}-${workerId}`}>{worker?.display_name ?? (workerId === currentUserId ? 'Tú' : 'Trabajador')}</label></div>
                      <div className="col-5 col-sm-4"><input id={`add-hours-${report.id}-${workerId}`} className="form-control" type="number" min="0.25" max="24" step="0.25" required value={requestedParticipants[workerId] ?? ''} onChange={(event) => updateRequestedParticipantHours(workerId, event.target.value)} placeholder="Ej.: 3,5" disabled={saving} /></div>
                    </div>
                  )
                })}
                <div className="form-text">Introduce las horas de esta obra para cada persona, no el total de su jornada.</div>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor={`add-observations-${report.id}`}>Observaciones (opcional)</label>
                <textarea id={`add-observations-${report.id}`} className="form-control" rows={2} maxLength={3000} value={requestedObservations} onChange={(event) => setRequestedObservations(event.target.value)} />
              </div>
              <div className="form-check form-switch mb-3">
                <input id={`add-incident-${report.id}`} className="form-check-input" type="checkbox" role="switch" checked={requestedHasIncident} onChange={(event) => { setRequestedHasIncident(event.target.checked); if (!event.target.checked) setRequestedIncidentDetails('') }} />
                <label className="form-check-label" htmlFor={`add-incident-${report.id}`}>Hubo una incidencia en esa obra</label>
              </div>
              {requestedHasIncident && (
                <div className="mb-3">
                  <label className="form-label" htmlFor={`add-incident-details-${report.id}`}>Detalle de la incidencia *</label>
                  <textarea id={`add-incident-details-${report.id}`} className="form-control" rows={2} minLength={2} maxLength={3000} required value={requestedIncidentDetails} onChange={(event) => setRequestedIncidentDetails(event.target.value)} />
                </div>
              )}
            </>
          ) : (
            <div className="mb-3">
              <label className="form-label" htmlFor={`correction-value-${report.id}`}>Dato correcto propuesto (opcional)</label>
              <textarea
                id={`correction-value-${report.id}`}
                className="form-control"
                rows={2}
                maxLength={2000}
                value={suggestedValue}
                onChange={(event) => setSuggestedValue(event.target.value)}
                placeholder={fieldName === 'hours' ? 'Ej.: 6' : fieldName === 'worksite_id' ? 'Nombre de la obra correcta' : 'Escribe el valor correcto si lo conoces'}
              />
              <div className="form-text">La propuesta no modifica el parte automáticamente; el administrador comprobará el dato.</div>
            </div>
          )}

          <div className="mb-3">
            <label className="form-label" htmlFor={`correction-reason-${report.id}`}>{isAddWorksite ? '¿Por qué no se incluyó la obra? *' : 'Explica el error *'}</label>
            <textarea id={`correction-reason-${report.id}`} className="form-control" rows={3} minLength={5} maxLength={2000} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isAddWorksite ? 'Ej.: Se me olvidó incluir esta obra al registrar la jornada.' : 'Ej.: Registré 5 horas, pero fueron 6.'} />
          </div>
          {hasPendingForField && <div className="alert alert-warning py-2">Ya tienes una solicitud pendiente para ese dato u obra.</div>}
          {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={saving || hasPendingForField || reason.trim().length < 5 || (isAddWorksite && (loadingWorksites || loadingWorkers || !requestedWorksiteId || !requestedActivityDescription.trim() || !chosenParticipantIds.length || chosenParticipantIds.some((workerId) => !(Number(requestedParticipants[workerId]) > 0))))}>
              {saving ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  )
}
