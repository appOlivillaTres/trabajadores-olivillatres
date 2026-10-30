import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const SIZES = ['3XL', 'XXL', 'XL', 'L', 'M', 'S']
const EMPTY = { name: '', description: '' }
const blankQuantities = () => Object.fromEntries(SIZES.map(size => [size, '0']))

export default function ClothingStockPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [quantities, setQuantities] = useState(blankQuantities())
  const [busy, setBusy] = useState(false)
  const [movement, setMovement] = useState({ itemId: '', size: 'M', quantity: '0', kind: 'in', note: '' })
  const [search, setSearch] = useState('')
  const [sizeFilter, setSizeFilter] = useState('Todas')
  const [showAdd, setShowAdd] = useState(false)
  const [showStockAction, setShowStockAction] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editForm, setEditForm] = useState({ name: '', description: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('clothing_items').select('*').eq('active', true).order('name')
    if (error) setNotice(`No se pudo cargar el inventario. ${error.message || ''}`)
    setItems(data || [])
    setMovement(current => ({ ...current, itemId: data?.some(item => item.id === current.itemId) ? current.itemId : (data?.[0]?.id || '') }))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  const filteredItems = useMemo(() => items.filter(item => { const q = search.trim().toLocaleLowerCase('es'); const matchesText = !q || `${item.name} ${item.description || ''}`.toLocaleLowerCase('es').includes(q); const matchesSize = sizeFilter === 'Todas' || Number(item.stock?.[sizeFilter] || 0) > 0; return matchesText && matchesSize }), [items, search, sizeFilter])

  async function createItem(event) {
    event.preventDefault(); setNotice(''); setBusy(true)
    try {
      for (const size of SIZES) {
        const amount = Number(quantities[size] || 0)
        if (!Number.isInteger(amount) || amount < 0) throw new Error(`El stock de ${size} debe ser un entero no negativo.`)
      }
      const { data, error } = await supabase.from('clothing_items').insert({ name: form.name.trim(), description: form.description.trim() || null }).select('*').single()
      if (error) throw error
      for (const size of SIZES) {
        const amount = Number(quantities[size] || 0)
        if (amount > 0) {
          const { error: movementError } = await supabase.rpc('clothing_stock_move', { p_item_id: data.id, p_size: size, p_quantity: amount, p_movement_type: 'in', p_note: 'Stock inicial' })
          if (movementError) throw movementError
        }
      }
      setForm(EMPTY); setQuantities(blankQuantities()); setShowAdd(false); setNotice('Artículo creado correctamente.'); await load()
    } catch (error) { setNotice(error.message || 'No se pudo crear el artículo.') }
    finally { setBusy(false) }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({ name: item.name || '', description: item.description || '' })
    setNotice('')
  }

  async function saveEdit(event) {
    event.preventDefault(); setNotice(''); setBusy(true)
    try {
      const name = editForm.name.trim()
      if (!name) throw new Error('El nombre del artículo no puede estar vacío.')
      const { error } = await supabase.from('clothing_items').update({ name, description: editForm.description.trim() || null, updated_at: new Date().toISOString() }).eq('id', editingId)
      if (error) throw error
      setEditingId(''); setNotice('Artículo actualizado correctamente.'); await load()
    } catch (error) { setNotice(error.message || 'No se pudo modificar el artículo.') }
    finally { setBusy(false) }
  }

  async function deleteItem(item) {
    const confirmed = window.confirm(`¿Quieres quitar «${item.name}» del listado? Se conservará el historial de movimientos y las entregas anteriores.`)
    if (!confirmed) return
    setNotice(''); setBusy(true)
    try {
      const { error } = await supabase.from('clothing_items').update({ active: false, updated_at: new Date().toISOString() }).eq('id', item.id)
      if (error) throw error
      setNotice(`«${item.name}» se ha quitado del listado. El historial se conserva.`); await load()
    } catch (error) { setNotice(error.message || 'No se pudo quitar el artículo.') }
    finally { setBusy(false) }
  }

  async function saveMovement(event) {
    event.preventDefault(); setNotice(''); setBusy(true)
    try {
      const amount = Number(movement.quantity)
      if (!movement.itemId || !Number.isInteger(amount) || amount < 0 || (movement.kind === 'in' && amount < 1)) throw new Error(movement.kind === 'adjustment' ? 'Introduce el número exacto de unidades que hay actualmente (cero también es válido).' : 'Introduce una cantidad entera mayor que cero.')
      const { error } = await supabase.rpc('clothing_stock_move', { p_item_id: movement.itemId, p_size: movement.size, p_quantity: amount, p_movement_type: movement.kind, p_note: movement.note.trim() || null })
      if (error) throw error
      setNotice(movement.kind === 'adjustment' ? 'Existencias ajustadas al número indicado.' : 'Entrada de ropa registrada.')
      setMovement(current => ({ ...current, quantity: current.kind === 'adjustment' ? '0' : '1', note: '' })); await load()
    } catch (error) { setNotice(error.message || 'No se pudo registrar el movimiento.') }
    finally { setBusy(false) }
  }

  return <>
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-4"><div><h1 className="h2 fw-bold mb-1">ROPA · Control de stock</h1><p className="text-secondary mb-0">Inventario de prendas y tallas. Las entregas se descuentan desde EPIS.</p></div><div className="d-flex flex-wrap gap-2"><button type="button" className="btn btn-success" onClick={() => { setShowAdd(value => !value); setShowStockAction(false) }}>{showAdd ? 'Cerrar' : '+ Añadir artículo'}</button><button type="button" className="btn btn-outline-success" onClick={() => { setShowStockAction(value => !value); setShowAdd(false) }}>{showStockAction ? 'Cerrar' : 'Entrada / ajuste de stock'}</button></div></div>
    {notice && <div className="alert alert-info" role="status">{notice}</div>}
    {showAdd && <section className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5">Añadir artículo</h2><form className="row g-3" onSubmit={createItem}><div className="col-12 col-md-6"><label className="form-label" htmlFor="clothing-name">Nombre del artículo</label><input id="clothing-name" className="form-control" required maxLength={120} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Sudadera azul" /></div><div className="col-12 col-md-6"><label className="form-label" htmlFor="clothing-description">Descripción (opcional)</label><input id="clothing-description" className="form-control" maxLength={500} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></div><div className="col-12"><label className="form-label">Stock inicial por talla</label><div className="row g-2">{SIZES.map(size => <div className="col-4 col-md-2" key={size}><label className="form-label small" htmlFor={`initial-${size}`}>{size}</label><input id={`initial-${size}`} className="form-control" type="number" min="0" step="1" value={quantities[size]} onChange={event => setQuantities(current => ({ ...current, [size]: event.target.value }))} /></div>)}</div></div><div className="col-12 d-flex gap-2"><button className="btn btn-success" disabled={busy}>{busy ? 'Guardando…' : 'Crear artículo'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => setShowAdd(false)}>Cancelar</button></div></form></div></section>}
    {showStockAction && <section className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5">Entrada de ropa o ajuste de stock</h2><form className="row g-3" onSubmit={saveMovement}><div className="col-12 col-md-4"><label className="form-label" htmlFor="movement-kind">Operación</label><select id="movement-kind" className="form-select" value={movement.kind} onChange={event => setMovement(current => ({ ...current, kind: event.target.value, quantity: event.target.value === 'adjustment' ? String(items.find(item => item.id === current.itemId)?.stock?.[current.size] ?? 0) : '1' }))}><option value="in">Entrada de ropa (+ unidades)</option><option value="adjustment">Ajuste de stock (indicar existencias exactas)</option></select></div><div className="col-12 col-md-4"><label className="form-label" htmlFor="movement-item">Artículo</label><select id="movement-item" className="form-select" value={movement.itemId} onChange={event => { const itemId = event.target.value; setMovement(current => ({ ...current, itemId, quantity: current.kind === 'adjustment' ? String(items.find(item => item.id === itemId)?.stock?.[current.size] ?? 0) : current.quantity })) }} required><option value="">Seleccionar…</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="col-6 col-md-2"><label className="form-label" htmlFor="movement-size">Talla</label><select id="movement-size" className="form-select" value={movement.size} onChange={event => { const size = event.target.value; setMovement(current => ({ ...current, size, quantity: current.kind === 'adjustment' ? String(items.find(item => item.id === current.itemId)?.stock?.[size] ?? 0) : current.quantity })) }}>{SIZES.map(size => <option key={size}>{size}</option>)}</select></div><div className="col-6 col-md-2"><label className="form-label" htmlFor="movement-quantity">{movement.kind === 'adjustment' ? 'Nuevo stock exacto' : 'Cantidad a añadir'}</label><input id="movement-quantity" className="form-control" type="number" min={movement.kind === 'adjustment' ? '0' : '1'} step="1" value={movement.quantity} onChange={event => setMovement(current => ({ ...current, quantity: event.target.value }))} required /></div><div className="col-12"><label className="form-label" htmlFor="movement-note">Nota (opcional)</label><input id="movement-note" className="form-control" maxLength={500} value={movement.note} onChange={event => setMovement(current => ({ ...current, note: event.target.value }))} placeholder="Motivo del ajuste o referencia de la entrega de ropa" /></div><div className="col-12 d-flex gap-2"><button className="btn btn-outline-success" disabled={busy || !items.length}>{busy ? 'Guardando…' : movement.kind === 'adjustment' ? 'Guardar ajuste exacto' : 'Registrar entrada'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => setShowStockAction(false)}>Cancelar</button></div><div className="col-12 small text-secondary">En «Ajuste de stock» se introduce el total que hay que dejar en inventario para esa talla, no la diferencia que se suma o resta.</div></form></div></section>}
    <section className="card border-0 shadow-sm mb-4"><div className="card-body p-3 p-md-4"><h2 className="h5 mb-3">Listado de artículos</h2><div className="row g-2 mb-3"><div className="col-12 col-md-8"><label className="form-label" htmlFor="clothing-search">Buscar ropa</label><input id="clothing-search" className="form-control" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o descripción del artículo…" /></div><div className="col-12 col-md-4"><label className="form-label" htmlFor="clothing-size-filter">Filtro de talla</label><select id="clothing-size-filter" className="form-select" value={sizeFilter} onChange={event => setSizeFilter(event.target.value)}><option value="Todas">Todas las tallas</option>{SIZES.map(size => <option key={size}>{size}</option>)}</select></div></div>{loading ? <p className="text-secondary mb-0">Cargando inventario…</p> : !filteredItems.length ? <div className="text-center py-4 text-secondary">No hay artículos que coincidan con la búsqueda y el filtro.</div> : <div className="table-responsive"><table className="table table-bordered align-middle mb-0"><thead><tr><th>Artículo</th>{SIZES.map(size => <th key={size}>{size}</th>)}</tr></thead><tbody>{filteredItems.map(item => <tr key={item.id}><th>{editingId === item.id ? <form className="d-grid gap-2" onSubmit={saveEdit}><input className="form-control form-control-sm" aria-label="Nombre del artículo" required maxLength={120} value={editForm.name} onChange={event => setEditForm(current => ({ ...current, name: event.target.value }))} /><input className="form-control form-control-sm" aria-label="Descripción del artículo" maxLength={500} placeholder="Descripción (opcional)" value={editForm.description} onChange={event => setEditForm(current => ({ ...current, description: event.target.value }))} /><div className="d-flex gap-2"><button className="btn btn-sm btn-success" disabled={busy}>Guardar</button><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingId('')}>Cancelar</button></div></form> : <>{item.name}{item.description && <div className="small text-secondary fw-normal">{item.description}</div>}<div className="d-flex flex-wrap gap-2 mt-2"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => startEdit(item)}>Modificar nombre</button><button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => deleteItem(item)}>Eliminar</button></div></>}</th>{SIZES.map(size => <td key={size} className={Number(item.stock?.[size] || 0) === 0 ? 'text-danger fw-semibold' : ''}>{item.stock?.[size] ?? 0}</td>)}</tr>)}</tbody></table></div>}</div></section>

  </>
}
