import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = {
  registration: '', brand: '', model: '', insurance_company: '', policy_number: '',
  itv_expiry_date: '', insurance_expiry_date: '', termination_date: '',
}
const BUCKET = 'vehicle-documents'
const DOCUMENTS = [
  { key: 'technical_sheet_pdf_path', label: 'Ficha técnica (PDF)' },
  { key: 'circulation_permit_pdf_path', label: 'Permiso de circulación (PDF)' },
]

function safeFileName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
}

async function uploadPdf(vehicleId, key, file) {
  if (!file) return undefined
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Solo se admiten archivos PDF.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Cada PDF debe pesar como máximo 10 MB.')
  const path = `${vehicleId}/${key.replace('_pdf_path', '')}-${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
  return path
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [archive, setArchive] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState({})
  const [notice, setNotice] = useState(null)
  const [documentBusy, setDocumentBusy] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (!supabase) throw new Error('Supabase no está configurado. Revisa .env.local.')
      const { data, error } = await supabase.from('vehicles').select('*').order('registration')
      if (error) throw error
      setVehicles(data ?? [])
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se pudieron cargar los vehículos. Comprueba que la migración SQL esté aplicada.' })
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => vehicles.filter((vehicle) => {
    const term = search.trim().toLocaleLowerCase('es')
    const text = `${vehicle.registration} ${vehicle.brand} ${vehicle.model}`.toLocaleLowerCase('es')
    return Boolean(vehicle.termination_date) === archive && (!term || text.includes(term))
  }), [vehicles, search, archive])

  function startNew() { setEditing('new'); setForm(EMPTY); setFiles({}); setNotice(null) }
  function startEdit(vehicle) {
    setEditing(vehicle.id)
    setForm({ ...EMPTY, ...vehicle, itv_expiry_date: vehicle.itv_expiry_date || '', insurance_expiry_date: vehicle.insurance_expiry_date || '', termination_date: vehicle.termination_date || '' })
    setFiles({}); setNotice(null)
  }
  function change(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function save(event) {
    event.preventDefault(); setNotice(null); setSaving(true)
    let vehicleId = editing !== 'new' ? editing : null
    try {
      if (!form.registration.trim() || !form.brand.trim() || !form.model.trim()) throw new Error('Matrícula, marca y modelo son obligatorios.')
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const payload = {
        registration: form.registration.trim().toUpperCase().replace(/\s+/g, ' '),
        brand: form.brand.trim(), model: form.model.trim(),
        insurance_company: form.insurance_company.trim() || null,
        policy_number: form.policy_number.trim() || null,
        itv_expiry_date: form.itv_expiry_date || null,
        insurance_expiry_date: form.insurance_expiry_date || null,
        termination_date: form.termination_date || null,
        updated_by: authData.user?.id || null,
      }
      let result
      if (editing === 'new') {
        result = await supabase.from('vehicles').insert({ ...payload, created_by: authData.user?.id || null }).select('id').single()
        if (result.error) throw result.error
        vehicleId = result.data.id
      } else {
        result = await supabase.from('vehicles').update(payload).eq('id', editing).select('id').single()
        if (result.error) throw result.error
      }
      const oldVehicle = vehicles.find((item) => item.id === vehicleId)
      const docPatch = {}
      for (const doc of DOCUMENTS) {
        const uploaded = await uploadPdf(vehicleId, doc.key, files[doc.key])
        if (uploaded) {
          docPatch[doc.key] = uploaded
          if (oldVehicle?.[doc.key]) {
            const { error } = await supabase.storage.from(BUCKET).remove([oldVehicle[doc.key]])
            if (error) throw error
          }
        }
      }
      if (Object.keys(docPatch).length) {
        const { error } = await supabase.from('vehicles').update(docPatch).eq('id', vehicleId)
        if (error) throw error
      }
      setEditing(null); setFiles({})
      setNotice({ type: 'success', text: editing === 'new' ? 'Vehículo dado de alta correctamente.' : 'Vehículo guardado correctamente.' })
      await load()
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se ha podido guardar el vehículo.' })
    } finally { setSaving(false) }
  }

  async function openDocument(vehicle, key) {
    const path = vehicle[key]
    if (!path) return
    setDocumentBusy(`${vehicle.id}-${key}`)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido abrir el PDF.' }) }
    finally { setDocumentBusy('') }
  }

  async function toggleArchive(vehicle) {
    const isArchived = Boolean(vehicle.termination_date)
    const date = isArchived ? null : new Date().toISOString().slice(0, 10)
    const message = isArchived ? `¿Reactivar el vehículo ${vehicle.registration}?` : `¿Dar de baja y archivar el vehículo ${vehicle.registration}?`
    if (!window.confirm(message)) return
    setNotice(null)
    const { error } = await supabase.from('vehicles').update({ termination_date: date }).eq('id', vehicle.id)
    if (error) setNotice({ type: 'danger', text: error.message || 'No se ha podido cambiar el estado.' })
    else { setNotice({ type: 'success', text: isArchived ? 'Vehículo reactivado.' : 'Vehículo dado de baja y archivado.' }); await load() }
  }

  return <>
    <div className="d-flex flex-column flex-md-row justify-content-between gap-3 mb-4">
      <div><h1 className="h2 fw-bold mb-1">Vehículos</h1><p className="text-secondary mb-0">Listado, datos del seguro e ITV y documentación de cada vehículo.</p></div>
      {!archive && !editing && <button className="btn btn-success align-self-md-start" onClick={startNew}>+ Añadir vehículo</button>}
    </div>
    {notice && <div className={`alert alert-${notice.type}`} role="alert">{notice.text}</div>}

    {editing && <div className="card border-0 shadow-sm mb-4"><div className="card-body p-4">
      <h2 className="h5 mb-4">{editing === 'new' ? 'Alta de vehículo' : 'Editar vehículo'}</h2>
      <form onSubmit={save} className="row g-3">
        <div className="col-12"><h3 className="h6 border-bottom pb-2 mb-1">1. Datos básicos</h3></div>
        <div className="col-12 col-md-4"><label className="form-label" htmlFor="registration">Matrícula *</label><input id="registration" name="registration" className="form-control text-uppercase" value={form.registration} onChange={change} required maxLength={20} /></div>
        <div className="col-12 col-md-4"><label className="form-label" htmlFor="brand">Marca *</label><input id="brand" name="brand" className="form-control" value={form.brand} onChange={change} required maxLength={100} /></div>
        <div className="col-12 col-md-4"><label className="form-label" htmlFor="model">Modelo *</label><input id="model" name="model" className="form-control" value={form.model} onChange={change} required maxLength={100} /></div>

        <div className="col-12 mt-4"><h3 className="h6 border-bottom pb-2 mb-1">2. Seguro e ITV</h3></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="insurance_company">Compañía de seguro</label><input id="insurance_company" name="insurance_company" className="form-control" value={form.insurance_company || ''} onChange={change} maxLength={150} /></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="policy_number">Número de póliza</label><input id="policy_number" name="policy_number" className="form-control" value={form.policy_number || ''} onChange={change} maxLength={100} /></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="itv_expiry_date">Fecha de caducidad de la ITV</label><input id="itv_expiry_date" name="itv_expiry_date" type="date" className="form-control" value={form.itv_expiry_date || ''} onChange={change} /></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="insurance_expiry_date">Fecha de caducidad del seguro</label><input id="insurance_expiry_date" name="insurance_expiry_date" type="date" className="form-control" value={form.insurance_expiry_date || ''} onChange={change} /></div>

        <div className="col-12 mt-4"><h3 className="h6 border-bottom pb-2 mb-1">3. Documentación</h3><p className="form-text mb-0">Los documentos se guardan en un espacio privado y solo son accesibles para usuarios autorizados.</p></div>
        {DOCUMENTS.map((doc) => {
          const current = editing !== 'new' ? vehicles.find((item) => item.id === editing) : null
          return <div className="col-12 col-md-6" key={doc.key}>
            <label className="form-label" htmlFor={doc.key}>{doc.label}</label>
            <input id={doc.key} className="form-control" type="file" accept="application/pdf,.pdf" onChange={(event) => setFiles((existing) => ({ ...existing, [doc.key]: event.target.files?.[0] || null }))} />
            <div className="form-text">PDF, máximo 10 MB. {current?.[doc.key] ? 'Ya hay un documento guardado; subir otro lo sustituirá.' : ''}</div>
            {current?.[doc.key] && <button type="button" className="btn btn-sm btn-outline-primary mt-2" disabled={documentBusy === `${editing}-${doc.key}`} onClick={() => openDocument(current, doc.key)}>{documentBusy === `${editing}-${doc.key}` ? 'Abriendo…' : 'Ver PDF actual'}</button>}
          </div>
        })}
        <div className="col-12 mt-4"><h3 className="h6 border-bottom pb-2 mb-1">Estado del vehículo</h3></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="termination_date">Fecha de baja (opcional)</label><input id="termination_date" name="termination_date" type="date" className="form-control" value={form.termination_date || ''} onChange={change} /><div className="form-text">Al indicar una fecha, el vehículo pasa al archivo de bajas. No se elimina su ficha ni documentación.</div></div>
        <div className="col-12 d-flex gap-2 mt-4"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar vehículo'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setEditing(null); setFiles({}) }}>Cancelar</button></div>
      </form>
    </div></div>}

    {!editing && <div className="card border-0 shadow-sm"><div className="card-body p-3 p-md-4">
      <div className="d-flex flex-column flex-md-row gap-2 mb-3"><div className="btn-group" role="group" aria-label="Estado de vehículos"><button className={`btn ${!archive ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setArchive(false)}>Activos</button><button className={`btn ${archive ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setArchive(true)}>Bajas / archivo</button></div><input className="form-control" placeholder="Buscar por matrícula, marca o modelo…" aria-label="Buscar vehículo" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {loading ? <p className="text-secondary">Cargando vehículos…</p> : filtered.length === 0 ? <div className="text-center text-secondary py-4">No hay vehículos que coincidan con la búsqueda.</div> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Matrícula</th><th>Marca y modelo</th><th>ITV</th><th>Seguro</th><th>Estado</th><th className="text-end">Acciones</th></tr></thead><tbody>{filtered.map((vehicle) => <tr key={vehicle.id}><td className="fw-semibold text-uppercase">{vehicle.registration}</td><td>{vehicle.brand} {vehicle.model}</td><td>{vehicle.itv_expiry_date || '—'}</td><td>{vehicle.insurance_expiry_date || '—'}</td><td><span className={`badge ${vehicle.termination_date ? 'text-bg-secondary' : 'text-bg-success'}`}>{vehicle.termination_date ? `Baja: ${vehicle.termination_date}` : 'Activo'}</span></td><td><div className="d-flex flex-wrap justify-content-end gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(vehicle)}>Ver / editar</button><button className={`btn btn-sm ${vehicle.termination_date ? 'btn-outline-success' : 'btn-outline-danger'}`} onClick={() => toggleArchive(vehicle)}>{vehicle.termination_date ? 'Reactivar' : 'Dar de baja'}</button></div></td></tr>)}</tbody></table></div>}
      <div className="small text-secondary">{filtered.length} vehículos en este apartado.</div>
    </div></div>}
  </>
}
