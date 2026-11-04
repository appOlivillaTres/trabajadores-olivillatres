import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createWorkerAccount,
  deleteWorkerAccount,
  getWorkers,
  resetWorkerPassword,
  setWorkerActive,
  updateWorkerDetails,
} from '../features/employees/services/employeesService'

const EMPTY = { username: '', displayName: '', password: '', confirmPassword: '' }
const PAGE_SIZE = 9

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

export default function EmployeesPage() {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState(null)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({ displayName: '', username: '' })

  const loadWorkers = useCallback(async () => {
    setLoading(true)
    try { setWorkers(await getWorkers()) }
    catch (error) { setNotice({ type: 'danger', text: error.message || 'No se han podido cargar los trabajadores.' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { loadWorkers() }, [loadWorkers])

  const filtered = useMemo(() => workers.filter((worker) => {
    const term = normalizeText(search.trim())
    const matches = !term || normalizeText(`${worker.display_name ?? ''} ${worker.username ?? ''}`).includes(term)
    return matches && (status === 'active' ? worker.active : !worker.active)
  }), [workers, search, status])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visibleWorkers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [search, status])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  function changeForm(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }

  async function create(event) {
    event.preventDefault(); setNotice(null)
    if (form.password.length < 8) return setNotice({ type: 'danger', text: 'La contraseña debe tener al menos 8 caracteres.' })
    if (form.password !== form.confirmPassword) return setNotice({ type: 'danger', text: 'Las contraseñas no coinciden.' })
    setSaving(true)
    try {
      await createWorkerAccount({ username: form.username.trim().toLowerCase(), displayName: form.displayName.trim(), password: form.password })
      setForm(EMPTY); setShowCreate(false); setStatus('active'); setSearch('')
      setNotice({ type: 'success', text: 'Cuenta creada correctamente. Entrega al trabajador su usuario y contraseña de forma segura.' })
      await loadWorkers()
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido crear la cuenta.' }) }
    finally { setSaving(false) }
  }

  function startEdit(worker) {
    setEditTarget(worker)
    setEditForm({ displayName: worker.display_name || '', username: worker.username || '' })
    setShowCreate(false); setPasswordTarget(null); setNotice(null)
  }

  async function saveEdit(event) {
    event.preventDefault()
    if (!editTarget) return
    setNotice(null)
    const username = editForm.username.trim().toLowerCase()
    const displayName = editForm.displayName.trim()
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return setNotice({ type: 'danger', text: 'El usuario debe tener entre 3 y 32 caracteres y solo puede contener letras sin acentos, números, puntos, guiones o guiones bajos.' })
    if (!displayName || displayName.length > 100) return setNotice({ type: 'danger', text: 'Introduce un nombre de hasta 100 caracteres.' })
    setSaving(true)
    try {
      await updateWorkerDetails({ workerId: editTarget.id, username, displayName })
      setEditTarget(null)
      setNotice({ type: 'success', text: 'Los datos del trabajador se han actualizado correctamente.' })
      await loadWorkers()
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se han podido actualizar los datos.' }) }
    finally { setSaving(false) }
  }

  async function toggleActive(worker) {
    const action = worker.active ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Quieres ${action} la cuenta de ${worker.display_name}?`)) return
    setNotice(null)
    try {
      await setWorkerActive(worker.id, !worker.active)
      setWorkers((current) => current.map((item) => item.id === worker.id ? { ...item, active: !worker.active } : item))
      setNotice({ type: 'success', text: `Cuenta ${worker.active ? 'desactivada' : 'activada'}. Se conserva su historial.` })
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido cambiar el estado.' }) }
  }

  async function removeWorker(worker) {
    const confirmed = window.confirm(`¿Eliminar definitivamente la cuenta de ${worker.display_name} (@${worker.username})? Esta acción no se puede deshacer.`)
    if (!confirmed) return
    setNotice(null)
    try {
      await deleteWorkerAccount(worker.id)
      setWorkers((current) => current.filter((item) => item.id !== worker.id))
      setNotice({ type: 'success', text: `Se ha eliminado definitivamente la cuenta de ${worker.display_name}.` })
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido eliminar la cuenta.' }) }
  }

  async function resetPassword(event) {
    event.preventDefault(); setNotice(null)
    if (newPassword.length < 8) return setNotice({ type: 'danger', text: 'La contraseña debe tener al menos 8 caracteres.' })
    setSaving(true)
    try {
      await resetWorkerPassword({ workerId: passwordTarget.id, password: newPassword })
      setNotice({ type: 'success', text: `Contraseña actualizada para ${passwordTarget.display_name}.` })
      setPasswordTarget(null); setNewPassword('')
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido cambiar la contraseña.' }) }
    finally { setSaving(false) }
  }

  return <>
    <div className="d-flex flex-column flex-md-row justify-content-between gap-3 mb-4">
      <div><h1 className="h2 fw-bold mb-1">Usuarios</h1><p className="text-secondary mb-0">Gestiona los datos y el acceso de las cuentas de trabajadores.</p></div>
      <button className="btn btn-success align-self-md-start" onClick={() => { setShowCreate((value) => !value); setEditTarget(null); setPasswordTarget(null); setNotice(null) }}>{showCreate ? 'Cancelar' : '+ Crear trabajador'}</button>
    </div>
    {notice && <div className={`alert alert-${notice.type}`} role="alert">{notice.text}</div>}
    {showCreate && <div className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5 mb-3">Nueva cuenta de trabajador</h2><form onSubmit={create} className="row g-3">
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="worker-name">Nombre y apellidos</label><input id="worker-name" className="form-control" name="displayName" value={form.displayName} onChange={changeForm} required maxLength={100} autoComplete="off" /></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="worker-username">Nombre de usuario</label><input id="worker-username" className="form-control" name="username" value={form.username} onChange={changeForm} required minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" autoComplete="off" /><div className="form-text">Letras sin acentos, números, punto, guion o guion bajo.</div></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="worker-password">Contraseña inicial</label><input id="worker-password" className="form-control" type="password" name="password" value={form.password} onChange={changeForm} minLength={8} required autoComplete="new-password" /></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="worker-confirm">Repetir contraseña</label><input id="worker-confirm" className="form-control" type="password" name="confirmPassword" value={form.confirmPassword} onChange={changeForm} minLength={8} required autoComplete="new-password" /></div>
      <div className="col-12"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Crear cuenta'}</button></div>
    </form></div></div>}
    {editTarget && <div className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5 mb-3">Editar trabajador</h2><form onSubmit={saveEdit} className="row g-3">
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="edit-worker-name">Nombre y apellidos</label><input id="edit-worker-name" className="form-control" value={editForm.displayName} onChange={(event) => setEditForm((v) => ({ ...v, displayName: event.target.value }))} maxLength={100} required /></div>
      <div className="col-12 col-md-6"><label className="form-label" htmlFor="edit-worker-username">Nombre de usuario</label><input id="edit-worker-username" className="form-control" value={editForm.username} onChange={(event) => setEditForm((v) => ({ ...v, username: event.target.value }))} minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" required /><div className="form-text">El trabajador tendrá que iniciar sesión con el nuevo usuario.</div></div>
      <div className="col-12 d-flex gap-2"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => setEditTarget(null)}>Cancelar</button></div>
    </form></div></div>}
    {passwordTarget && <div className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h2 className="h5">Cambiar contraseña: {passwordTarget.display_name}</h2><form onSubmit={resetPassword} className="row g-3"><div className="col-12 col-md-6"><label className="form-label" htmlFor="new-password">Nueva contraseña</label><input id="new-password" className="form-control" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required autoComplete="new-password" /></div><div className="col-12 d-flex gap-2"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setPasswordTarget(null); setNewPassword('') }}>Cancelar</button></div></form></div></div>}
    <div className="card border-0 shadow-sm"><div className="card-body p-3 p-md-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-3">
        <ul className="nav nav-tabs border-bottom-0" role="tablist">
          <li className="nav-item"><button type="button" className={`nav-link ${status === 'active' ? 'active' : ''}`} onClick={() => setStatus('active')}>Activos <span className="badge text-bg-success ms-1">{workers.filter((w) => w.active).length}</span></button></li>
          <li className="nav-item"><button type="button" className={`nav-link ${status === 'inactive' ? 'active' : ''}`} onClick={() => setStatus('inactive')}>Inactivos <span className="badge text-bg-secondary ms-1">{workers.filter((w) => !w.active).length}</span></button></li>
        </ul>
        <div className="w-100" style={{ maxWidth: 360 }}><label className="visually-hidden" htmlFor="worker-search">Buscar trabajador</label><input id="worker-search" className="form-control" placeholder="Buscar por nombre o usuario…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      </div>
      {loading ? <p className="text-secondary mb-0">Cargando trabajadores…</p> : filtered.length === 0 ? <div className="text-center py-4 text-secondary">No hay trabajadores en esta pestaña que coincidan con la búsqueda.</div> : <div className="table-responsive"><table className="table align-middle mb-0" style={{ tableLayout: 'fixed', minWidth: 760 }}>
        <colgroup><col style={{ width: '30%' }} /><col style={{ width: '22%' }} /><col style={{ width: '14%' }} /><col style={{ width: '34%' }} /></colgroup>
        <thead><tr><th>Trabajador</th><th>Usuario</th><th>Estado</th><th className="text-end">Acciones</th></tr></thead>
        <tbody>{visibleWorkers.map((worker) => <tr key={worker.id}>
          <td className="fw-semibold text-truncate" title={worker.display_name}>{worker.display_name || 'Sin nombre'}</td>
          <td className="text-truncate" title={worker.username}>{worker.username || '—'}</td>
          <td><span className={`badge ${worker.active ? 'text-bg-success' : 'text-bg-secondary'}`}>{worker.active ? 'Activo' : 'Inactivo'}</span></td>
          <td><div className="d-flex flex-wrap justify-content-end gap-1">
            <button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(worker)}>Editar</button>
            <button className="btn btn-sm btn-outline-primary" onClick={() => { setPasswordTarget(worker); setEditTarget(null); setShowCreate(false); setNewPassword(''); setNotice(null) }}>Contraseña</button>
            <button className={`btn btn-sm ${worker.active ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => toggleActive(worker)}>{worker.active ? 'Desactivar' : 'Activar'}</button>
            {!worker.active && <button className="btn btn-sm btn-danger" onClick={() => removeWorker(worker)}>Eliminar</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mt-3">
        <div className="small text-secondary">{filtered.length === 0 ? '0 usuarios' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} de ${filtered.length}`} · 9 por página</div>
        {filtered.length > PAGE_SIZE && <nav aria-label="Paginación de usuarios"><ul className="pagination pagination-sm mb-0">
          <li className={`page-item ${page === 1 ? 'disabled' : ''}`}><button className="page-link" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button></li>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <li className={`page-item ${page === number ? 'active' : ''}`} key={number}><button className="page-link" onClick={() => setPage(number)}>{number}</button></li>)}
          <li className={`page-item ${page === pageCount ? 'disabled' : ''}`}><button className="page-link" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Siguiente</button></li>
        </ul></nav>}
      </div>
      <div className="small text-secondary mt-2">Las cuentas inactivas conservan su historial hasta que se eliminan definitivamente.</div>
    </div></div>
  </>
}
