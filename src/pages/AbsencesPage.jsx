import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { getWorkers } from '../features/employees/services/employeesService'
import { deleteAbsence, getAbsences, saveAbsence } from '../features/employees/services/absencesService'

const isoToday = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const blankForm = () => ({ id: null, worker_id: '', absence_type: 'vacation', starts_on: isoToday(), ends_on: isoToday(), admin_note: '' })
const labelType = (type) => type === 'sick_leave' ? 'Baja laboral' : 'Vacaciones'
const dateLabel = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('es-ES') : '—'


function WorkerPicker({ workers, value, onChange, disabled = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const inputId = useId().replace(/:/g, '')
  const selected = workers.find((worker) => worker.id === value) ?? null
  const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('es')
  const filtered = workers.filter((worker) => !query.trim()
    || normalize(`${worker.display_name} ${worker.username ?? ''}`).includes(normalize(query))).slice(0, 30)

  useEffect(() => {
    if (!open) setQuery(selected ? `${selected.display_name}${selected.active ? '' : ' (inactivo)'}` : '')
  }, [selected?.id, selected?.display_name, selected?.active, open])

  useEffect(() => {
    function outside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function escape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  function handleInput(event) {
    setQuery(event.target.value)
    setOpen(true)
    if (value) onChange('')
  }

  function choose(worker) {
    onChange(worker.id)
    setQuery(`${worker.display_name}${worker.active ? '' : ' (inactivo)'}`)
    setOpen(false)
  }

  return (
    <div className="position-relative" ref={rootRef}>
      <label className="form-label" htmlFor={inputId}>Trabajador</label>
      <input
        id={inputId}
        className="form-control"
        type="search"
        value={open ? query : (selected ? `${selected.display_name}${selected.active ? '' : ' (inactivo)'}` : query)}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={handleInput}
        placeholder="Escribe para buscar un trabajador..."
        autoComplete="off"
        disabled={disabled}
        aria-expanded={open}
        aria-autocomplete="list"
        required={!value}
      />
      {open && !disabled && (
        <div className="list-group position-absolute start-0 end-0 mt-1 shadow bg-white" style={{ zIndex: 1050, maxHeight: '16rem', overflowY: 'auto' }} role="listbox">
          {filtered.length === 0
            ? <div className="list-group-item small text-secondary">No se encontraron trabajadores.</div>
            : filtered.map((worker) => (
              <button key={worker.id} type="button" className={`list-group-item list-group-item-action ${value === worker.id ? 'active' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(worker)} role="option" aria-selected={value === worker.id}>
                <span className="d-block fw-semibold">{worker.display_name}</span>
                <span className="d-block small opacity-75">{worker.username ? `@${worker.username}` : ''}{worker.active ? '' : ' · Inactivo'}</span>
              </button>
            ))}
        </div>
      )}
      {selected && !open && <div className="form-text">Trabajador seleccionado. Pulsa para cambiarlo.</div>}
    </div>
  )
}

export default function AbsencesPage() {
  const [workers, setWorkers] = useState([])
  const [absences, setAbsences] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [form, setForm] = useState(blankForm)
  const [editing, setEditing] = useState(false)
  const [month, setMonth] = useState(isoToday().slice(0, 7))
  const [filterWorker, setFilterWorker] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [workerRows, absenceRows] = await Promise.all([
        getWorkers(), getAbsences(),
      ])
      setWorkers(workerRows); setAbsences(absenceRows)
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se han podido cargar las ausencias.' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const visibleAbsences = useMemo(() => absences.filter((item) => {
    const matchesWorker = !filterWorker || item.worker_id === filterWorker
    const matchesType = !filterType || item.absence_type === filterType
    const matchesFrom = !filterFrom || item.ends_on >= filterFrom
    const matchesTo = !filterTo || item.starts_on <= filterTo
    return matchesWorker && matchesType && matchesFrom && matchesTo
  }), [absences, filterWorker, filterType, filterFrom, filterTo])

  const calendarDays = useMemo(() => {
    const [year, monthNum] = month.split('-').map(Number)
    const firstWeekday = (new Date(year, monthNum - 1, 1).getDay() + 6) % 7
    const count = new Date(year, monthNum, 0).getDate()
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]
  }, [month])
  const monthTitle = useMemo(() => new Date(`${month}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }), [month])
  const calendarYear = Number(month.slice(0, 4))
  const calendarMonth = Number(month.slice(5, 7))
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = new Set([currentYear - 10, currentYear + 5])
    for (let year = currentYear - 10; year <= currentYear + 5; year += 1) years.add(year)
    years.add(calendarYear)
    return [...years].sort((a, b) => b - a)
  }, [calendarYear])

  function changeMonth(delta) {
    const [year, monthNum] = month.split('-').map(Number)
    const date = new Date(year, monthNum - 1 + delta, 1)
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  function updateForm(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function startEdit(item) {
    setForm({ id: item.id, worker_id: item.worker_id, absence_type: item.absence_type, starts_on: item.starts_on, ends_on: item.ends_on, admin_note: item.admin_note || '' })
    setEditing(true); setNotice(null); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelEdit() { setForm(blankForm()); setEditing(false) }

  async function submit(event) {
    event.preventDefault(); setNotice(null)
    if (!form.worker_id) return setNotice({ type: 'danger', text: 'Busca y selecciona un trabajador de la lista.' })
    if (form.ends_on < form.starts_on) return setNotice({ type: 'danger', text: 'La fecha de fin no puede ser anterior a la fecha de inicio.' })
    setSaving(true)
    try {
      await saveAbsence(form)
      const [rows] = await Promise.all([getAbsences()])
      setAbsences(rows); cancelEdit()
      setNotice({ type: 'success', text: 'Ausencia guardada correctamente.' })
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido guardar la ausencia.' }) }
    finally { setSaving(false) }
  }

  async function remove(item) {
    if (!window.confirm(`¿Eliminar la ausencia de ${item.profiles?.display_name || 'este trabajador'} (${labelType(item.absence_type)})?`)) return
    setNotice(null)
    try { await deleteAbsence(item.id); setAbsences((current) => current.filter((row) => row.id !== item.id)); setNotice({ type: 'success', text: 'Ausencia eliminada.' }) }
    catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido eliminar la ausencia.' }) }
  }

  function absencesForDay(day) {
    const [year, monthNum] = month.split('-').map(Number)
    const key = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return absences.filter((item) => item.starts_on <= key && item.ends_on >= key)
  }

  return <>
    <div className="mb-4"><h1 className="h2 fw-bold mb-1">Ausencias</h1><p className="text-secondary mb-0">Gestión administrativa de vacaciones y bajas laborales. Esta sección solo está disponible para administradores; no se registran diagnósticos médicos.</p></div>
    {notice && <div className={`alert alert-${notice.type}`} role="alert">{notice.text}</div>}

    <div className="card border-0 shadow-sm mb-4"><div className="card-body p-3 p-md-4"><h2 className="h5 mb-3">{editing ? 'Editar ausencia' : 'Registrar ausencia'}</h2><form className="row g-3" onSubmit={submit}>
      <div className="col-12 col-md-6"><WorkerPicker workers={workers} value={form.worker_id} onChange={(worker_id) => setForm((current) => ({ ...current, worker_id }))} /></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="absence-type">Tipo de ausencia</label><select id="absence-type" className="form-select" name="absence_type" value={form.absence_type} onChange={updateForm} required><option value="vacation">Vacaciones</option><option value="sick_leave">Baja laboral</option></select></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="absence-start">Fecha de inicio</label><input id="absence-start" className="form-control" type="date" name="starts_on" value={form.starts_on} onChange={updateForm} required /></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="absence-end">Fecha de fin</label><input id="absence-end" className="form-control" type="date" name="ends_on" value={form.ends_on} min={form.starts_on} onChange={updateForm} required /></div>
      <div className="col-12"><label className="form-label" htmlFor="absence-note">Nota administrativa (opcional)</label><textarea id="absence-note" className="form-control" name="admin_note" rows="2" maxLength={500} value={form.admin_note} onChange={updateForm} placeholder="Sin diagnósticos ni información médica detallada." /></div>
      <div className="col-12 d-flex gap-2"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar ausencia'}</button>{editing && <button type="button" className="btn btn-outline-secondary" onClick={cancelEdit}>Cancelar edición</button>}</div>
    </form></div></div>

    <div className="card border-0 shadow-sm mb-4"><div className="card-body p-3 p-md-4"><div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h2 className="h5 mb-0 text-capitalize">Calendario mensual</h2><div className="text-secondary small text-capitalize">{monthTitle}</div></div><div className="d-flex flex-wrap align-items-center gap-2"><div className="d-flex align-items-center gap-2"><label className="visually-hidden" htmlFor="calendar-month">Mes</label><select id="calendar-month" className="form-select form-select-sm" value={String(calendarMonth).padStart(2, '0')} onChange={(event) => setMonth(`${calendarYear}-${event.target.value}`)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1).padStart(2, '0')}>{new Date(2020, index, 1).toLocaleDateString('es-ES', { month: 'long' })}</option>)}</select><label className="visually-hidden" htmlFor="calendar-year">Año</label><select id="calendar-year" className="form-select form-select-sm" value={calendarYear} onChange={(event) => setMonth(`${event.target.value}-${String(calendarMonth).padStart(2, '0')}`)}>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></div><div className="btn-group" role="group" aria-label="Cambiar mes"><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => changeMonth(-1)} aria-label="Mes anterior">‹</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setMonth(isoToday().slice(0, 7))}>Hoy</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => changeMonth(1)} aria-label="Mes siguiente">›</button></div></div></div>
      <div className="absence-calendar"><div className="absence-calendar-grid absence-calendar-head">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <div key={day}>{day}</div>)}</div><div className="absence-calendar-grid">{calendarDays.map((day, index) => <div className={`absence-calendar-day ${day ? '' : 'absence-calendar-empty'}`} key={`${month}-${index}`}>{day && <><div className="fw-semibold small mb-1">{day}</div>{absencesForDay(day).slice(0, 3).map((item) => <div key={item.id} className={`absence-calendar-event ${item.absence_type === 'sick_leave' ? 'absence-sick' : 'absence-vacation'}`} title={`${item.profiles?.display_name || 'Trabajador'} · ${labelType(item.absence_type)}`}>{item.profiles?.display_name || 'Trabajador'}</div>)}{absencesForDay(day).length > 3 && <div className="small text-secondary">+{absencesForDay(day).length - 3} más</div>}</>}</div>)}</div>
      <div className="d-flex flex-wrap gap-3 small mt-3"><span><span className="absence-legend-dot absence-vacation" /> Vacaciones</span><span><span className="absence-legend-dot absence-sick" /> Baja laboral</span></div>
    </div></div></div>

    <div className="card border-0 shadow-sm"><div className="card-body p-3 p-md-4"><div className="d-flex flex-column flex-md-row justify-content-between gap-2 mb-3"><div><h2 className="h5 mb-1">Listado de ausencias</h2><p className="small text-secondary mb-0">Consulta el historial completo y filtra por trabajador, tipo o intervalo de fechas.</p></div><button className="btn btn-sm btn-outline-secondary align-self-md-start" onClick={() => { setFilterWorker(''); setFilterType(''); setFilterFrom(''); setFilterTo('') }}>Limpiar filtros</button></div>
      <div className="row g-2 mb-3"><div className="col-12 col-md-3"><label className="form-label small" htmlFor="filter-worker">Trabajador</label><select id="filter-worker" className="form-select" value={filterWorker} onChange={(event) => setFilterWorker(event.target.value)}><option value="">Todos</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name}</option>)}</select></div><div className="col-12 col-md-3"><label className="form-label small" htmlFor="filter-type">Tipo</label><select id="filter-type" className="form-select" value={filterType} onChange={(event) => setFilterType(event.target.value)}><option value="">Todos</option><option value="vacation">Vacaciones</option><option value="sick_leave">Baja laboral</option></select></div><div className="col-6 col-md-3"><label className="form-label small" htmlFor="filter-from">Desde</label><input id="filter-from" className="form-control" type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} /></div><div className="col-6 col-md-3"><label className="form-label small" htmlFor="filter-to">Hasta</label><input id="filter-to" className="form-control" type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} /></div></div>
      {loading ? <p className="text-secondary mb-0">Cargando ausencias…</p> : visibleAbsences.length === 0 ? <div className="text-center py-4 text-secondary">No hay ausencias que coincidan con los filtros.</div> : <div className="table-responsive"><table className="table align-middle mb-0"><thead><tr><th>Trabajador</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Nota administrativa</th><th className="text-end">Acciones</th></tr></thead><tbody>{visibleAbsences.map((item) => <tr key={item.id}><td className="fw-semibold">{item.profiles?.display_name || 'Trabajador'}</td><td><span className={`badge ${item.absence_type === 'sick_leave' ? 'text-bg-warning' : 'text-bg-info'}`}>{labelType(item.absence_type)}</span></td><td>{dateLabel(item.starts_on)}</td><td>{dateLabel(item.ends_on)}</td><td className="text-secondary small">{item.admin_note || '—'}</td><td><div className="d-flex justify-content-end gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(item)}>Editar</button><button className="btn btn-sm btn-outline-danger" onClick={() => remove(item)}>Eliminar</button></div></td></tr>)}</tbody></table></div>}
      <div className="small text-secondary mt-3">{visibleAbsences.length} ausencias mostradas.</div>
    </div></div>
  </>
}
