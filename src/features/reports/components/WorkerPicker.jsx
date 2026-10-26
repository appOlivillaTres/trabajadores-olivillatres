import { useId, useMemo, useState } from 'react'

/** La lista de compañeros solo aparece cuando se pulsa «Añadir compañero». */
export default function WorkerPicker({ workers, selectedIds, onAdd, disabled = false }) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const generatedId = useId().replace(/:/g, '')
  const inputId = `worker-search-${generatedId}`
  const resultsId = `worker-results-${generatedId}`

  const candidates = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es')
    if (!search) return []
    return workers
      .filter((worker) => !selectedIds.includes(worker.id))
      .filter((worker) => `${worker.display_name} ${worker.username ?? ''}`.toLocaleLowerCase('es').includes(search))
      .slice(0, 10)
  }, [workers, selectedIds, query])

  function addWorker(worker) {
    onAdd(worker)
    setQuery('')
    setExpanded(false)
  }

  return (
    <div className="mt-2">
      {!expanded ? (
        <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setExpanded(true)} disabled={disabled}>
          <span aria-hidden="true" className="me-1">+</span> Añadir compañero
        </button>
      ) : (
        <div className="border rounded-3 p-3 bg-light">
          <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
            <label htmlFor={inputId} className="form-label fw-semibold mb-0">Buscar compañero</label>
            <button type="button" className="btn btn-sm btn-link text-secondary" onClick={() => { setExpanded(false); setQuery('') }}>Cancelar</button>
          </div>
          <input
            id={inputId}
            type="search"
            className="form-control"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Escribe un nombre o usuario..."
            autoComplete="off"
            autoFocus
            aria-controls={resultsId}
            aria-expanded={Boolean(query.trim())}
          />
          <div id={resultsId} className="list-group mt-2" style={{ maxHeight: '13rem', overflowY: 'auto' }}>
            {!query.trim() ? (
              <div className="list-group-item small text-secondary">Escribe para buscar entre los trabajadores activos.</div>
            ) : candidates.length === 0 ? (
              <div className="list-group-item small text-secondary">No hay trabajadores coincidentes disponibles para añadir.</div>
            ) : candidates.map((worker) => (
              <button key={worker.id} type="button" className="list-group-item list-group-item-action" onClick={() => addWorker(worker)}>
                <span className="d-block fw-semibold">{worker.display_name}</span>
                {worker.username && <span className="d-block small text-secondary">@{worker.username}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
