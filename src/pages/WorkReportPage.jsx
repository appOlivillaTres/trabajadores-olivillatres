import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWorkReports } from '../features/reports/hooks/useWorkReports'
import WorksiteSelector from '../features/reports/components/WorksiteSelector'
import WorkerPicker from '../features/reports/components/WorkerPicker'
import { getWorkdaySchedule, saveWorkdayScheduleForWorker } from '../features/reports/services/workReportsService'
import { getReportsWithDetails } from '../features/reports/services/reportsQueryService'
import { saveSharedReportDateRange } from '../features/reports/utils/reportFiltersStorage'
import { getAbsences, hasCurrentWorkerAbsence } from '../features/employees/services/absencesService'

function getLocalDateValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const EMPTY_SCHEDULE = {
  entryTime: '',
  exitTime: '',
}

function formatSelectedDate(value) {
  if (!value) return 'Selecciona una fecha'
  const date = new Date(`${value}T12:00:00`)
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}


function createWorkBlock(id, profile) {
  return {
    id,
    worksiteId: '',
    activityDescription: '',
    observations: '',
    hasIncident: false,
    incidentDetails: '',
    participants: profile?.role === 'worker' && profile.id
      ? [{ workerId: profile.id, hours: '' }]
      : [],
  }
}

export default function WorkReportPage() {
  const { profile } = useAuth()
  const {
    worksites,
    workers,
    loading,
    saving,
    error,
    loadFormData,
    createWorkReport,
    clearError,
  } = useWorkReports()

  const nextBlockId = useRef(2)
  const [workDate, setWorkDate] = useState(getLocalDateValue)
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE)
  const [scheduleDirty, setScheduleDirty] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleLoadError, setScheduleLoadError] = useState('')
  const [scheduleReloadToken, setScheduleReloadToken] = useState(0)
  const [scheduleWorkerId, setScheduleWorkerId] = useState('')
  const [blocks, setBlocks] = useState(() => [createWorkBlock(1, null)])
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [dateReports, setDateReports] = useState([])
  const [dateCheckLoading, setDateCheckLoading] = useState(false)
  const [dateCheckError, setDateCheckError] = useState('')
  const [dateCheckReloadToken, setDateCheckReloadToken] = useState(0)
  const [dateAbsences, setDateAbsences] = useState([])
  const [absenceCheckLoading, setAbsenceCheckLoading] = useState(false)
  const [absenceCheckError, setAbsenceCheckError] = useState('')
  const [ownWorkerAbsent, setOwnWorkerAbsent] = useState(false)

  // Cuando llega el perfil, incluye al trabajador que crea el parte en cada bloque.
  // No se muestra una lista completa de los trabajadores: los compañeros se buscan bajo demanda.
  useEffect(() => {
    if (profile?.role !== 'worker' || !profile.id) return
    setBlocks((current) => current.map((block) => (
      block.participants.some((participant) => participant.workerId === profile.id)
        ? block
        : { ...block, participants: [{ workerId: profile.id, hours: '' }, ...block.participants] }
    )))
  }, [profile?.id, profile?.role])

  useEffect(() => {
    if (profile?.role === 'admin' && workers.length && !workers.some((worker) => worker.id === scheduleWorkerId)) {
      setScheduleWorkerId(workers[0].id)
    }
  }, [profile?.role, workers, scheduleWorkerId])

  const workersById = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker])),
    [workers],
  )

  // Comprueba los registros asociados a esta fecha, incluidos los que otro
  // trabajador haya introducido para la persona seleccionada.
  useEffect(() => {
    if (!profile?.id || !workDate || !['worker', 'admin'].includes(profile.role)) return undefined

    let cancelled = false
    setDateReports([])
    setDateCheckLoading(true)
    setDateCheckError('')

    getReportsWithDetails({
      fromDate: workDate,
      toDate: workDate,
      workerId: profile.role === 'worker' ? profile.id : '',
    })
      .then((rows) => {
        if (!cancelled) setDateReports(rows)
      })
      .catch((checkError) => {
        if (!cancelled) {
          setDateCheckError(checkError.message || 'No se han podido comprobar los partes de esta fecha.')
        }
      })
      .finally(() => {
        if (!cancelled) setDateCheckLoading(false)
      })

    return () => { cancelled = true }
  }, [profile?.id, profile?.role, workDate, dateCheckReloadToken])

  // Comprueba las ausencias que cubren la fecha seleccionada antes de permitir guardar.
  useEffect(() => {
    if (!workDate || !['worker', 'admin'].includes(profile?.role)) return undefined
    let cancelled = false
    setDateAbsences([])
    setOwnWorkerAbsent(false)
    setAbsenceCheckLoading(true)
    setAbsenceCheckError('')
    const check = profile.role === 'admin'
      ? getAbsences({ from: workDate, to: workDate }).then((rows) => ({ rows, ownAbsent: false }))
      : hasCurrentWorkerAbsence(workDate).then((ownAbsent) => ({ rows: [], ownAbsent }))
    check
      .then(({ rows, ownAbsent }) => {
        if (cancelled) return
        setDateAbsences(rows)
        setOwnWorkerAbsent(ownAbsent)
      })
      .catch((checkError) => {
        if (!cancelled) setAbsenceCheckError(checkError.message || 'No se han podido comprobar las ausencias de esta fecha.')
      })
      .finally(() => { if (!cancelled) setAbsenceCheckLoading(false) })
    return () => { cancelled = true }
  }, [profile?.id, profile?.role, workDate, dateCheckReloadToken])

  const absenceByWorkerId = useMemo(() => {
    const result = new Map()
    for (const absence of dateAbsences) {
      const label = absence.absence_type === 'sick_leave' ? 'baja laboral' : 'vacaciones'
      if (!result.has(absence.worker_id)) result.set(absence.worker_id, [])
      if (!result.get(absence.worker_id).includes(label)) result.get(absence.worker_id).push(label)
    }
    return result
  }, [dateAbsences])

  const dateReportWorkerIds = useMemo(() => {
    const ids = new Set()
    dateReports.forEach((report) => {
      report.participants?.forEach((participant) => ids.add(participant.worker_id))
    })
    return ids
  }, [dateReports])

  const hasExistingOwnDay = profile?.role === 'worker'
    && dateReports.some((report) => report.participants?.some((participant) => participant.worker_id === profile.id))

  const duplicateParticipants = useMemo(() => {
    const selectedIds = new Set(blocks.flatMap((block) => block.participants.map((participant) => participant.workerId)))
    return [...selectedIds]
      .filter((workerId) => dateReportWorkerIds.has(workerId))
      .map((workerId) => workersById.get(workerId)?.display_name ?? 'Un trabajador')
  }, [blocks, dateReportWorkerIds, workersById])

  function openExistingDayInHistory() {
    if (workDate) saveSharedReportDateRange({ fromDate: workDate, toDate: workDate })
  }

  // El horario está asociado al trabajador y al día seleccionado, no a cada obra.
  // Al volver a elegir una fecha, recupera lo guardado para evitar sobrescribirlo por accidente.
  useEffect(() => {
    const targetWorkerId = profile?.role === 'worker' ? profile.id : (profile?.role === 'admin' ? scheduleWorkerId : '')
    if (!targetWorkerId || !workDate) return undefined

    let cancelled = false
    setSchedule(EMPTY_SCHEDULE)
    setScheduleDirty(false)
        setScheduleLoading(true)
    setScheduleLoadError('')

    getWorkdaySchedule(workDate, targetWorkerId)
      .then((savedSchedule) => {
        if (cancelled || !savedSchedule) return
        setSchedule({
          entryTime: savedSchedule.entry_time ?? '',
          exitTime: savedSchedule.exit_time ?? '',
        })
      })
      .catch((loadError) => {
        if (!cancelled) {
          setScheduleLoadError('No se ha podido comprobar el horario guardado para este día. Comprueba que la migración del horario está instalada y vuelve a intentarlo.')
        }
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false)
      })

    return () => { cancelled = true }
  }, [profile?.id, profile?.role, scheduleWorkerId, workDate, scheduleReloadToken])

  function updateSchedule(field, value) {
    setSchedule((current) => ({ ...current, [field]: value }))
    setScheduleDirty(true)
    setFormError('')
    setSuccessMessage('')
  }

  function validateSchedule() {
    if (!schedule.entryTime || !schedule.exitTime) {
      return 'Indica la hora de entrada y la hora de salida de la jornada completa.'
    }
    if (schedule.entryTime === schedule.exitTime) {
      return 'La hora de entrada y la hora de salida no pueden ser iguales.'
    }
    return ''
  }

  const dailyHourTotals = useMemo(() => {
    const totals = new Map()
    blocks.forEach((block) => {
      block.participants.forEach((participant) => {
        const value = Number(participant.hours)
        if (participant.hours !== '' && Number.isFinite(value) && value > 0) {
          totals.set(participant.workerId, (totals.get(participant.workerId) ?? 0) + value)
        }
      })
    })
    return totals
  }, [blocks])

  function updateBlock(blockId, changes) {
    clearError()
    setFormError('')
    setSuccessMessage('')
    setBlocks((current) => current.map((block) => block.id === blockId ? { ...block, ...changes } : block))
  }

  function addBlock() {
    clearError()
    setFormError('')
    setSuccessMessage('')
    const id = nextBlockId.current++
    setBlocks((current) => [...current, createWorkBlock(id, profile)])
  }

  function removeBlock(blockId) {
    if (blocks.length === 1) return
    clearError()
    setFormError('')
    setSuccessMessage('')
    setBlocks((current) => current.filter((block) => block.id !== blockId))
  }

  function addParticipant(blockId, worker) {
    setBlocks((current) => current.map((block) => {
      if (block.id !== blockId || block.participants.some((participant) => participant.workerId === worker.id)) return block
      return { ...block, participants: [...block.participants, { workerId: worker.id, hours: '' }] }
    }))
    clearError()
    setFormError('')
    setSuccessMessage('')
  }

  function removeParticipant(blockId, workerId) {
    // Si registra un trabajador, mantiene su propia participación en cada bloque.
    if (profile?.role === 'worker' && workerId === profile.id) return
    setBlocks((current) => current.map((block) => block.id === blockId
      ? { ...block, participants: block.participants.filter((participant) => participant.workerId !== workerId) }
      : block))
    clearError()
    setFormError('')
    setSuccessMessage('')
  }

  function updateParticipantHours(blockId, workerId, hours) {
    setBlocks((current) => current.map((block) => block.id === blockId
      ? { ...block, participants: block.participants.map((participant) => participant.workerId === workerId ? { ...participant, hours } : participant) }
      : block))
    clearError()
    setFormError('')
    setSuccessMessage('')
  }

  function resetForm() {
    setWorkDate(getLocalDateValue())
    setSchedule(EMPTY_SCHEDULE)
    setScheduleDirty(false)
        setScheduleReloadToken((current) => current + 1)
    setBlocks([createWorkBlock(nextBlockId.current++, profile)])
    setFormError('')
    setSuccessMessage('')
    clearError()
  }

  function validateForm() {
    if (!workDate) return 'Selecciona la fecha del trabajo.'
    if (dateCheckLoading) return 'Espera a que termine la comprobación de los registros de esta fecha.'
    if (dateCheckError) return 'No se han podido comprobar los registros de esta fecha. Vuelve a comprobarlos antes de guardar.'
    if (absenceCheckLoading) return 'Espera a que termine la comprobación de ausencias de esta fecha.'
    if (absenceCheckError) return 'No se han podido comprobar las ausencias. Vuelve a comprobarlas antes de guardar.'
    if (profile?.role === 'worker' && ownWorkerAbsent) return 'No puedes registrar un parte porque constas como ausente en esta fecha. Si se trata de un error, contacta con el administrador.'
    const absentParticipantIds = [...new Set(blocks.flatMap((block) => block.participants.map((participant) => participant.workerId)))].filter((workerId) => absenceByWorkerId.has(workerId))
    if (absentParticipantIds.length) {
      const absentNames = absentParticipantIds.map((workerId) => `${workersById.get(workerId)?.display_name ?? 'Trabajador'} (${absenceByWorkerId.get(workerId).join(' y ')})`)
      return `No se puede registrar el parte porque hay trabajadores ausentes en esta fecha: ${absentNames.join(', ')}.`
    }
    if (hasExistingOwnDay) return 'Ya tienes un parte registrado en esta fecha. Entra en «Mis partes» y solicita una modificación.'
    if (profile?.role === 'admin' && duplicateParticipants.length > 0) {
      return `Ya hay registros para ${duplicateParticipants.join(', ')} en esta fecha. Usa Revisiones para editar un parte existente.`
    }
    if (profile?.role === 'admin' && !scheduleWorkerId) return 'Selecciona el trabajador al que corresponde el horario.'
    if (profile?.role === 'worker' || profile?.role === 'admin') {
      if (scheduleLoadError) return 'No se pudo cargar el horario guardado. Recarga el horario antes de guardar para evitar perder datos.'
      const scheduleError = validateSchedule()
      if (scheduleError) return scheduleError
    }
    if (blocks.length === 0) return 'Añade al menos una obra.'

    const totals = new Map()
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex]
      const label = `Obra ${blockIndex + 1}`
      if (!block.worksiteId) return `Selecciona una obra en el bloque «${label}».`
      if (!block.activityDescription.trim()) return `Describe el trabajo realizado en el bloque «${label}».`
      if (block.hasIncident && !block.incidentDetails.trim()) return `Describe la incidencia del bloque «${label}».`
      if (block.participants.length === 0) return `Añade al menos un trabajador al bloque «${label}».`
      if (profile?.role === 'worker' && !block.participants.some((participant) => participant.workerId === profile.id)) {
        return `Debes estar incluido en el bloque «${label}» si registras el trabajo de un compañero.`
      }
      const seen = new Set()
      for (const participant of block.participants) {
        if (seen.has(participant.workerId)) return `Hay un trabajador duplicado en el bloque «${label}».`
        seen.add(participant.workerId)
        const hours = Number(participant.hours)
        if (participant.hours === '' || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
          const name = workersById.get(participant.workerId)?.display_name ?? 'un trabajador'
          return `Indica las horas (más de 0 y hasta 24) de ${name} en el bloque «${label}».`
        }
        if (Math.abs(hours * 4 - Math.round(hours * 4)) > 0.00001) {
          return `Las horas deben ir en incrementos de 0,25 (por ejemplo, 7,5) en el bloque «${label}».`
        }
        totals.set(participant.workerId, (totals.get(participant.workerId) ?? 0) + hours)
      }
    }

    for (const [workerId, total] of totals) {
      if (total > 24) {
        const name = workersById.get(workerId)?.display_name ?? 'Un trabajador'
        return `${name} acumula ${total} horas entre las obras. El total diario no puede superar 24 horas.`
      }
    }
    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSuccessMessage('')
    clearError()
    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setFormError('')

    try {
      await createWorkReport({
        workDate,
        schedule: profile?.role === 'worker'
          ? { ...schedule, dirty: scheduleDirty }
          : null,
        entries: blocks.map((block) => ({
          worksiteId: block.worksiteId,
          activityDescription: block.activityDescription,
          observations: block.observations,
          hasIncident: block.hasIncident,
          incidentDetails: block.incidentDetails,
          participants: block.participants,
        })),
      })
      if (profile?.role === 'admin' && scheduleDirty) {
        await saveWorkdayScheduleForWorker(scheduleWorkerId, workDate, schedule)
      }
      const savedBlockCount = blocks.length
      // Se conservan la fecha y el horario para poder completar otro parte del mismo día.
      setBlocks([createWorkBlock(nextBlockId.current++, profile)])
      setScheduleDirty(false)
      setFormError('')
      clearError()
      setSuccessMessage(`Parte diario guardado correctamente: ${savedBlockCount} ${savedBlockCount === 1 ? 'bloque de obra' : 'bloques de obra'}. Para añadir o corregir algo más en esta fecha, solicita una modificación desde «Mis partes».`)
    } catch {
      // useWorkReports muestra el error del servidor en la pantalla.
    }
  }

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando datos...</span></div><p className="text-secondary mt-3 mb-0">Cargando obras y trabajadores...</p></div>
  }

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-xl-9">
        <div className="mb-4">
          <p className="text-success text-uppercase small fw-semibold mb-1">Partes de trabajo</p>
          <h1 className="h2 fw-bold mb-2">Nuevo parte de trabajo</h1>
          <p className="text-secondary mb-0">Registra el trabajo del día. Añade un bloque por cada obra y asigna las horas a cada persona en esa obra.</p>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            <div className="fw-semibold">No se ha podido completar la operación</div>
            <div>{error}</div>
            {error.toLocaleLowerCase('es').includes('ya existe un parte') && (
              <div className="mt-2">
                <Link to="/mis-partes" state={{ focusDate: workDate }} className="btn btn-sm btn-outline-primary" onClick={openExistingDayInHistory}>Ir a Mis partes</Link>
              </div>
            )}
            <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={() => void loadFormData()}>Volver a cargar datos</button>
          </div>
        )}
        {formError && <div className="alert alert-warning" role="alert">{formError}</div>}
        {successMessage && <div className="alert alert-success" role="status">{successMessage}</div>}

        {!error && worksites.length === 0 && <div className="alert alert-warning" role="alert">No hay obras activas disponibles. Pide al administrador que cree o active una obra antes de registrar un parte.</div>}
        {!error && workers.length === 0 && <div className="alert alert-warning" role="alert">No hay trabajadores activos disponibles para incluir en el parte.</div>}

        <form onSubmit={handleSubmit}>
          <section className="card border-0 shadow-sm mb-4">
            <div className="card-body p-4">
              <h2 className="h5 fw-bold mb-3">Fecha del trabajo</h2>
              <div className="row g-3 align-items-end">
                <div className="col-12 col-sm-6 col-md-5">
                  <label htmlFor="work-date" className="form-label">Fecha *</label>
                  <input id="work-date" type="date" className="form-control" value={workDate} onChange={(event) => { setWorkDate(event.target.value); setFormError(''); setSuccessMessage('') }} required />
                </div>
                <div className="col-12 col-sm-6 col-md-7 text-sm-end">
                  <span className="badge text-bg-secondary">{blocks.length} {blocks.length === 1 ? 'obra en el parte' : 'obras en el parte'}</span>
                </div>
              </div>
            </div>
          </section>

          {dateCheckLoading && <div className="alert alert-info py-2" role="status">Comprobando si ya hay un parte para esta persona y fecha…</div>}
          {dateCheckError && (
            <div className="alert alert-warning" role="alert">
              <p className="mb-2">No se ha podido comprobar si ya existe un parte. Por seguridad, no se podrá guardar hasta completar la comprobación. {dateCheckError}</p>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setDateCheckReloadToken((current) => current + 1)} disabled={dateCheckLoading || absenceCheckLoading}>Volver a comprobar</button>
            </div>
          )}
          {absenceCheckLoading && <div className="alert alert-info py-2" role="status">Comprobando las ausencias de esta fecha…</div>}
          {absenceCheckError && <div className="alert alert-warning" role="alert">No se han podido comprobar las ausencias. Por seguridad, no se podrá guardar hasta completar la comprobación. {absenceCheckError}<div><button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={() => setDateCheckReloadToken((current) => current + 1)} disabled={absenceCheckLoading}>Volver a comprobar</button></div></div>}
          {profile?.role === 'worker' && ownWorkerAbsent && !absenceCheckLoading && !absenceCheckError && (
            <div className="alert alert-danger" role="alert">
              <h2 className="h5 fw-bold">No puedes registrar un parte en esta fecha</h2>
              <p className="mb-0">Constas como ausente el {formatSelectedDate(workDate)}. Si se trata de un error, contacta con el administrador.</p>
            </div>
          )}

          {hasExistingOwnDay ? (
            <section className="alert alert-warning" role="alert">
              <h2 className="h5 fw-bold">Ya tienes un parte registrado para esta fecha</h2>
              <p className="mb-3">Para evitar duplicar obras u horas, no puedes enviar otro parte para este día. Si te has olvidado de una obra o necesitas corregir un dato, solicita una modificación del parte existente.</p>
              <Link to="/mis-partes" state={{ focusDate: workDate }} className="btn btn-primary" onClick={openExistingDayInHistory}>Ir a Mis partes y solicitar modificación</Link>
            </section>
          ) : (
            <>
              {profile?.role === 'admin' && duplicateParticipants.length > 0 && (
                <div className="alert alert-warning" role="alert">
                  <h2 className="h6 fw-bold">Hay trabajadores con partes ya registrados en esta fecha</h2>
                  <p className="mb-2">No se puede crear un segundo parte para: {duplicateParticipants.join(', ')}.</p>
                  <Link to="/revisiones" className="btn btn-sm btn-outline-primary" onClick={openExistingDayInHistory}>Ir a Revisiones para editar los registros existentes</Link>
                </div>
              )}
              <fieldset className="border-0 p-0 m-0" disabled={dateCheckLoading || Boolean(dateCheckError) || absenceCheckLoading || Boolean(absenceCheckError) || (profile?.role === 'worker' && ownWorkerAbsent)}>
          {(profile?.role === 'worker' || profile?.role === 'admin') && (
            <section className="card border-0 shadow-sm mb-4" aria-labelledby="schedule-heading">
              <div className="card-body p-3 p-md-4">
                <div className="mb-3">
                  <h2 id="schedule-heading" className="h5 fw-bold mb-1">Horario de la jornada</h2>
                  <p className="mb-2"><span className="fw-semibold">Día:</span> {formatSelectedDate(workDate)}</p>
                  <div className="alert alert-info py-2 mb-3" role="note">
                    <span className="fw-semibold">Importante:</span> Registra la entrada y la salida de la jornada completa. Este horario incluye el tiempo de almuerzo estipulado.
                  </div>
                  {profile?.role === 'admin' && (
                    <div className="mb-3">
                      <label htmlFor="schedule-worker" className="form-label">Trabajador al que corresponde este horario *</label>
                      <select id="schedule-worker" className="form-select" value={scheduleWorkerId} onChange={(event) => { setScheduleWorkerId(event.target.value); setScheduleDirty(false); setFormError(''); setSuccessMessage('') }} disabled={saving || workers.length === 0} required>
                        <option value="">Selecciona un trabajador</option>
                        {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name}{worker.username ? ` · ${worker.username}` : ''}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {scheduleLoadError && (
                  <div className="alert alert-warning py-2" role="alert">
                    <p className="mb-2">{scheduleLoadError}</p>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setScheduleReloadToken((current) => current + 1)} disabled={scheduleLoading}>Volver a comprobar</button>
                  </div>
                )}
                {scheduleLoading && <p className="small text-secondary mb-3" role="status">Comprobando si ya hay un horario guardado para este día…</p>}

                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label htmlFor="workday-entry" className="form-label">Hora de entrada *</label>
                    <input id="workday-entry" type="time" className="form-control" value={schedule.entryTime} onChange={(event) => updateSchedule('entryTime', event.target.value)} required disabled={saving || scheduleLoading || Boolean(scheduleLoadError)} />
                  </div>
                  <div className="col-12 col-md-6">
                    <label htmlFor="workday-exit" className="form-label">Hora de salida *</label>
                    <input id="workday-exit" type="time" className="form-control" value={schedule.exitTime} onChange={(event) => updateSchedule('exitTime', event.target.value)} required disabled={saving || scheduleLoading || Boolean(scheduleLoadError)} />
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2 mb-3">
            <p className="small text-secondary mb-0">
              {worksites.length > 0
                ? `${worksites.length} obras activas disponibles. Puedes añadir varios bloques, uno por cada obra del día.`
                : 'No hay obras activas cargadas. Puedes añadir bloques, pero el administrador debe activar o crear una obra para poder guardarlos.'}
            </p>
            <button
              type="button"
              className="btn btn-success"
              onClick={addBlock}
              disabled={saving || blocks.length >= 20}
            >
              <span aria-hidden="true" className="me-1">+</span> Añadir otra obra
            </button>
          </div>

          {blocks.map((block, index) => {
            const selectedIds = block.participants.map((participant) => participant.workerId)
            return (
              <section key={block.id} className="card border-0 shadow-sm mb-4">
                <div className="card-header bg-white border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 p-3 p-md-4">
                  <div>
                    <h2 className="h5 fw-bold mb-1">Obra {index + 1}</h2>
                    <p className="small text-secondary mb-0">Las horas y participantes de este bloque corresponden solo a esta obra.</p>
                  </div>
                  {blocks.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeBlock(block.id)} disabled={saving}>Eliminar obra</button>}
                </div>
                <div className="card-body p-3 p-md-4">
                  <div className="mb-4">
                    <WorksiteSelector worksites={worksites} value={block.worksiteId} onChange={(worksiteId) => updateBlock(block.id, { worksiteId })} disabled={worksites.length === 0 || saving} />
                  </div>

                  <div className="mb-4">
                    <label htmlFor={`activity-${block.id}`} className="form-label">Trabajo realizado en esta obra *</label>
                    <textarea id={`activity-${block.id}`} className="form-control" rows="3" maxLength={3000} value={block.activityDescription} onChange={(event) => updateBlock(block.id, { activityDescription: event.target.value })} required placeholder="Ej.: colocación de pladur en la segunda planta..." disabled={saving} />
                  </div>

                  <div className="border rounded-3 p-3 mb-4">
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
                      <div>
                        <h3 className="h6 fw-bold mb-1">Trabajadores y horas en esta obra</h3>
                        <p className="small text-secondary mb-0">Indica las horas de cada persona en esta obra, no el total de la jornada.</p>
                      </div>
                      <span className="badge text-bg-secondary">{block.participants.length} {block.participants.length === 1 ? 'persona' : 'personas'}</span>
                    </div>

                    {block.participants.length > 0 ? (
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <thead><tr><th scope="col">Trabajador</th><th scope="col" style={{ width: '10rem' }}>Horas *</th><th scope="col" className="text-end"> </th></tr></thead>
                          <tbody>
                            {block.participants.map((participant) => {
                              const worker = workersById.get(participant.workerId)
                              const isCurrentWorker = profile?.role === 'worker' && participant.workerId === profile.id
                              const dailyTotal = dailyHourTotals.get(participant.workerId) ?? 0
                              return (
                                <tr key={participant.workerId}>
                                  <td>
                                    <span className="fw-semibold">{worker?.display_name ?? 'Trabajador'}</span>
                                    {worker?.username && <span className="text-secondary small ms-2">@{worker.username}</span>}
                                    {isCurrentWorker && <span className="badge text-bg-success ms-2">Tú</span>}
                                    {dailyTotal > 24 && <span className="d-block text-danger small">Total diario superior a 24 horas</span>}
                                  </td>
                                  <td>
                                    <input aria-label={`Horas de ${worker?.display_name ?? 'trabajador'} en obra ${index + 1}`} type="number" className="form-control form-control-sm" min="0.25" max="24" step="0.25" required value={participant.hours} onChange={(event) => updateParticipantHours(block.id, participant.workerId, event.target.value)} placeholder="Ej. 4" disabled={saving} />
                                  </td>
                                  <td className="text-end">
                                    {!isCurrentWorker && <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Quitar a ${worker?.display_name ?? 'trabajador'}`} onClick={() => removeParticipant(block.id, participant.workerId)} disabled={saving}>Quitar</button>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-secondary small mb-2">Todavía no has añadido trabajadores a esta obra.</p>
                    )}

                    <WorkerPicker workers={workers} selectedIds={selectedIds} onAdd={(worker) => addParticipant(block.id, worker)} disabled={saving} />
                  </div>

                  <div className="mb-3">
                    <label htmlFor={`observations-${block.id}`} className="form-label">Observaciones (opcional)</label>
                    <textarea id={`observations-${block.id}`} className="form-control" rows="2" maxLength={3000} value={block.observations} onChange={(event) => updateBlock(block.id, { observations: event.target.value })} placeholder="Información adicional sobre este trabajo..." disabled={saving} />
                  </div>
                  <div className="form-check form-switch mb-3">
                    <input id={`incident-${block.id}`} className="form-check-input" type="checkbox" role="switch" checked={block.hasIncident} onChange={(event) => updateBlock(block.id, { hasIncident: event.target.checked, incidentDetails: event.target.checked ? block.incidentDetails : '' })} disabled={saving} />
                    <label htmlFor={`incident-${block.id}`} className="form-check-label fw-semibold">Ha habido una incidencia en esta obra</label>
                  </div>
                  {block.hasIncident && (
                    <div>
                      <label htmlFor={`incident-details-${block.id}`} className="form-label">Describe la incidencia *</label>
                      <textarea id={`incident-details-${block.id}`} className="form-control" rows="3" maxLength={3000} value={block.incidentDetails} onChange={(event) => updateBlock(block.id, { incidentDetails: event.target.value })} required placeholder="Describe qué ha ocurrido y si requiere seguimiento..." disabled={saving} />
                    </div>
                  )}
                </div>
              </section>
            )
          })}

          <div className="d-flex flex-column flex-sm-row gap-2 mb-4">
            <button type="button" className="btn btn-outline-success" onClick={addBlock} disabled={saving || blocks.length >= 20}>
              <span aria-hidden="true" className="me-1">+</span> Añadir otra obra
            </button>
            <span className="small text-secondary align-self-sm-center">Puedes añadir hasta 20 bloques de obra. Cada bloque tiene sus propias horas y participantes.</span>
          </div>

          <div className="d-flex flex-column flex-sm-row justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={resetForm} disabled={saving}>Limpiar formulario</button>
            <button type="submit" className="btn btn-success btn-lg" disabled={saving || dateCheckLoading || Boolean(dateCheckError) || absenceCheckLoading || Boolean(absenceCheckError) || (profile?.role === 'worker' && ownWorkerAbsent) || hasExistingOwnDay || (profile?.role === 'admin' && duplicateParticipants.length > 0) || worksites.length === 0 || workers.length === 0 || (profile?.role === 'admin' && !scheduleWorkerId) || ((profile?.role === 'worker' || profile?.role === 'admin') && (scheduleLoading || Boolean(scheduleLoadError)))}>
              {saving ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Guardando parte...</> : `Guardar parte diario (${blocks.length} ${blocks.length === 1 ? 'obra' : 'obras'})`}
            </button>
          </div>
              </fieldset>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
