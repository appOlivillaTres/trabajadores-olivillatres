import { useEffect, useState } from 'react'
import { readSessionDraft, removeSessionDraft, writeSessionDraft } from '../../../lib/sessionDrafts'

function makeInitialValues(report) {
  return {
    workDate: report.work_date ?? '',
    worksiteId: report.worksite_id ?? '',
    activityDescription: report.activity_description ?? '',
    observations: report.observations ?? '',
    hasIncident: Boolean(report.has_incident),
    incidentDetails: report.incident_details ?? '',
    workerHours: (report.participants ?? []).map((participant) => ({
      workerRowId: participant.id,
      workerId: participant.worker_id,
      workerName: participant.profile?.display_name ?? 'Trabajador',
      hours: String(participant.hours ?? ''),
    })),
  }
}

function restoreValues(report, draft) {
  const initial = makeInitialValues(report)
  if (!draft || typeof draft !== 'object') return initial
  const hoursByRow = new Map((Array.isArray(draft.workerHours) ? draft.workerHours : [])
    .filter((item) => item?.workerRowId)
    .map((item) => [item.workerRowId, item.hours]))
  return {
    ...initial,
    workDate: typeof draft.workDate === 'string' ? draft.workDate : initial.workDate,
    worksiteId: typeof draft.worksiteId === 'string' ? draft.worksiteId : initial.worksiteId,
    activityDescription: typeof draft.activityDescription === 'string' ? draft.activityDescription : initial.activityDescription,
    observations: typeof draft.observations === 'string' ? draft.observations : initial.observations,
    hasIncident: typeof draft.hasIncident === 'boolean' ? draft.hasIncident : initial.hasIncident,
    incidentDetails: typeof draft.incidentDetails === 'string' ? draft.incidentDetails : initial.incidentDetails,
    workerHours: initial.workerHours.map((participant) => ({
      ...participant,
      hours: hoursByRow.has(participant.workerRowId) ? String(hoursByRow.get(participant.workerRowId)) : participant.hours,
    })),
  }
}

