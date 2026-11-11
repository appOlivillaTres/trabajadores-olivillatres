import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { supabase } from '../lib/supabase'
import { readSessionDraft, writeSessionDraft, removeSessionDraft } from '../lib/sessionDrafts'
import { useAuth } from '../hooks/useAuth'
import logoOlivilla from '../assets-olivilla-logo.jpg'

const SIZES = ['3XL', 'XXL', 'XL', 'L', 'M', 'S']
const PPE = ['Casco de protección', 'Calzado de seguridad', 'Gafas de protección contra impactos', 'Mascarilla FFP2 / FFP3', 'Protectores auditivos', 'Guantes de protección', 'Arnés anticaídas']
const dateToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function isDocumentReload() {
  if (typeof window === 'undefined') return false
  return window.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload'
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
  const { profile } = useAuth()
  const draftKey = `epis-delivery-form-v1:${profile?.id || 'session'}`
  const [restoredDraft] = useState(() => isDocumentReload() ? readSessionDraft(draftKey) : null)
  const [workers, setWorkers] = useState([])
  const [clothing, setClothing] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [recentWorkerDeliveries, setRecentWorkerDeliveries] = useState([])
  const [recentDeliveriesLoading, setRecentDeliveriesLoading] = useState(false)
  const [workerId, setWorkerId] = useState(restoredDraft?.workerId || '')
  const [selectedPpe, setSelectedPpe] = useState(Array.isArray(restoredDraft?.selectedPpe) ? restoredDraft.selectedPpe : [])
  const [customPpe, setCustomPpe] = useState(restoredDraft?.customPpe || '')
  const [clothingLines, setClothingLines] = useState(Array.isArray(restoredDraft?.clothingLines) ? restoredDraft.clothingLines : [])
  const [initialMode, setInitialMode] = useState(Boolean(restoredDraft?.initialMode))
  const [initialLines, setInitialLines] = useState(Array.isArray(restoredDraft?.initialLines) ? restoredDraft.initialLines : [])
  const [date, setDate] = useState(restoredDraft?.date || dateToday())
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

  // El formulario de EPIs también conserva su estado real de React. Esto evita
  // depender de la restauración genérica de controles HTML.
  useEffect(() => {
    const hasDraftContent = Boolean(
      workerId || selectedPpe.length || customPpe.trim() || clothingLines.length ||
      initialMode || initialLines.length || date !== dateToday()
    )
    if (!hasDraftContent) {
      removeSessionDraft(draftKey)
      return
    }
    writeSessionDraft(draftKey, {
      workerId,
      selectedPpe,
      customPpe,
      clothingLines,
      initialMode,
      initialLines,
      date,
    })
  }, [draftKey, workerId, selectedPpe, customPpe, clothingLines, initialMode, initialLines, date])

  const selectedWorker = workers.find(worker => worker.id === workerId)

  // Consulta el historial completo de los últimos seis meses del trabajador seleccionado.
  useEffect(() => {
    let cancelled = false
    if (!workerId) {
      setRecentWorkerDeliveries([])
      setRecentDeliveriesLoading(false)
      return () => { cancelled = true }
    }

    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 6)
    const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

    async function loadRecentDeliveries() {
      setRecentDeliveriesLoading(true)
      setRecentWorkerDeliveries([])
      const { data, error } = await supabase
        .from('epis_deliveries')
        .select('id,delivery_date,epis_delivery_lines(item_name,line_type,size,quantity)')
        .eq('worker_record_id', workerId)
        .gte('delivery_date', cutoffDate)
        .order('delivery_date', { ascending: false })

      if (!cancelled) {
        if (error) {
          console.error('No se pudo consultar el historial reciente de EPIs:', error)
          setRecentWorkerDeliveries([])
        } else {
          setRecentWorkerDeliveries(data || [])
        }
        setRecentDeliveriesLoading(false)
      }
    }

    loadRecentDeliveries()
    return () => { cancelled = true }
  }, [workerId])

  const lines = useMemo(() => [
    ...selectedPpe.map(name => ({ line_key: `epi:${name}`, line_type: 'epi', item_name: name, size: null, quantity: 1, is_initial: initialMode && initialLines.includes(`epi:${name}`) })),
    ...clothingLines.filter(line => line.item_id && Number(line.quantity) > 0).map(line => ({ line_key: `ropa:${line.key}`, line_type: 'ropa', item_id: line.item_id, item_name: clothing.find(item => item.id === line.item_id)?.name || '', size: line.size, quantity: Number(line.quantity), is_initial: initialMode && initialLines.includes(`ropa:${line.key}`) })),
  ], [selectedPpe, clothingLines, clothing, initialMode, initialLines])

  const recentSelectedItems = useMemo(() => {
    if (!lines.length || !recentWorkerDeliveries.length) return []
    const selectedNames = new Set(lines.map(line => line.item_name.trim().toLocaleLowerCase('es')))
    const matches = []
    for (const delivery of recentWorkerDeliveries) {
      for (const item of delivery.epis_delivery_lines || []) {
        if (selectedNames.has(String(item.item_name || '').trim().toLocaleLowerCase('es'))) {
          matches.push({
            name: item.item_name,
            size: item.size,
            quantity: item.quantity,
            date: delivery.delivery_date,
          })
        }
      }
    }
    return matches
  }, [lines, recentWorkerDeliveries])

  const historyWorkers = useMemo(() => { const q = historyWorkerQuery.trim().toLocaleLowerCase('es'); return workers.filter(worker => !q || `${worker.first_name} ${worker.last_name} ${worker.dni}`.toLocaleLowerCase('es').includes(q)) }, [workers, historyWorkerQuery])
  const filteredDeliveries = useMemo(() => { const q = historyWorkerQuery.trim().toLocaleLowerCase('es'); return deliveries.filter(delivery => !q || `${delivery.worker_name} ${delivery.worker_dni}`.toLocaleLowerCase('es').includes(q)) }, [deliveries, historyWorkerQuery])


  function addClothingLine() { setClothingLines(current => [...current, { key: crypto.randomUUID(), item_id: clothing[0]?.id || '', size: 'M', quantity: '1' }]) }
  function changeClothing(key, patch) { setClothingLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)) }
  function addCustomPpe() {
    const name = customPpe.trim()
    if (!name) return
    if (!selectedPpe.some(item => item.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) setSelectedPpe(current => [...current, name])
    setCustomPpe('')
  }
  function toggleInitialLine(lineKey, checked) { setInitialLines(current => checked ? [...new Set([...current, lineKey])] : current.filter(key => key !== lineKey)) }

  function clearDeliveryForm() {
    const hasContent = Boolean(workerId || selectedPpe.length || customPpe.trim() || clothingLines.length || initialMode || initialLines.length)
    if (hasContent && !window.confirm('¿Quieres limpiar el formulario y descartar los datos que no has guardado?')) return
    setWorkerId('')
    setSelectedPpe([])
    setCustomPpe('')
    setClothingLines([])
    setInitialMode(false)
    setInitialLines([])
    setDate(dateToday())
    removeSessionDraft(draftKey)
    setNotice('')
  }

  function printDocument(blank = false) {
    if (!blank && !selectedWorker) { setNotice('Selecciona una ficha de trabajador para generar el documento.'); return }
    if (!blank && !lines.length) { setNotice('Selecciona al menos un EPI o una prenda.'); return }
    const workerName = !blank && selectedWorker ? `${selectedWorker.first_name} ${selectedWorker.last_name}` : '________________________________________'
    const rows = blank
      ? [...PPE, 'Otros: __________________________________________'].map(name => `<tr><td style="height:28px">☐ ${escapeHtml(name)}</td><td></td><td></td><td></td></tr>`).join('')
      : lines.map(line => `<tr><td>${escapeHtml(line.item_name)}</td><td>${escapeHtml(line.size || '—')}</td><td>${line.quantity}</td><td>${line.is_initial ? 'Entrega inicial' : 'Reposición'} · ${escapeHtml(date)}</td></tr>`).join('')
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibí de equipos de protección individual y ropa de trabajo</title><style>
      @page{size:A4;margin:12mm}
      *{box-sizing:border-box}
      body{font:12px Arial,Helvetica,sans-serif;color:#111;margin:0}
      .brand{display:flex;justify-content:center;margin-bottom:10px}
      .brand img{width:260px;max-width:68%;height:auto;object-fit:contain}
      h1{text-align:center;font-size:18px;line-height:1.2;margin:7px 0 5px;text-transform:uppercase}
      .section-title{text-align:center;font-size:12px;font-weight:700;letter-spacing:.5px;margin:0 0 12px}
      p{font-size:12px;line-height:1.35;margin:9px 0}
      .meta{display:flex;gap:24px;margin:16px 0}
      .meta div{flex:1;min-width:0;border-bottom:1px solid #888;padding-bottom:7px;line-height:1.35}
      table{border-collapse:collapse;width:100%;margin:13px 0}
      th,td{border:1px solid #777;padding:6px;text-align:left;font-size:11px;line-height:1.2}
      th{background:#eee;text-align:center}
      td:first-child{width:40%}
      .duties{margin:7px 0 8px;padding-left:22px}
      .duties li{font-size:11px;line-height:1.3;margin:5px 0}
      .sign{display:flex;gap:34px;margin-top:20px;page-break-inside:avoid;break-inside:avoid}
      .sign>div{flex:1;min-height:52px;line-height:1.35}
      .sign-space{height:20px}
      .legal{margin-top:10px;font-size:10px;line-height:1.25}
      @media print{
        body{margin:0}
        table{margin:11px 0}
        th,td{padding:5px}
        .sign{margin-top:17px}
        .sign>div{min-height:48px}
        .sign-space{height:17px}
        tr{break-inside:avoid}
      }
    </style></head><body>
      <div class="brand"><img src="${logoOlivilla}" alt="Olivilla Tres"></div>
      <h1>Recibí de equipos de protección individual y ropa de trabajo</h1>
      <div class="section-title">GESTIÓN DE EPIS</div>
      <p>OLIVILLA TRES, S.L.U., en cumplimiento de lo establecido en los artículos 14 y 17 de la Ley 31/1995, de Prevención de Riesgos Laborales, así como en el artículo 3 del Real Decreto 773/1997, hace entrega a:</p>
      <div class="meta">
        <div><b>Nombre y apellidos del trabajador:</b><br>${escapeHtml(workerName)}</div>
        <div><b>DNI / NIE:</b><br>${escapeHtml(!blank ? (selectedWorker?.dni || '________________') : '________________')}</div>
        <div><b>Fecha:</b><br>${blank ? '________________' : escapeHtml(date)}</div>
      </div>
      <p>de los siguientes equipos de protección individual y/o ropa de trabajo, así como de las hojas de instrucciones de uso y mantenimiento correspondientes:</p>
      <table><thead><tr><th>Equipo / artículo</th><th>Especificaciones técnicas / talla</th><th>Cantidad</th><th>Fecha / tipo de entrega</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Se informa al trabajador de la obligación, conforme al artículo 29 de la Ley de Prevención de Riesgos Laborales, de utilizar los equipos entregados por OLIVILLA TRES, S.L.U. para los trabajos en los que se hayan establecido estas medidas de protección:</p>
      <ul class="duties">
        <li>Utilizar, mantener y conservar correctamente los equipos de protección individual proporcionados, de acuerdo con las respectivas hojas de instrucciones.</li>
        <li>Informar al mando directo de cualquier deterioro, anomalía o daño que haya sufrido el equipo y solicitar su reposición.</li>
      </ul>
      <p class="legal">La firma del trabajador acredita la recepción de los artículos relacionados y de la información e instrucciones correspondientes. El incumplimiento de las obligaciones de uso podrá tener las consecuencias previstas en el artículo 58.1 del Estatuto de los Trabajadores.</p>
      <div class="sign"><div><b>Entregado por la empresa</b><div class="sign-space"></div>Nombre y firma:</div><div><b>Recibido por el trabajador</b><div class="sign-space"></div>Nombre y firma:</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`
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
      removeSessionDraft(draftKey)
      setNotice('Justificante guardado y entrega registrada. El stock de ropa se ha actualizado.')
      setWorkerId('')
      setDate(dateToday())
      setSelectedPpe([])
      setCustomPpe('')
      setClothingLines([])
      setInitialMode(false)
      setInitialLines([])
      await load()
    } catch (error) { setNotice(error.message || 'No se pudo guardar la entrega.') }
    finally { setSaving(false) }
  }

  return <><div className="mb-4"><h1 className="h2 fw-bold mb-1">EPIS · Entregas</h1><p className="text-secondary mb-0">Selecciona una ficha laboral, prepara el justificante y guarda la entrega para descontar la ropa del inventario.</p></div>
    {notice && <div className="alert alert-info" role="status">{notice}</div>}
    <section className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5">Nueva entrega</h2><form onSubmit={saveDelivery} className="row g-3" data-draft-exclude>
      <div className="col-12 col-lg-6"><WorkerSelector workers={workers} value={workerId} onChange={setWorkerId} disabled={loading || saving} /></div>
      <div className="col-6 col-lg-3"><label className="form-label" htmlFor="delivery-date">Fecha de entrega</label><input id="delivery-date" className="form-control" type="date" value={date} onChange={event => setDate(event.target.value)} required /></div>
      <div className="col-6 col-lg-3"><label className="form-label" htmlFor="delivery-reason">Tipo predeterminado</label><input id="delivery-reason" className="form-control" value="Reposición" readOnly /><div className="form-text">Puedes marcar artículos como entrega inicial abajo.</div></div>
      {workerId && (recentDeliveriesLoading || recentSelectedItems.length > 0) && <div className="col-12">{recentDeliveriesLoading ? <div className="small text-secondary" role="status">Comprobando entregas de los últimos 6 meses…</div> : <div className="alert alert-warning mb-0" role="status"><div className="fw-semibold mb-2">Este trabajador ha recibido los siguientes artículos en los últimos 6 meses:</div><ul className="mb-2 ps-3">{recentSelectedItems.map((item, index) => <li key={`${item.date}-${item.name}-${item.size || ''}-${index}`}><strong>{item.name}</strong>{item.size ? ` · Talla ${item.size}` : ''}{Number(item.quantity) > 1 ? ` · Cantidad: ${item.quantity}` : ''} — {new Date(`${item.date}T00:00:00`).toLocaleDateString('es-ES')}</li>)}</ul><div className="small">Este aviso es únicamente informativo. Puedes continuar con la entrega.</div></div>}</div>}
      <div className="col-12"><h3 className="h6">Equipos de protección individual</h3><div className="row g-2">{PPE.map(name => <div className="col-12 col-md-6 col-xl-4" key={name}><label className="form-check"><input className="form-check-input" type="checkbox" checked={selectedPpe.includes(name)} onChange={event => setSelectedPpe(current => event.target.checked ? [...current, name] : current.filter(item => item !== name))} /><span className="form-check-label">{name}</span></label></div>)}</div>
        {selectedPpe.some(name => !PPE.includes(name)) && <div className="mt-3"><div className="small fw-semibold mb-2">Otros EPIs añadidos</div><div className="d-flex flex-wrap gap-2">{selectedPpe.filter(name => !PPE.includes(name)).map(name => <span key={name} className="badge text-bg-light border d-inline-flex align-items-center gap-2 py-2 px-3">{name}<button type="button" className="btn-close" style={{ fontSize: '.65rem' }} aria-label={`Quitar ${name}`} onClick={() => setSelectedPpe(current => current.filter(item => item !== name))} /></span>)}</div></div>}
        <div className="row g-2 mt-2"><div className="col-12 col-md-8"><label className="form-label" htmlFor="custom-ppe">Añadir otro EPI</label><input id="custom-ppe" className="form-control" maxLength={150} value={customPpe} onChange={event => setCustomPpe(event.target.value)} placeholder="Escribe el nombre del equipo" /></div><div className="col-12 col-md-4 d-flex align-items-end"><button type="button" className="btn btn-outline-secondary" onClick={addCustomPpe} disabled={!customPpe.trim()}>Añadir EPI</button></div></div>
      </div>
      <div className="col-12"><div className="d-flex align-items-center justify-content-between gap-2 flex-wrap"><h3 className="h6 mb-0">Ropa de trabajo</h3><button type="button" className="btn btn-sm btn-outline-success" onClick={addClothingLine} disabled={!clothing.length}>+ Añadir prenda</button></div>{!clothing.length && <p className="small text-secondary mt-2">No hay prendas activas en el inventario de ROPA.</p>}{clothingLines.map(line => <div className="row g-2 mt-1 align-items-end" key={line.key}><div className="col-12 col-md-5"><label className="form-label">Artículo</label><select className="form-select" value={line.item_id} onChange={event => changeClothing(line.key, { item_id: event.target.value })}>{clothing.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="col-5 col-md-2"><label className="form-label">Talla</label><select className="form-select" value={line.size} onChange={event => changeClothing(line.key, { size: event.target.value })}>{SIZES.map(size => <option key={size}>{size}</option>)}</select></div><div className="col-5 col-md-2"><label className="form-label">Cantidad</label><input className="form-control" type="number" min="1" step="1" value={line.quantity} onChange={event => changeClothing(line.key, { quantity: event.target.value })} /></div><div className="col-2 col-md-2"><button type="button" className="btn btn-outline-danger" onClick={() => { setClothingLines(current => current.filter(item => item.key !== line.key)); setInitialLines(current => current.filter(key => key !== `ropa:${line.key}`)) }} aria-label="Eliminar prenda">×</button></div><div className="col-12 small text-secondary">Stock disponible: {clothing.find(item => item.id === line.item_id)?.stock?.[line.size] ?? 0}</div></div>)}</div>
      <div className="col-12 form-check form-switch ms-1"><input id="initial-mode" className="form-check-input" type="checkbox" role="switch" checked={initialMode} onChange={event => { setInitialMode(event.target.checked); if (!event.target.checked) setInitialLines([]) }} /><label className="form-check-label fw-semibold" htmlFor="initial-mode">¿Algún artículo es entrega inicial?</label></div>
      {initialMode && <div className="col-12 border rounded p-3"><p className="small text-secondary">Marca únicamente los artículos que sean entrega inicial. Los demás se guardarán como reposición.</p>{lines.length ? <div className="row g-2">{lines.map(line => <div className="col-12 col-md-6" key={line.line_key}><label className="form-check"><input className="form-check-input" type="checkbox" checked={initialLines.includes(line.line_key)} onChange={event => toggleInitialLine(line.line_key, event.target.checked)} /><span className="form-check-label">{line.item_name}{line.size ? ` · ${line.size}` : ''}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</span></label></div>)}</div> : <p className="mb-0 small">Selecciona primero los artículos que vas a entregar.</p>}</div>}
      <div className="col-12 d-flex flex-wrap gap-2 align-items-center"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearDeliveryForm}>Limpiar formulario</button><button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar justificante y descontar stock'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => printDocument(false)}>Imprimir justificante preparado</button><button type="button" className="btn btn-outline-secondary" onClick={() => printDocument(true)}>Imprimir PDF en blanco</button></div>
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
