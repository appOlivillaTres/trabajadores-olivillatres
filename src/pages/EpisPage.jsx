import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { supabase } from '../lib/supabase'
import logoOlivilla from '../assets-olivilla-logo.jpg'

const SIZES = ['3XL', 'XXL', 'XL', 'L', 'M', 'S']
const PPE = ['Casco de protección', 'Calzado de seguridad', 'Gafas de protección contra impactos', 'Mascarilla FFP2 / FFP3', 'Protectores auditivos', 'Guantes de protección', 'Arnés anticaídas']
const dateToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

function WorkerSelector({ workers, value, onChange, disabled }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const inputId = `epis-worker-${useId().replace(/:/g, '')}`
  const selected = workers.find(worker => worker.id === value) || null
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('es')
    const list = search
      ? workers.filter(worker => `${worker.first_name} ${worker.last_name} ${worker.dni}`.toLocaleLowerCase('es').includes(search))
      : workers
    return list.slice(0, 30)
  }, [workers, query])

  useEffect(() => {
    if (!open) setQuery(selected ? `${selected.last_name}, ${selected.first_name} · ${selected.dni}` : '')
  }, [open, selected?.id, selected?.first_name, selected?.last_name, selected?.dni])
  useEffect(() => {
    function handleOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  return <div ref={rootRef} className="position-relative">
    <label className="form-label" htmlFor={inputId}>Buscar trabajador por nombre o DNI *</label>
    <input id={inputId} type="search" className="form-control" value={open ? query : (selected ? `${selected.last_name}, ${selected.first_name} · ${selected.dni}` : query)}
      onFocus={() => { setQuery(''); setOpen(true) }} onChange={event => { setQuery(event.target.value); setOpen(true); if (value) onChange('') }}
      placeholder="Busca y selecciona una ficha laboral…" autoComplete="off" disabled={disabled} aria-expanded={open} aria-autocomplete="list" required={!value} />
    {open && !disabled && <div className="list-group position-absolute start-0 end-0 mt-1 shadow bg-white" style={{ zIndex: 1050, maxHeight: '16rem', overflowY: 'auto' }} role="listbox">
      {!filtered.length ? <div className="list-group-item small text-secondary">No se han encontrado trabajadores. Prueba con otro nombre o DNI.</div> : <>
        {!query.trim() && <div className="list-group-item small text-secondary">Selecciona una ficha o escribe para buscar.</div>}
        {filtered.map(worker => <button key={worker.id} type="button" className={`list-group-item list-group-item-action ${worker.id === value ? 'active' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(worker.id); setQuery(`${worker.last_name}, ${worker.first_name} · ${worker.dni}`); setOpen(false) }} role="option" aria-selected={worker.id === value}>
          <span className="d-block fw-semibold">{worker.last_name}, {worker.first_name}</span><span className="d-block small opacity-75">DNI/NIE: {worker.dni}</span>
        </button>)}
        {filtered.length === 30 && <div className="list-group-item small text-secondary">Se muestran los primeros 30 resultados. Afina la búsqueda.</div>}
      </>}
    </div>}
    {selected && !open && <div className="form-text">Ficha laboral seleccionada. Pulsa para cambiarla.</div>}
  </div>
}

export default function EpisPage() {
  const [workers, setWorkers] = useState([])
  const [clothing, setClothing] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [workerId, setWorkerId] = useState('')
  const [selectedPpe, setSelectedPpe] = useState([])
  const [customPpe, setCustomPpe] = useState('')
  const [clothingLines, setClothingLines] = useState([])
  const [initialMode, setInitialMode] = useState(false)
  const [initialLines, setInitialLines] = useState([])
  const [date, setDate] = useState(dateToday())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [historyWorkerQuery, setHistoryWorkerQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: people, error: workerError }, { data: clothes, error: clothingError }, { data: logs, error: deliveryError }] = await Promise.all([
      supabase.from('worker_records').select('id,first_name,last_name,dni,termination_date').is('termination_date', null).order('last_name').order('first_name'),
      supabase.from('clothing_items').select('id,name,stock').eq('active', true).order('name'),
      supabase.from('epis_deliveries').select('id,worker_name,worker_dni,delivery_date,document_type,reason,created_at,epis_delivery_lines(id,line_type,item_name,size,quantity,is_initial)').order('created_at', { ascending: false }).limit(100),
    ])
    if (workerError || clothingError || deliveryError) setNotice(`No se pudieron cargar los datos. ${workerError?.message || clothingError?.message || deliveryError?.message || ''}`)
    setWorkers(people || []); setClothing(clothes || []); setDeliveries(logs || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const selectedWorker = workers.find(worker => worker.id === workerId)
  const historyWorkers = useMemo(() => { const q = historyWorkerQuery.trim().toLocaleLowerCase('es'); return workers.filter(worker => !q || `${worker.first_name} ${worker.last_name} ${worker.dni}`.toLocaleLowerCase('es').includes(q)) }, [workers, historyWorkerQuery])
  const filteredDeliveries = useMemo(() => { const q = historyWorkerQuery.trim().toLocaleLowerCase('es'); return deliveries.filter(delivery => !q || `${delivery.worker_name} ${delivery.worker_dni}`.toLocaleLowerCase('es').includes(q)) }, [deliveries, historyWorkerQuery])
  const lines = useMemo(() => [
    ...selectedPpe.map(name => ({ line_key: `epi:${name}`, line_type: 'epi', item_name: name, size: null, quantity: 1, is_initial: initialMode && initialLines.includes(`epi:${name}`) })),
    ...clothingLines.filter(line => line.item_id && Number(line.quantity) > 0).map(line => ({ line_key: `ropa:${line.key}`, line_type: 'ropa', item_id: line.item_id, item_name: clothing.find(item => item.id === line.item_id)?.name || '', size: line.size, quantity: Number(line.quantity), is_initial: initialMode && initialLines.includes(`ropa:${line.key}`) })),
  ], [selectedPpe, clothingLines, clothing, initialMode, initialLines])

  function addClothingLine() { setClothingLines(current => [...current, { key: crypto.randomUUID(), item_id: clothing[0]?.id || '', size: 'M', quantity: '1' }]) }
  function changeClothing(key, patch) { setClothingLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)) }
  function addCustomPpe() {
    const name = customPpe.trim()
    if (!name) return
    if (!selectedPpe.some(item => item.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) setSelectedPpe(current => [...current, name])
    setCustomPpe('')
  }
  function toggleInitialLine(lineKey, checked) { setInitialLines(current => checked ? [...new Set([...current, lineKey])] : current.filter(key => key !== lineKey)) }

  function printDocument(blank = false) {
    if (!selectedWorker) { setNotice('Selecciona una ficha de trabajador para generar el documento.'); return }
    if (!blank && !lines.length) { setNotice('Selecciona al menos un EPI o una prenda.'); return }
    const workerName = `${selectedWorker.first_name} ${selectedWorker.last_name}`
    const rows = blank
      ? [...PPE, 'Otros: __________________________________________'].map(name => `<tr><td style="height:28px">☐ ${escapeHtml(name)}</td><td></td><td></td><td></td></tr>`).join('')
      : lines.map(line => `<tr><td>${escapeHtml(line.item_name)}</td><td>${escapeHtml(line.size || '—')}</td><td>${line.quantity}</td><td>${line.is_initial ? 'Entrega inicial' : 'Reposición'} · ${escapeHtml(date)}</td></tr>`).join('')
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Registro de entrega EPI y ropa</title><style>body{font:12px Arial,sans-serif;color:#111;margin:24px}.brand{display:flex;justify-content:center;margin-bottom:16px}.brand img{width:280px;max-width:70%;height:auto;object-fit:contain}h1{text-align:center;font-size:19px;margin:10px 0 14px}p{line-height:1.45}.meta{display:flex;gap:32px;margin:24px 0}.meta div{flex:1;border-bottom:1px solid #888;padding-bottom:8px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #777;padding:8px;text-align:left}th{background:#eee}.sign{display:flex;gap:40px;margin-top:48px;page-break-inside:avoid}.sign div{flex:1;padding-top:0;min-height:100px;line-height:1.5}.sign-space{height:58px}.legal{margin-top:22px;font-size:10px}@media print{body{margin:12mm}}</style></head><body><div class="brand"><img src="${logoOlivilla}" alt="Olivilla Tres"></div><h1>REGISTRO DE ENTREGA DE EQUIPOS DE PROTECCIÓN INDIVIDUAL (EPI) Y ROPA DE TRABAJO</h1><p>En cumplimiento del Artículo 17 de la Ley 31/1995 de Prevención de Riesgos Laborales y del Real Decreto 773/1997 sobre la utilización de equipos de protección individual.</p><div class="meta"><div><b>Trabajador:</b><br>${escapeHtml(workerName)}</div><div><b>DNI / NIE:</b><br>${escapeHtml(selectedWorker.dni)}</div><div><b>Fecha:</b><br>${blank ? '________________' : escapeHtml(date)}</div></div><p>El trabajador abajo firmante declara haber recibido por parte de la empresa, de forma gratuita, los equipos de protección individual y/o ropa de trabajo que se relacionan a continuación, en correcto estado de utilización. Mediante su firma se compromete a utilizarlos y cuidarlos correctamente, informar de daños o defectos y solicitar su sustitución cuando corresponda.</p><table><thead><tr><th>Equipo / artículo</th><th>Talla</th><th>Cantidad</th><th>Motivo / fecha</th></tr></thead><tbody>${rows}</tbody></table><p>La firma acredita la recepción del material indicado y la información básica sobre su utilización y cuidado.</p><div class="sign"><div>Entregado por la empresa<div class="sign-space"></div>Firma:</div><div>Recibido por el trabajador<div class="sign-space"></div>Firma:</div></div><p class="legal">Los datos personales de este documento se utilizarán para gestionar y acreditar la entrega de equipos y ropa de trabajo, conforme a la normativa de protección de datos aplicable.</p><script>window.onload=()=>window.print()</script></body></html>`
    const win = window.open('', '_blank')
    if (!win) { setNotice('El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes para este sitio.'); return }
    win.document.write(html); win.document.close()
  }

  async function saveDelivery(event) {
    event.preventDefault(); setNotice('')
    if (!selectedWorker) return setNotice('Selecciona una ficha de trabajador.')
    if (!lines.length) return setNotice('Añade al menos un EPI o una prenda.')
    for (const line of lines.filter(item => item.line_type === 'ropa')) {
      const item = clothing.find(entry => entry.id === line.item_id)
      if (!Number.isInteger(line.quantity) || line.quantity < 1) return setNotice('Las cantidades deben ser números enteros mayores que cero.')
      if (Number(item?.stock?.[line.size] || 0) < line.quantity) return setNotice(`No hay stock suficiente de ${item?.name || 'la prenda'} talla ${line.size}.`)
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('epis_ropa_save_delivery', { p_worker_record_id: workerId, p_delivery_date: date, p_reason: 'replacement', p_lines: lines.map(({ line_key, ...line }) => line) })
      if (error) throw error
      setNotice('Justificante guardado y entrega registrada. El stock de ropa se ha actualizado.')
      setSelectedPpe([]); setClothingLines([]); setInitialMode(false); setInitialLines([]); await load()
    } catch (error) { setNotice(error.message || 'No se pudo guardar la entrega.') }
    finally { setSaving(false) }
  }

  return <><div className="mb-4"><h1 className="h2 fw-bold mb-1">EPIS · Entregas</h1><p className="text-secondary mb-0">Selecciona una ficha laboral, prepara el justificante y guarda la entrega para descontar la ropa del inventario.</p></div>
    {notice && <div className="alert alert-info" role="status">{notice}</div>}
    <section className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5">Nueva entrega</h2><form onSubmit={saveDelivery} className="row g-3">
      <div className="col-12 col-lg-6"><WorkerSelector workers={workers} value={workerId} onChange={setWorkerId} disabled={loading || saving} /></div>
      <div className="col-6 col-lg-3"><label className="form-label" htmlFor="delivery-date">Fecha de entrega</label><input id="delivery-date" className="form-control" type="date" value={date} onChange={event => setDate(event.target.value)} required /></div>
      <div className="col-6 col-lg-3"><label className="form-label" htmlFor="delivery-reason">Tipo predeterminado</label><input id="delivery-reason" className="form-control" value="Reposición" readOnly /><div className="form-text">Puedes marcar artículos como entrega inicial abajo.</div></div>
      <div className="col-12"><h3 className="h6">Equipos de protección individual</h3><div className="row g-2">{PPE.map(name => <div className="col-12 col-md-6 col-xl-4" key={name}><label className="form-check"><input className="form-check-input" type="checkbox" checked={selectedPpe.includes(name)} onChange={event => setSelectedPpe(current => event.target.checked ? [...current, name] : current.filter(item => item !== name))} /><span className="form-check-label">{name}</span></label></div>)}</div>
        {selectedPpe.some(name => !PPE.includes(name)) && <div className="mt-3"><div className="small fw-semibold mb-2">Otros EPIs añadidos</div><div className="d-flex flex-wrap gap-2">{selectedPpe.filter(name => !PPE.includes(name)).map(name => <span key={name} className="badge text-bg-light border d-inline-flex align-items-center gap-2 py-2 px-3">{name}<button type="button" className="btn-close" style={{ fontSize: '.65rem' }} aria-label={`Quitar ${name}`} onClick={() => setSelectedPpe(current => current.filter(item => item !== name))} /></span>)}</div></div>}
        <div className="row g-2 mt-2"><div className="col-12 col-md-8"><label className="form-label" htmlFor="custom-ppe">Añadir otro EPI</label><input id="custom-ppe" className="form-control" maxLength={150} value={customPpe} onChange={event => setCustomPpe(event.target.value)} placeholder="Escribe el nombre del equipo" /></div><div className="col-12 col-md-4 d-flex align-items-end"><button type="button" className="btn btn-outline-secondary" onClick={addCustomPpe} disabled={!customPpe.trim()}>Añadir EPI</button></div></div>
      </div>
      <div className="col-12"><div className="d-flex align-items-center justify-content-between gap-2 flex-wrap"><h3 className="h6 mb-0">Ropa de trabajo</h3><button type="button" className="btn btn-sm btn-outline-success" onClick={addClothingLine} disabled={!clothing.length}>+ Añadir prenda</button></div>{!clothing.length && <p className="small text-secondary mt-2">No hay prendas activas en el inventario de ROPA.</p>}{clothingLines.map(line => <div className="row g-2 mt-1 align-items-end" key={line.key}><div className="col-12 col-md-5"><label className="form-label">Artículo</label><select className="form-select" value={line.item_id} onChange={event => changeClothing(line.key, { item_id: event.target.value })}>{clothing.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="col-5 col-md-2"><label className="form-label">Talla</label><select className="form-select" value={line.size} onChange={event => changeClothing(line.key, { size: event.target.value })}>{SIZES.map(size => <option key={size}>{size}</option>)}</select></div><div className="col-5 col-md-2"><label className="form-label">Cantidad</label><input className="form-control" type="number" min="1" step="1" value={line.quantity} onChange={event => changeClothing(line.key, { quantity: event.target.value })} /></div><div className="col-2 col-md-2"><button type="button" className="btn btn-outline-danger" onClick={() => { setClothingLines(current => current.filter(item => item.key !== line.key)); setInitialLines(current => current.filter(key => key !== `ropa:${line.key}`)) }} aria-label="Eliminar prenda">×</button></div><div className="col-12 small text-secondary">Stock disponible: {clothing.find(item => item.id === line.item_id)?.stock?.[line.size] ?? 0}</div></div>)}</div>
      <div className="col-12 form-check form-switch ms-1"><input id="initial-mode" className="form-check-input" type="checkbox" role="switch" checked={initialMode} onChange={event => { setInitialMode(event.target.checked); if (!event.target.checked) setInitialLines([]) }} /><label className="form-check-label fw-semibold" htmlFor="initial-mode">¿Algún artículo es entrega inicial?</label></div>
      {initialMode && <div className="col-12 border rounded p-3"><p className="small text-secondary">Marca únicamente los artículos que sean entrega inicial. Los demás se guardarán como reposición.</p>{lines.length ? <div className="row g-2">{lines.map(line => <div className="col-12 col-md-6" key={line.line_key}><label className="form-check"><input className="form-check-input" type="checkbox" checked={initialLines.includes(line.line_key)} onChange={event => toggleInitialLine(line.line_key, event.target.checked)} /><span className="form-check-label">{line.item_name}{line.size ? ` · ${line.size}` : ''}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</span></label></div>)}</div> : <p className="mb-0 small">Selecciona primero los artículos que vas a entregar.</p>}</div>}
      <div className="col-12 d-flex flex-wrap gap-2"><button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar justificante y descontar stock'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => printDocument(false)}>Imprimir justificante preparado</button><button type="button" className="btn btn-outline-secondary" onClick={() => printDocument(true)}>Imprimir PDF en blanco</button></div>
      <div className="col-12 small text-secondary">La impresión no guarda ni descuenta stock. El descuento se realiza al guardar el justificante.</div>
    </form></div></section>
    <section className="mb-4">
      <button type="button" className="btn btn-outline-primary" onClick={() => { setShowHistory(value => !value); setHistoryWorkerQuery('') }} aria-expanded={showHistory}>{showHistory ? 'Cerrar historial de recepciones' : 'Consultar historial de recepciones'}</button>
      {showHistory && <div className="card border-0 shadow-sm mt-3"><div className="card-body p-3 p-md-4"><h2 className="h5 mb-3">Historial de recepciones por trabajador</h2><label className="form-label" htmlFor="epis-history-search">Buscar trabajador por nombre o DNI</label><input id="epis-history-search" className="form-control mb-3" type="search" value={historyWorkerQuery} onChange={event => setHistoryWorkerQuery(event.target.value)} placeholder="Escribe nombre, apellidos o DNI…" />
      {historyWorkerQuery.trim() && <div className="small text-secondary mb-2">{historyWorkers.length} trabajador(es) coinciden con la búsqueda.</div>}
      {loading ? <p>Cargando…</p> : !filteredDeliveries.length ? <p className="text-secondary mb-0">No hay recepciones que coincidan con la búsqueda.</p> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Fecha</th><th>Trabajador</th><th>DNI/NIE</th><th>Tipo</th><th>Material</th></tr></thead><tbody>{filteredDeliveries.map(delivery => <tr key={delivery.id}><td>{delivery.delivery_date}</td><td>{delivery.worker_name}</td><td>{delivery.worker_dni}</td><td>{delivery.document_type}</td><td>{(delivery.epis_delivery_lines || []).map(line => `${line.item_name}${line.size ? ` (${line.size})` : ''} × ${line.quantity}${line.is_initial ? ' · Inicial' : ' · Reposición'}`).join(', ')}</td></tr>)}</tbody></table></div>}</div></div>}
    </section>
  </>
}
