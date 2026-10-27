import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createWorkerAccount,
  getWorkers,
  resetWorkerPassword,
  setWorkerActive,
} from '../features/employees/services/employeesService'

const EMPTY = { username: '', displayName: '', password: '', confirmPassword: '' }

export default function UsuariosPage() {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [notice, setNotice] = useState(null)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  const loadWorkers = useCallback(async () => {
    setLoading(true)
    try {
      setWorkers(await getWorkers())
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se han podido cargar las cuentas.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWorkers() }, [loadWorkers])

  const filtered = useMemo(() => workers.filter((worker) => {
    const term = search.trim().toLocaleLowerCase('es')
    const text = `${worker.display_name ?? ''} ${worker.username ?? ''}`.toLocaleLowerCase('es')
    const matchesText = !term || text.includes(term)
    const matchesStatus = status === 'all' || (status === 'active' ? worker.active : !worker.active)
    return matchesText && matchesStatus
  }), [workers, search, status])

  function changeForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function create(event) {
    event.preventDefault()
    setNotice(null)
    if (!/^[a-z0-9._-]{1,32}$/i.test(form.username.trim())) {
      setNotice({ type: 'danger', text: 'El usuario solo puede contener letras sin acentos, números, puntos, guiones y guiones bajos.' })
      return
    }
    if (!form.displayName.trim()) {
      setNotice({ type: 'danger', text: 'Introduce el nombre completo del trabajador.' })
      return
    }
    if (form.password.length < 8) {
      setNotice({ type: 'danger', text: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (form.password !== form.confirmPassword) {
      setNotice({ type: 'danger', text: 'Las contraseñas no coinciden.' })
      return
    }

    setSaving(true)
    try {
      await createWorkerAccount({
        username: form.username.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        password: form.password,
      })
      setForm(EMPTY)
      setShowCreate(false)
      setNotice({ type: 'success', text: 'Cuenta creada correctamente.' })
      await loadWorkers()
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se ha podido crear la cuenta.' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(worker) {
    const action = worker.active ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Quieres ${action} la cuenta de ${worker.display_name}?`)) return
    setNotice(null)
    setSaving(true)
    try {
      await setWorkerActive(worker.id, !worker.active)
      setWorkers((current) => current.map((item) =>
        item.id === worker.id ? { ...item, active: !worker.active } : item
      ))
      setNotice({ type: 'success', text: `Cuenta ${worker.active ? 'desactivada' : 'activada'}. Se conserva su historial.` })
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se ha podido cambiar el estado.' })
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword(event) {
    event.preventDefault()
    setNotice(null)
    if (newPassword.length < 8) {
      setNotice({ type: 'danger', text: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    setSaving(true)
    try {
      await resetWorkerPassword({ workerId: passwordTarget.id, password: newPassword })
      setNotice({ type: 'success', text: `Contraseña actualizada para ${passwordTarget.display_name}.` })
      setPasswordTarget(null)
      setNewPassword('')
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se ha podido cambiar la contraseña.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h2 fw-bold mb-1">Usuarios</h1>
          <p className="text-secondary mb-0">Gestiona las cuentas de acceso de los trabajadores.</p>
        </div>
        <button className="btn btn-success align-self-md-start" onClick={() => {
          setShowCreate((value) => !value)
          setPasswordTarget(null)
          setNotice(null)
        }}>
          {showCreate ? 'Cancelar' : '+ Crear usuario'}
        </button>
      </div>

      {notice && <div className={`alert alert-${notice.type}`} role="alert">{notice.text}</div>}

      {showCreate && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h2 className="h5 mb-3">Nueva cuenta</h2>
            <form onSubmit={create} className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label" htmlFor="user-display-name">Nombre y apellidos</label>
                <input id="user-display-name" className="form-control" name="displayName" value={form.displayName} onChange={changeForm} required maxLength={100} autoComplete="off" />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label" htmlFor="user-username">Nombre de usuario</label>
                <input id="user-username" className="form-control" name="username" value={form.username} onChange={changeForm} required maxLength={32} pattern="[A-Za-z0-9._-]+" autoComplete="off" />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label" htmlFor="user-password">Contraseña inicial</label>
                <input id="user-password" className="form-control" type="password" name="password" value={form.password} onChange={changeForm} minLength={8} required autoComplete="new-password" />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label" htmlFor="user-confirm-password">Repetir contraseña</label>
                <input id="user-confirm-password" className="form-control" type="password" name="confirmPassword" value={form.confirmPassword} onChange={changeForm} minLength={8} required autoComplete="new-password" />
              </div>
              <div className="col-12"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Crear cuenta'}</button></div>
            </form>
          </div>
        </div>
      )}

      {passwordTarget && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h2 className="h5">Cambiar contraseña: {passwordTarget.display_name}</h2>
            <form onSubmit={resetPassword} className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label" htmlFor="user-new-password">Nueva contraseña</label>
                <input id="user-new-password" className="form-control" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required autoComplete="new-password" />
              </div>
              <div className="col-12 d-flex gap-2">
                <button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { setPasswordTarget(null); setNewPassword('') }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        <div className="card-body p-3 p-md-4">
          <div className="row g-2 mb-3">
            <div className="col-12 col-md-7">
              <label className="visually-hidden" htmlFor="users-search">Buscar usuario</label>
              <input id="users-search" className="form-control" placeholder="Buscar por nombre o usuario…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <div className="col-12 col-md-5">
              <select className="form-select" aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          </div>

          {loading ? <p className="text-secondary mb-0">Cargando usuarios…</p> : filtered.length === 0 ? (
            <div className="text-center py-4 text-secondary">No hay usuarios que coincidan con los filtros.</div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead><tr><th>Trabajador</th><th>Usuario</th><th>Estado</th><th className="text-end">Acciones</th></tr></thead>
                <tbody>{filtered.map((worker) => (
                  <tr key={worker.id}>
                    <td className="fw-semibold">{worker.display_name || 'Sin nombre'}</td>
                    <td>{worker.username || '—'}</td>
                    <td><span className={`badge ${worker.active ? 'text-bg-success' : 'text-bg-secondary'}`}>{worker.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td><div className="d-flex flex-wrap justify-content-end gap-2">
                      <button className="btn btn-sm btn-outline-primary" disabled={saving} onClick={() => { setPasswordTarget(worker); setShowCreate(false); setNewPassword(''); setNotice(null) }}>Cambiar contraseña</button>
                      <button className={`btn btn-sm ${worker.active ? 'btn-outline-danger' : 'btn-outline-success'}`} disabled={saving} onClick={() => toggleActive(worker)}>{worker.active ? 'Desactivar' : 'Activar'}</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="small text-secondary mt-3">{filtered.length} de {workers.length} cuentas. Las cuentas desactivadas y su historial se conservan.</div>
        </div>
      </div>
    </>
  )
}
