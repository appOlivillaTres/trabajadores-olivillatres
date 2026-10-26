import { useMemo, useState } from 'react'

function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

export default function ReportDateFilters({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onSubmit,
  loading = false,
  workers = [],
  workerId = '',
  onWorkerChange,
  showWorkerFilter = false,
  hasIncidentOnly = false,
  onHasIncidentOnlyChange,
  searchText = '',
  onSearchTextChange,
}) {
  const [workerSearch, setWorkerSearch] = useState('')
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false)
  const filteredWorkers = useMemo(() => {
    const needle = normalizeForSearch(workerSearch)
    if (!needle) return workers

    return workers.filter((worker) => normalizeForSearch(
      `${worker.display_name ?? ''} ${worker.username ?? ''}`,
    ).includes(needle))
  }, [workerSearch, workers])

  const selectedWorker = workers.find((worker) => worker.id === workerId)
  const visibleWorkers = !workerSearch.trim() && selectedWorker && !filteredWorkers.some((worker) => worker.id === selectedWorker.id)
    ? [selectedWorker, ...filteredWorkers]
    : filteredWorkers

  return (
    <form className="card card-body mb-4" onSubmit={onSubmit}>
      <div className="row g-3 align-items-start">
        <div className="col-12 col-sm-6 col-lg-3">
          <label htmlFor="report-from-date" className="form-label">Desde</label>
          <input
            id="report-from-date"
            type="date"
            className="form-control"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => onFromDateChange(event.target.value)}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <label htmlFor="report-to-date" className="form-label">Hasta</label>
          <input
            id="report-to-date"
            type="date"
            className="form-control"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => onToDateChange(event.target.value)}
          />
        </div>

        {showWorkerFilter && (
          <div
            className="col-12 col-lg-6 position-relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setWorkerDropdownOpen(false)
            }}
          >
            <label htmlFor="report-worker-search" className="form-label">Trabajador</label>
            <input
              id="report-worker-search"
              type="search"
              className="form-control"
              value={workerSearch}
              onFocus={() => setWorkerDropdownOpen(true)}
              onChange={(event) => {
                setWorkerSearch(event.target.value)
                setWorkerDropdownOpen(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setWorkerDropdownOpen(false)
                  setWorkerSearch('')
                }
              }}
              placeholder={selectedWorker ? `${selectedWorker.display_name} · Cambiar trabajador…` : "Todos los trabajadores · Buscar por nombre o usuario…"}
              autoComplete="off"
              aria-controls="report-worker-options"
              aria-expanded={workerDropdownOpen}
            />
            {workerDropdownOpen && (
              <div id="report-worker-options" className="list-group position-absolute start-0 end-0 shadow-sm" style={{ zIndex: 1050, top: '100%', maxHeight: '240px', overflowY: 'auto' }}>
                <button type="button" className={`list-group-item list-group-item-action ${!workerId ? 'active' : ''}`} onClick={() => { onWorkerChange(''); setWorkerSearch(''); setWorkerDropdownOpen(false) }}>Todos los trabajadores</button>
                {visibleWorkers.map((worker) => (
                  <button type="button" key={worker.id} className={`list-group-item list-group-item-action ${workerId === worker.id ? 'active' : ''}`} onClick={() => { onWorkerChange(worker.id); setWorkerSearch(''); setWorkerDropdownOpen(false) }}>
                    {worker.display_name}{worker.active ? '' : ' (inactivo)'}{worker.username ? ` · ${worker.username}` : ''}
                  </button>
                ))}
                {filteredWorkers.length === 0 && <div className="list-group-item text-secondary">No hay trabajadores coincidentes.</div>}
              </div>
            )}
          </div>
        )}

        <div className="col-12 col-lg-6">
          <label htmlFor="report-text-filter" className="form-label">Texto</label>
          <input
            id="report-text-filter"
            type="search"
            className="form-control"
            value={searchText}
            onChange={(event) => onSearchTextChange?.(event.target.value)}
            placeholder="Obra, trabajo, observaciones…"
            autoComplete="off"
          />
          <div className="form-text">Busca en la obra, la actividad, las observaciones y los detalles de incidencias.</div>
        </div>

        <div className="col-12 col-sm-7 col-lg-8 d-flex align-items-end">
          <div className="form-check mb-1">
            <input
              id="report-incidents-filter"
              type="checkbox"
              className="form-check-input"
              checked={hasIncidentOnly}
              onChange={(event) => onHasIncidentOnlyChange?.(event.target.checked)}
            />
            <label htmlFor="report-incidents-filter" className="form-check-label">Solo partes con incidencias</label>
          </div>
        </div>

        <div className="col-12 col-sm-5 col-lg-4 d-grid">
          <button type="submit" className="btn btn-success" disabled={loading}>
            {loading ? 'Buscando…' : 'Aplicar filtros'}
          </button>
        </div>
      </div>
    </form>
  )
}
