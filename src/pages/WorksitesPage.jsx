import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useWorksites } from '../features/worksites/hooks/useWorksites'
import { canAccessSection, SECTION } from '../lib/permissions'

export default function WorksitesPage() {
  const { profile } = useAuth()
  const { worksites, loading, saving, updatingId, error, loadWorksites, createWorksite, changeWorksiteStatus, updateWorksite, deleteWorksite } = useWorksites()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [activeTab, setActiveTab] = useState('active')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const activeWorksites = useMemo(() => worksites.filter((worksite) => worksite.active), [worksites])
  const completedWorksites = useMemo(() => worksites.filter((worksite) => !worksite.active), [worksites])
  const visibleWorksites = activeTab === 'active' ? activeWorksites : completedWorksites

  if (!canAccessSection(profile, SECTION.PARTS)) {
    return <div className="alert alert-danger" role="alert">No tienes permisos para gestionar las obras.</div>
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormMessage('')
    try {
      await createWorksite({ name, address })
      setName('')
      setAddress('')
      setFormMessage('La obra se ha creado correctamente.')
    } catch {
      // El hook muestra el error en la página.
    }
  }

  function startEditing(worksite) {
    setActionMessage('')
    setEditingId(worksite.id)
    setEditName(worksite.name)
    setEditAddress(worksite.address ?? '')
  }

  async function handleUpdate(event, worksiteId) {
    event.preventDefault()
    setActionMessage('')
    try {
      await updateWorksite(worksiteId, { name: editName, address: editAddress })
      setEditingId(null)
      setActionMessage('La obra se ha modificado correctamente.')
    } catch {
      // El hook muestra el error en la página.
    }
  }

  async function handleDelete(worksite) {
    const confirmed = window.confirm(`¿Seguro que quieres eliminar la obra «${worksite.name}»? Esta acción no se puede deshacer.`)
    if (!confirmed) return
    setActionMessage('')
    try {
      await deleteWorksite(worksite.id)
      setActionMessage(`La obra «${worksite.name}» se ha eliminado.`)
    } catch {
      // El hook muestra el motivo por el que no se puede eliminar.
    }
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-success text-uppercase small fw-semibold mb-1">Administración</p>
        <h1 className="h2 fw-bold mb-2">Obras</h1>
        <p className="text-secondary mb-0">Crea y modifica las obras disponibles para los partes de trabajo. Las obras con partes asociados se conservan para proteger el historial.</p>
      </div>

      <div className="row g-4 align-items-start">
        <div className="col-12 col-lg-5">
          <section className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h2 className="h5 fw-bold mb-3">Crear una obra</h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="worksite-name" className="form-label">Nombre de la obra *</label>
                  <input id="worksite-name" className="form-control" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Ej.: Reforma vivienda - Madrid" />
                </div>
                <div className="mb-3">
                  <label htmlFor="worksite-address" className="form-label">Dirección (opcional)</label>
                  <input id="worksite-address" className="form-control" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={250} placeholder="Calle, número, localidad" />
                </div>
                <button type="submit" className="btn btn-success w-100" disabled={saving || !name.trim()}>{saving ? 'Guardando...' : 'Crear obra'}</button>
              </form>
              {formMessage && <div className="alert alert-success mt-3 mb-0" role="status">{formMessage}</div>}
            </div>
          </section>
        </div>

        <div className="col-12 col-lg-7">
          <section className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div>
                  <h2 className="h5 fw-bold mb-1">Obras registradas</h2>
                  <p className="text-secondary small mb-0">Las obras inactivas no estarán disponibles para crear nuevos partes.</p>
                </div>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void loadWorksites()} disabled={loading}>{loading ? 'Actualizando...' : 'Actualizar'}</button>
              </div>

              {error && <div className="alert alert-danger" role="alert">{error}</div>}
              {actionMessage && <div className="alert alert-success py-2" role="status">{actionMessage}</div>}

              <ul className="nav nav-tabs mb-3" role="tablist" aria-label="Filtrar obras por estado">
                <li className="nav-item" role="presentation">
                  <button type="button" className={`nav-link ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')} role="tab" aria-selected={activeTab === 'active'}>
                    Activas <span className="badge text-bg-success ms-1">{activeWorksites.length}</span>
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button type="button" className={`nav-link ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')} role="tab" aria-selected={activeTab === 'completed'}>
                    Terminadas <span className="badge text-bg-secondary ms-1">{completedWorksites.length}</span>
                  </button>
                </li>
              </ul>

              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando obras...</span></div></div>
              ) : visibleWorksites.length === 0 ? (
                <div className="text-center text-secondary border rounded-3 p-4">
                  <p className="fw-semibold mb-1">{activeTab === 'active' ? 'No hay obras activas' : 'Todavía no hay obras terminadas'}</p>
                  <p className="small mb-0">{activeTab === 'active' ? 'Crea una obra o reactiva una de la pestaña «Terminadas».' : 'Cuando marques una obra como terminada, aparecerá aquí.'}</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead><tr><th scope="col">Obra</th><th scope="col">Estado</th><th scope="col" className="text-end">Acción</th></tr></thead>
                    <tbody>
                      {visibleWorksites.map((worksite) => (
                        <tr key={worksite.id}>
                          <td>
                            {editingId === worksite.id ? (
                              <form onSubmit={(event) => void handleUpdate(event, worksite.id)}>
                                <div className="mb-2">
                                  <label className="form-label small mb-1" htmlFor={`edit-worksite-name-${worksite.id}`}>Nombre</label>
                                  <input id={`edit-worksite-name-${worksite.id}`} className="form-control form-control-sm" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} required autoFocus />
                                </div>
                                <div className="mb-2">
                                  <label className="form-label small mb-1" htmlFor={`edit-worksite-address-${worksite.id}`}>Dirección (opcional)</label>
                                  <input id={`edit-worksite-address-${worksite.id}`} className="form-control form-control-sm" value={editAddress} onChange={(event) => setEditAddress(event.target.value)} maxLength={250} />
                                </div>
                                <div className="d-flex flex-wrap gap-1">
                                  <button type="submit" className="btn btn-success btn-sm" disabled={updatingId === worksite.id || !editName.trim()}>{updatingId === worksite.id ? 'Guardando...' : 'Guardar'}</button>
                                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditingId(null)} disabled={updatingId === worksite.id}>Cancelar</button>
                                </div>
                              </form>
                            ) : (
                              <><div className="fw-semibold">{worksite.name}</div>{worksite.address && <div className="small text-secondary">{worksite.address}</div>}</>
                            )}
                          </td>
                          <td><span className={`badge ${worksite.active ? 'text-bg-success' : 'text-bg-secondary'}`}>{worksite.active ? 'Activa' : 'Terminada'}</span></td>
                          <td className="text-end">
                            {editingId === worksite.id ? null : (
                              <div className="d-flex flex-wrap justify-content-end gap-1">
                                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => startEditing(worksite)} disabled={updatingId === worksite.id}>Modificar</button>
                                <button type="button" className={`btn btn-sm ${worksite.active ? 'btn-outline-danger' : 'btn-outline-success'}`} disabled={updatingId === worksite.id} onClick={() => void changeWorksiteStatus(worksite.id, !worksite.active)}>{updatingId === worksite.id ? 'Guardando...' : worksite.active ? 'Marcar terminada' : 'Reactivar'}</button>
                                <button type="button" className="btn btn-outline-danger btn-sm" disabled={updatingId === worksite.id} onClick={() => void handleDelete(worksite)}>Eliminar</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