export default function AdminReportEditForm({ report, worksites, busy = false, onCancel, onSave }) {
  const draftKey = `olivillatres:admin-report-edit-draft:${report.id}`
  const [values, setValues] = useState(() => restoreValues(report, readSessionDraft(draftKey)))
  const [error, setError] = useState('')
  useEffect(() => {
    writeSessionDraft(draftKey, values)
  }, [draftKey, values])

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setError('')
  }

  function updateHours(workerRowId, hours) {
    setValues((current) => ({
      ...current,
      workerHours: current.workerHours.map((participant) => participant.workerRowId === workerRowId
        ? { ...participant, hours }
        : participant),
    }))
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!values.workDate) return setError('Selecciona la fecha del trabajo.')
    if (!values.worksiteId) return setError('Selecciona una obra.')
    if (!values.activityDescription.trim()) return setError('La descripción del trabajo es obligatoria.')
    if (values.hasIncident && !values.incidentDetails.trim()) return setError('Describe la incidencia antes de guardar.')

    const normalizedHours = []
    for (const participant of values.workerHours) {
      const hours = Number(String(participant.hours).replace(',', '.'))
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.abs(hours * 4 - Math.round(hours * 4)) > 0.00001) {
        return setError(`Indica unas horas válidas para ${participant.workerName}: más de 0, hasta 24 y en incrementos de 0,25.`)
      }
      normalizedHours.push({ workerRowId: participant.workerRowId, hours })
    }

    const success = await onSave({
      workDate: values.workDate,
      worksiteId: values.worksiteId,
      activityDescription: values.activityDescription.trim(),
      observations: values.observations.trim(),
      hasIncident: values.hasIncident,
      incidentDetails: values.hasIncident ? values.incidentDetails.trim() : '',
      workerHours: normalizedHours,
    })
    if (success) removeSessionDraft(draftKey)
  }

  return (
    <form className="border rounded-3 bg-light p-3 mt-3" onSubmit={handleSubmit}>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h4 className="h6 fw-bold mb-1">Editar parte directamente</h4>
          <p className="small text-secondary mb-0">Los cambios quedan auditados. Si el parte estaba revisado, volverá a pendiente.</p>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-4">
          <label className="form-label" htmlFor={`admin-edit-date-${report.id}`}>Fecha del trabajo *</label>
          <input id={`admin-edit-date-${report.id}`} className="form-control" type="date" required value={values.workDate} onChange={(event) => update('workDate', event.target.value)} disabled={busy} />
        </div>
        <div className="col-12 col-md-8">
          <label className="form-label" htmlFor={`admin-edit-worksite-${report.id}`}>Obra *</label>
          <select id={`admin-edit-worksite-${report.id}`} className="form-select" required value={values.worksiteId} onChange={(event) => update('worksiteId', event.target.value)} disabled={busy}>
            <option value="">Selecciona una obra</option>
            {worksites.map((worksite) => <option key={worksite.id} value={worksite.id}>{worksite.name}{worksite.active ? '' : ' (inactiva)'}</option>)}
          </select>
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`admin-edit-activity-${report.id}`}>Trabajo realizado *</label>
          <textarea id={`admin-edit-activity-${report.id}`} className="form-control" rows={3} maxLength={3000} required value={values.activityDescription} onChange={(event) => update('activityDescription', event.target.value)} disabled={busy} />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor={`admin-edit-observations-${report.id}`}>Observaciones</label>
          <textarea id={`admin-edit-observations-${report.id}`} className="form-control" rows={2} maxLength={3000} value={values.observations} onChange={(event) => update('observations', event.target.value)} disabled={busy} />
        </div>
        <div className="col-12">
          <div className="form-check form-switch mb-2">
            <input id={`admin-edit-incident-${report.id}`} className="form-check-input" type="checkbox" role="switch" checked={values.hasIncident} onChange={(event) => setValues((current) => ({ ...current, hasIncident: event.target.checked, incidentDetails: event.target.checked ? current.incidentDetails : '' }))} disabled={busy} />
            <label className="form-check-label" htmlFor={`admin-edit-incident-${report.id}`}>Ha habido una incidencia</label>
          </div>
          {values.hasIncident && <>
            <label className="form-label" htmlFor={`admin-edit-incident-details-${report.id}`}>Detalle de la incidencia *</label>
            <textarea id={`admin-edit-incident-details-${report.id}`} className="form-control" rows={2} maxLength={3000} required value={values.incidentDetails} onChange={(event) => update('incidentDetails', event.target.value)} disabled={busy} />
          </>}
        </div>
      </div>

      <div className="mt-3">
        <h5 className="h6 fw-bold">Horas por trabajador en esta obra</h5>
        {values.workerHours.length === 0 ? (
          <p className="small text-secondary mb-0">Este parte no tiene trabajadores asociados. Puedes corregir los datos generales del parte.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead><tr><th>Trabajador</th><th style={{ width: '11rem' }}>Horas *</th></tr></thead>
              <tbody>
                {values.workerHours.map((participant) => (
                  <tr key={participant.workerRowId}>
                    <td>{participant.workerName}</td>
                    <td><input className="form-control form-control-sm" type="number" min="0.25" max="24" step="0.25" required value={participant.hours} onChange={(event) => updateHours(participant.workerRowId, event.target.value)} disabled={busy} aria-label={`Horas de ${participant.workerName}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">{error}</div>}
      <div className="d-flex flex-wrap gap-2 justify-content-end mt-3">
        <button type="button" className="btn btn-outline-secondary" onClick={() => { removeSessionDraft(draftKey); onCancel?.() }} disabled={busy}>Cancelar</button>
        <button type="submit" className="btn btn-success" disabled={busy}>{busy ? 'Guardando cambios…' : 'Guardar cambios'}</button>
      </div>
    </form>
  )
}
