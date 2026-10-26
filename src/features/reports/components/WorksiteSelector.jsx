import { useEffect, useId, useMemo, useRef, useState } from 'react'

/** Selector de obra con búsqueda; solo permite elegir obras existentes. */
export default function WorksiteSelector({ worksites, value, onChange, disabled = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const generatedId = useId().replace(/:/g, '')
  const inputId = `worksite-search-${generatedId}`
  const resultsId = `worksite-results-${generatedId}`

  const selected = worksites.find((worksite) => worksite.id === value) ?? null

  useEffect(() => {
    if (!open) setQuery(selected?.name ?? '')
  }, [selected?.id, selected?.name, open])

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const filteredWorksites = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es')
    const matches = !search
      ? worksites
      : worksites.filter((worksite) => `${worksite.name} ${worksite.address ?? ''}`.toLocaleLowerCase('es').includes(search))
    return matches.slice(0, 30)
  }, [worksites, query])

  function handleChange(event) {
    setQuery(event.target.value)
    setOpen(true)
    if (value) onChange('')
  }

  function chooseWorksite(worksite) {
    onChange(worksite.id)
    setQuery(worksite.name)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="position-relative">
      <label htmlFor={inputId} className="form-label">Obra *</label>
      <input
        id={inputId}
        type="search"
        className="form-control"
        value={open ? query : (selected?.name ?? query)}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={handleChange}
        placeholder="Busca y selecciona una obra existente..."
        autoComplete="off"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={resultsId}
        aria-autocomplete="list"
        required={!value}
      />
      {open && !disabled && (
        <div id={resultsId} className="list-group position-absolute start-0 end-0 mt-1 shadow bg-white" style={{ zIndex: 1050, maxHeight: '16rem', overflowY: 'auto' }} role="listbox">
          {filteredWorksites.length === 0 ? (
            <div className="list-group-item small text-secondary">
              {worksites.length === 0
                ? 'No hay obras activas disponibles. Pide al administrador que cree o active una obra.'
                : 'No se han encontrado obras. Prueba con otro nombre o dirección.'}
            </div>
          ) : (
            <>
              {!query.trim() && <div className="list-group-item small text-secondary">Selecciona una obra de la lista o escribe para buscar.</div>}
              {filteredWorksites.map((worksite) => (
                <button
                  key={worksite.id}
                  type="button"
                  className={`list-group-item list-group-item-action ${value === worksite.id ? 'active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseWorksite(worksite)}
                  role="option"
                  aria-selected={value === worksite.id}
                >
                  <span className="d-block fw-semibold">{worksite.name}</span>
                  {worksite.address && <span className="d-block small opacity-75">{worksite.address}</span>}
                </button>
              ))}
              {filteredWorksites.length === 30 && <div className="list-group-item small text-secondary">Se muestran los primeros 30 resultados. Afina la búsqueda.</div>}
            </>
          )}
        </div>
      )}
      {selected && !open && <div className="form-text">Obra seleccionada. Pulsa para cambiarla.</div>}
    </div>
  )
}
