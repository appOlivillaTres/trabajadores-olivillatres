import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useWorksites } from '../features/worksites/hooks/useWorksites'
import { canAccessSection, SECTION } from '../lib/permissions'

export default function WorksitesPage() {
  const { profile } = useAuth()
  const { worksites, loading, saving, updatingId, error, loadWorksites, createWorksite, changeWorksiteStatus } = useWorksites()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [activeTab, setActiveTab] = useState('active')

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

  return (
    <>
      <div className="mb-4">
        <p className="text-success text-uppercase small fw-semibold mb-1">Administración</p>
        <h1 className="h2 fw-bold mb-2">Obras</h1>
        <p className="text-secondary mb-0">Crea las obras disponibles para los partes de trabajo y desactiva las que ya no estén en uso.</p>
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
                          <td><div className="fw-semibold">{worksite.name}</div>{worksite.address && <div className="small text-secondary">{worksite.address}</div>}</td>
                          <td><span className={`badge ${worksite.active ? 'text-bg-success' : 'text-bg-secondary'}`}>{worksite.active ? 'Activa' : 'Terminada'}</span></td>
                          <td className="text-end"><button type="button" className={`btn btn-sm ${worksite.active ? 'btn-outline-danger' : 'btn-outline-success'}`} disabled={updatingId === worksite.id} onClick={() => void changeWorksiteStatus(worksite.id, !worksite.active)}>{updatingId === worksite.id ? 'Guardando...' : worksite.active ? 'Marcar terminada' : 'Reactivar'}</button></td>
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
