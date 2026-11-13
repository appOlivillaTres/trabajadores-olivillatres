import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { canAccessSection, SECTION } from '../lib/permissions'
import { getWorksites } from '../features/worksites/services/worksitesService'
import {
  cancelPurchaseRequest, createPurchaseRequest, listPurchaseRequests,
  updatePurchaseRequest, updatePurchaseStatus,
} from '../features/purchases/services/purchaseRequestsService'

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const formatDate = (value) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES') : '—'
const dateValue = (value) => value ? value.slice(0, 10) : ''

export default function PurchasesPage() {
  const { profile } = useAuth()
  const canRequest = canAccessSection(profile, SECTION.PURCHASES_REQUEST)
  const canManage = canAccessSection(profile, SECTION.PURCHASES_MANAGE)
  const canSee = canRequest || canManage
  const [requests, setRequests] = useState([])
  const [worksites, setWorksites] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [tab, setTab] = useState('pending')
  const [showAll, setShowAll] = useState(false)
  const [filters, setFilters] = useState({ from: '', to: '', worksite: '', search: '' })
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ worksiteId: '', customWorksite: '', useCustom: false, description: '', observations: '' })
  const [reviewingId, setReviewingId] = useState(null)
  const [reviewForm, setReviewForm] = useState({ action: 'ordered', orderedAt: today(), expectedAt: '', reason: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, sitesResult] = await Promise.all([
        listPurchaseRequests(),
        getWorksites().then((sites) => ({ sites })).catch((error) => ({ error })),
      ])
      setRequests(rows)
      if (sitesResult.sites) setWorksites(sitesResult.sites.filter((site) => site.active))
      else setWorksites([])
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se pudieron cargar las solicitudes.' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (canSee) void load() }, [canSee, load])

  const pendingCount = requests.filter((request) => request.status === 'pending').length
  const visible = useMemo(() => {
    const rows = requests.filter((request) => tab === 'pending' ? request.status === 'pending' : request.status !== 'pending')
    const q = filters.search.trim().toLocaleLowerCase('es')
    const filtered = rows.filter((request) => {
      const requestedDate = dateValue(request.requested_at)
      const site = request.worksite_name || ''
      const requester = request.requester?.display_name || request.requester?.username || ''
      const text = `${request.description} ${request.observations || ''} ${site} ${request.rejected_reason || ''} ${requester}`.toLocaleLowerCase('es')
      return (!filters.from || requestedDate >= filters.from) &&
        (!filters.to || requestedDate <= filters.to) &&
        (!filters.worksite || site === filters.worksite) &&
        (!q || text.includes(q))
    })
    return showAll ? filtered : filtered.slice(0, 15)
  }, [requests, tab, filters, showAll])

  function resetForm() {
    setForm({ worksiteId: '', customWorksite: '', useCustom: false, description: '', observations: '' })
    setEditingId(null)
  }

  function startEdit(request) {
    setForm({
      worksiteId: request.worksite_id || '',
      customWorksite: request.worksite_name && !request.worksite_id ? request.worksite_name : '',
      useCustom: !request.worksite_id,
      description: request.description || '',
      observations: request.observations || '',
    })
    setEditingId(request.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitRequest(event) {
    event.preventDefault()
    if (!form.useCustom && !form.worksiteId) {
      setNotice({ type: 'warning', text: 'Selecciona una obra o escribe el nombre de otra obra.' })
      return
    }
    if (form.useCustom && !form.customWorksite.trim()) {
      setNotice({ type: 'warning', text: 'Escribe el nombre de la obra.' })
      return
    }
    if (!form.description.trim()) {
      setNotice({ type: 'warning', text: 'Describe el material que necesitas.' })
      return
    }
    const selected = worksites.find((site) => site.id === form.worksiteId)
    const payload = {
      worksite_id: form.useCustom ? null : form.worksiteId,
      worksite_name: form.useCustom ? form.customWorksite.trim() : selected?.name || null,
      description: form.description.trim(),
      observations: form.observations.trim() || null,
    }
    setSaving(true); setNotice(null)
    try {
      if (editingId) await updatePurchaseRequest(editingId, payload)
      else await createPurchaseRequest(payload)
      resetForm()
      setNotice({ type: 'success', text: editingId ? 'Solicitud modificada correctamente.' : 'Solicitud enviada correctamente.' })
      await load()
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se pudo guardar la solicitud.' }) }
    finally { setSaving(false) }
  }

  async function cancelRequest(request) {
    if (!window.confirm('¿Quieres cancelar esta solicitud? Se marcará como cancelada y dejará de aparecer en solicitudes pendientes.')) return
    setSaving(true); setNotice(null)
    try { await cancelPurchaseRequest(request.id); setNotice({ type: 'success', text: 'Solicitud cancelada.' }); await load() }
    catch (error) { setNotice({ type: 'danger', text: error.message || 'No se pudo cancelar la solicitud.' }) }
    finally { setSaving(false) }
  }

  function startReview(request, action = 'ordered') {
    setReviewingId(request.id)
    setReviewForm({ action, orderedAt: today(), expectedAt: '', reason: '' })
  }

  async function submitReview(event, request) {
    event.preventDefault()
    let payload
    if (reviewForm.action === 'rejected') {
      if (!reviewForm.reason.trim()) { setNotice({ type: 'warning', text: 'Indica el motivo del rechazo.' }); return }
      payload = { status: 'rejected', rejected_reason: reviewForm.reason.trim(), reviewed_by: profile.id }
    } else {
      if (!reviewForm.orderedAt) { setNotice({ type: 'warning', text: 'Indica la fecha en la que se ha realizado el pedido.' }); return }
      payload = { status: 'ordered', ordered_at: reviewForm.orderedAt, expected_delivery_at: reviewForm.expectedAt || null, reviewed_by: profile.id, rejected_reason: null }
    }
    setSaving(true); setNotice(null)
    try {
      await updatePurchaseStatus(request.id, payload)
      setReviewingId(null)
      setNotice({ type: 'success', text: reviewForm.action === 'rejected' ? 'Solicitud rechazada.' : 'Solicitud aceptada y pedido registrado.' })
      await load()
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se pudo actualizar la solicitud.' }) }
    finally { setSaving(false) }
  }

  async function markReceived(request) {
    if (!window.confirm('¿Confirmas que el material de esta solicitud ya se ha recibido?')) return
    setSaving(true); setNotice(null)
    try {
      await updatePurchaseStatus(request.id, { status: 'received', received_at: today(), reviewed_by: profile.id }, 'ordered')
      setNotice({ type: 'success', text: 'Material marcado como recibido.' })
      await load()
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se pudo registrar la recepción.' }) }
    finally { setSaving(false) }
  }

  if (!canSee) return <div className="alert alert-danger">No tienes permiso para acceder a Compras.</div>

  return <>
    <header className="mb-4">
      <p className="text-success text-uppercase small fw-semibold mb-1">Gestión de materiales</p>
      <h1 className="h2 fw-bold mb-2">Compras</h1>
      <p className="text-secondary mb-0">Solicita materiales para las obras y consulta el seguimiento de cada compra.</p>
    </header>

    {notice && <div className={`alert alert-${notice.type}`} role="status">{notice.text}</div>}

    {canRequest && <section className="card border-0 shadow-sm mb-4">
      <div className="card-body p-4">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <h2 className="h5 fw-bold mb-0">{editingId ? 'Modificar solicitud' : 'Nueva solicitud de compra'}</h2>
          {editingId && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetForm}>Cancelar edición</button>}
        </div>
        <form onSubmit={submitRequest}>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label" htmlFor="purchase-worksite">Obra</label>
              {!form.useCustom ? <select id="purchase-worksite" className="form-select" value={form.worksiteId} onChange={(e) => setForm((v) => ({ ...v, worksiteId: e.target.value }))}>
                <option value="">Selecciona una obra…</option>
                {worksites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select> : <input className="form-control" value={form.customWorksite} onChange={(e) => setForm((v) => ({ ...v, customWorksite: e.target.value }))} maxLength={160} placeholder="Nombre de la obra" />}
              <button type="button" className="btn btn-link btn-sm px-0" onClick={() => setForm((v) => ({ ...v, useCustom: !v.useCustom, worksiteId: '', customWorksite: '' }))}>{form.useCustom ? 'Elegir una obra existente' : 'La obra no aparece: escribir otro nombre'}</button>
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="purchase-description">Material que se necesita *</label>
              <textarea id="purchase-description" className="form-control" rows={3} maxLength={5000} value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} required placeholder="Describe los materiales, cantidades, medidas, modelos, etc. Puedes incluir varios materiales en el mismo texto." />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="purchase-observations">Observaciones (opcional)</label>
              <textarea id="purchase-observations" className="form-control" rows={2} maxLength={2000} value={form.observations} onChange={(e) => setForm((v) => ({ ...v, observations: e.target.value }))} placeholder="Detalles adicionales o indicaciones…" />
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-success" type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Enviar solicitud'}</button>
            {!editingId && <button className="btn btn-outline-secondary" type="button" onClick={resetForm}>Limpiar</button>}
          </div>
        </form>
      </div>
    </section>}

    <section className="card border-0 shadow-sm">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item"><button type="button" className={`nav-link ${tab === 'pending' ? 'active' : ''}`} onClick={() => { setTab('pending'); setShowAll(false) }}>Solicitudes <span className="badge text-bg-warning ms-1">{pendingCount}</span></button></li>
            <li className="nav-item"><button type="button" className={`nav-link ${tab === 'reviewed' ? 'active' : ''}`} onClick={() => { setTab('reviewed'); setShowAll(false) }}>Revisadas</button></li>
          </ul>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-6 col-lg-3"><label className="form-label small" htmlFor="purchase-from">Desde</label><input id="purchase-from" type="date" className="form-control form-control-sm" value={filters.from} onChange={(e) => { setFilters((v) => ({ ...v, from: e.target.value })); setShowAll(false) }} /></div>
          <div className="col-6 col-lg-3"><label className="form-label small" htmlFor="purchase-to">Hasta</label><input id="purchase-to" type="date" className="form-control form-control-sm" value={filters.to} onChange={(e) => { setFilters((v) => ({ ...v, to: e.target.value })); setShowAll(false) }} /></div>
          <div className="col-12 col-lg-3"><label className="form-label small" htmlFor="purchase-worksite-filter">Obra</label><select id="purchase-worksite-filter" className="form-select form-select-sm" value={filters.worksite} onChange={(e) => { setFilters((v) => ({ ...v, worksite: e.target.value })); setShowAll(false) }}><option value="">Todas las obras</option>{[...new Set(requests.map((r) => r.worksite_name).filter(Boolean))].sort().map((name) => <option key={name}>{name}</option>)}</select></div>
          <div className="col-12 col-lg-3"><label className="form-label small" htmlFor="purchase-search">Buscar</label><input id="purchase-search" className="form-control form-control-sm" value={filters.search} onChange={(e) => { setFilters((v) => ({ ...v, search: e.target.value })); setShowAll(false) }} placeholder="Material o solicitante…" /></div>
        </div>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="small text-secondary">Mostrando {visible.length} {showAll ? 'resultados' : 'solicitudes (máximo 15)'}.</span>
          <div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setFilters({ from: '', to: '', worksite: '', search: '' }); setShowAll(false) }}>Limpiar filtros</button><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Mostrar últimas 15' : 'Ver todas'}</button></div>
        </div>

        {loading ? <div className="text-center py-4"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando…</span></div></div> : visible.length === 0 ? <div className="text-center text-secondary py-5">No hay solicitudes que coincidan con los filtros.</div> :
          <div className="d-grid gap-3">{visible.map((request) => {
            const requester = request.requester?.display_name || request.requester?.username || 'Usuario'
            const isOwner = request.requested_by === profile.id
            return <article className="border rounded-3 p-3" key={request.id}>
              <div className="d-flex justify-content-between flex-wrap gap-2">
                <div><div className="fw-semibold">{request.worksite_name || 'Obra no indicada'}</div><div className="small text-secondary">Solicitada por {requester} · {formatDate(request.requested_at)}</div></div>
                <span className={`badge ${request.status === 'pending' ? 'text-bg-warning' : request.status === 'rejected' ? 'text-bg-danger' : request.status === 'received' ? 'text-bg-success' : request.status === 'cancelled' ? 'text-bg-secondary' : 'text-bg-primary'} align-self-start`}>{request.status === 'pending' ? 'Pendiente de revisar' : request.status === 'ordered' ? 'Pedido realizado' : request.status === 'received' ? 'Recibido' : request.status === 'cancelled' ? 'Cancelada' : 'Rechazado'}</span>
              </div>
              <div className="mt-3" style={{ whiteSpace: 'pre-wrap' }}>{request.description}</div>
              {request.observations && <div className="small text-secondary mt-2"><strong>Observaciones:</strong> {request.observations}</div>}
              {request.status !== 'pending' && <div className="small mt-3 d-flex flex-wrap gap-3">
                {request.ordered_at && <span>Pedido: {formatDate(request.ordered_at)}</span>}
                {request.expected_delivery_at && <span>Entrega prevista: {formatDate(request.expected_delivery_at)}</span>}
                {request.received_at && <span>Recibido: {formatDate(request.received_at)}</span>}
                {request.rejected_reason && <span className="text-danger">Motivo: {request.rejected_reason}</span>}
              </div>}
              {tab === 'pending' && (isOwner || canManage) && <div className="d-flex flex-wrap gap-2 mt-3">
                {isOwner && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => startEdit(request)} disabled={saving}>Modificar</button>}
                {isOwner && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void cancelRequest(request)} disabled={saving}>Cancelar solicitud</button>}
                {canManage && <button type="button" className="btn btn-sm btn-success" onClick={() => startReview(request, 'ordered')} disabled={saving}>Aceptar y marcar pedido</button>}
                {canManage && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => startReview(request, 'rejected')} disabled={saving}>Rechazar</button>}
              </div>}
              {tab === 'reviewed' && canManage && request.status === 'ordered' && <div className="mt-3"><button type="button" className="btn btn-sm btn-success" onClick={() => void markReceived(request)} disabled={saving}>Marcar como recibido</button></div>}
              {reviewingId === request.id && <form className="border-top mt-3 pt-3" onSubmit={(e) => void submitReview(e, request)}>
                {reviewForm.action === 'ordered' ? <div className="row g-2"><div className="col-12 col-md-6"><label className="form-label small">Fecha del pedido *</label><input type="date" className="form-control" value={reviewForm.orderedAt} onChange={(e) => setReviewForm((v) => ({ ...v, orderedAt: e.target.value }))} required /></div><div className="col-12 col-md-6"><label className="form-label small">Fecha prevista de llegada</label><input type="date" className="form-control" value={reviewForm.expectedAt} onChange={(e) => setReviewForm((v) => ({ ...v, expectedAt: e.target.value }))} /></div></div> : <div><label className="form-label small">Motivo del rechazo *</label><textarea className="form-control" rows={2} value={reviewForm.reason} onChange={(e) => setReviewForm((v) => ({ ...v, reason: e.target.value }))} required /></div>}
                <div className="d-flex gap-2 mt-3"><button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar'}</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setReviewingId(null)} disabled={saving}>Cancelar</button></div>
              </form>}
            </article>
          })}</div>}
      </div>
    </section>
  </>
}
