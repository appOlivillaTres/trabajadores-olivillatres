import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = {
  first_name: '', last_name: '', dni: '', social_security_number: '', phone: '',
  address: '', population: '', province: '', observations: '', has_driving_license: false,
  hire_date: new Date().toISOString().slice(0, 10), termination_date: '',
}
const BUCKET = 'worker-documents'
const DOCUMENTS = [
  { key: 'dni_pdf_path', label: 'DNI / NIE (PDF con ambas caras)' },
  { key: 'social_security_pdf_path', label: 'Tarjeta de la Seguridad Social (PDF con ambas caras)' },
  { key: 'driving_license_pdf_path', label: 'Carnet de conducir (PDF)' },
]

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa .env.local.')
}

async function loadRecords() {
  requireSupabase()
  const { data, error } = await supabase.from('worker_records').select('*').order('last_name').order('first_name')
  if (error) throw error
  return data ?? []
}

function safeFileName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
}

async function uploadPdf(recordId, key, file) {
  if (!file) return undefined
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Solo se admiten archivos PDF.')
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Cada PDF debe pesar como máximo 10 MB.')
  const path = `${recordId}/${key.replace('_pdf_path', '')}-${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
  return path
}

export default function EmployeesPage() {
  const [records, setRecords] = useState([])
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
    try { setRecords(await loadRecords()) }
    catch (error) { setNotice({ type: 'danger', text: error.message || 'No se pudieron cargar las fichas. Comprueba que la migración SQL esté aplicada.' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => records.filter((record) => {
    const term = search.trim().toLocaleLowerCase('es')
    const text = `${record.first_name} ${record.last_name} ${record.dni}`.toLocaleLowerCase('es')
    return Boolean(record.termination_date) === archive && (!term || text.includes(term))
  }), [records, search, archive])

  function startNew() {
    setEditing('new'); setForm(EMPTY); setFiles({}); setNotice(null)
  }
  function startEdit(record) {
    setEditing(record.id)
    setForm({ ...EMPTY, ...record, hire_date: record.hire_date || '', termination_date: record.termination_date || '', has_driving_license: Boolean(record.has_driving_license) })
    setFiles({}); setNotice(null)
  }
  function change(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function save(event) {
    event.preventDefault(); setNotice(null); setSaving(true)
    let createdId = editing !== 'new' ? editing : null
    try {
      if (!form.first_name.trim() || !form.last_name.trim() || !form.dni.trim()) throw new Error('Nombre, apellidos y DNI/NIE son obligatorios.')
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const payload = {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), dni: form.dni.trim().toUpperCase(),
        social_security_number: form.social_security_number.trim() || null, phone: form.phone.trim() || null,
        address: form.address.trim() || null, population: form.population.trim() || null, province: form.province.trim() || null,
        observations: form.observations.trim() || null, has_driving_license: Boolean(form.has_driving_license),
        hire_date: form.hire_date || null, termination_date: form.termination_date || null,
        updated_by: authData.user?.id || null,
      }
      let result
      if (editing === 'new') {
        result = await supabase.from('worker_records').insert({ ...payload, created_by: authData.user?.id || null }).select('id').single()
        if (result.error) throw result.error
        createdId = result.data.id
      } else {
        result = await supabase.from('worker_records').update(payload).eq('id', editing).select('id').single()
        if (result.error) throw result.error
      }
      const docPatch = {}
      for (const doc of DOCUMENTS) {
        if (doc.key === 'driving_license_pdf_path' && !form.has_driving_license) {
          const oldPath = records.find((item) => item.id === createdId)?.[doc.key]
          if (oldPath) {
            const { error } = await supabase.storage.from(BUCKET).remove([oldPath])
            if (error) throw error
            docPatch[doc.key] = null
          }
          continue
        }
        const uploaded = await uploadPdf(createdId, doc.key, files[doc.key])
        if (uploaded) {
          docPatch[doc.key] = uploaded
          const oldPath = records.find((item) => item.id === createdId)?.[doc.key]
          if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
        }
      }
      if (Object.keys(docPatch).length) {
        const { error } = await supabase.from('worker_records').update(docPatch).eq('id', createdId)
        if (error) throw error
      }
      setNotice({ type: 'success', text: editing === 'new' ? 'Ficha creada correctamente.' : 'Ficha guardada correctamente.' })
      setEditing(null); setFiles({}); await load()
    } catch (error) {
      setNotice({ type: 'danger', text: error.message || 'No se ha podido guardar la ficha.' })
    } finally { setSaving(false) }
  }

  async function openDocument(record, key) {
    const path = record[key]
    if (!path) return
    setDocumentBusy(`${record.id}-${key}`)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (error) { setNotice({ type: 'danger', text: error.message || 'No se ha podido abrir el documento.' }) }
    finally { setDocumentBusy('') }
  }

  async function toggleArchive(record) {
    const isArchived = Boolean(record.termination_date)
    const date = isArchived ? null : new Date().toISOString().slice(0, 10)
    const message = isArchived ? `¿Reactivar la ficha de ${record.first_name} ${record.last_name}?` : `¿Dar de baja y archivar la ficha de ${record.first_name} ${record.last_name}?`
    if (!window.confirm(message)) return
    setNotice(null)
    const { error } = await supabase.from('worker_records').update({ termination_date: date }).eq('id', record.id)
    if (error) setNotice({ type: 'danger', text: error.message || 'No se ha podido cambiar el estado.' })
    else { setNotice({ type: 'success', text: isArchived ? 'Ficha reactivada.' : 'Ficha archivada.' }); await load() }
  }

  return <>
    <div className="d-flex flex-column flex-md-row justify-content-between gap-3 mb-4">
      <div><h1 className="h2 fw-bold mb-1">Fichas de trabajadores</h1><p className="text-secondary mb-0">Datos laborales y documentación privada de cada trabajador.</p></div>
      {!archive && !editing && <button className="btn btn-success align-self-md-start" onClick={startNew}>+ Añadir trabajador</button>}
    </div>
    {notice && <div className={`alert alert-${notice.type}`} role="alert">{notice.text}</div>}

    {editing && <div className="card border-0 shadow-sm mb-4"><div className="card-body p-4">
      <h2 className="h5 mb-3">{editing === 'new' ? 'Nueva ficha' : 'Editar ficha'}</h2>
      <form onSubmit={save} className="row g-3">
        <div className="col-12 col-md-4"><label className="form-label" htmlFor="first_name">Nombre *</label><input id="first_name" name="first_name" className="form-control" value={form.first_name} onChange={change} required maxLength={100}/></div>
        <div className="col-12 col-md-4"><label className="form-label" htmlFor="last_name">Apellidos *</label><input id="last_name" name="last_name" className="form-control" value={form.last_name} onChange={change} required maxLength={150}/></div>
        <div className="col-12 col-md-4"><label className="form-label" htmlFor="dni">DNI / NIE *</label><input id="dni" name="dni" className="form-control" value={form.dni} onChange={change} required maxLength={20}/></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="social_security_number">Número de la Seguridad Social</label><input id="social_security_number" name="social_security_number" className="form-control" value={form.social_security_number || ''} onChange={change} maxLength={30}/></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="phone">Teléfono</label><input id="phone" name="phone" type="tel" className="form-control" value={form.phone || ''} onChange={change} maxLength={40}/></div>
        <div className="col-12"><label className="form-label" htmlFor="address">Dirección</label><input id="address" name="address" className="form-control" value={form.address || ''} onChange={change} maxLength={200}/></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="population">Población</label><input id="population" name="population" className="form-control" value={form.population || ''} onChange={change} maxLength={100}/></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="province">Provincia</label><input id="province" name="province" className="form-control" value={form.province || ''} onChange={change} maxLength={100}/></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="hire_date">Fecha de alta</label><input id="hire_date" name="hire_date" type="date" className="form-control" value={form.hire_date || ''} onChange={change}/></div>
        <div className="col-12 col-md-6"><label className="form-label" htmlFor="termination_date">Fecha de baja</label><input id="termination_date" name="termination_date" type="date" className="form-control" value={form.termination_date || ''} onChange={change}/><div className="form-text">Al indicar una fecha, la ficha aparecerá en el archivo de bajas.</div></div>
        <div className="col-12"><label className="form-label" htmlFor="observations">Observaciones (opcional)</label><textarea id="observations" name="observations" className="form-control" rows="3" value={form.observations || ''} onChange={change} maxLength={5000}/></div>
        <div className="col-12"><div className="form-check form-switch"><input id="has_driving_license" name="has_driving_license" className="form-check-input" type="checkbox" role="switch" checked={Boolean(form.has_driving_license)} onChange={change}/><label className="form-check-label" htmlFor="has_driving_license">Tiene carnet de conducir</label></div></div>
        {DOCUMENTS.filter((doc) => doc.key !== 'driving_license_pdf_path' || form.has_driving_license).map((doc) => <div className="col-12 col-lg-4" key={doc.key}><label className="form-label" htmlFor={doc.key}>{doc.label}</label><input id={doc.key} className="form-control" type="file" accept="application/pdf,.pdf" onChange={(event) => setFiles((current) => ({ ...current, [doc.key]: event.target.files?.[0] || null }))}/><div className="form-text">PDF, máximo 10 MB. {editing !== 'new' && records.find((r) => r.id === editing)?.[doc.key] && 'Ya hay un documento guardado; subir otro lo sustituirá.'}</div>{editing !== 'new' && records.find((r) => r.id === editing)?.[doc.key] && <button type="button" className="btn btn-sm btn-outline-primary mt-2" disabled={documentBusy === `${editing}-${doc.key}`} onClick={() => openDocument(records.find((r) => r.id === editing), doc.key)}>{documentBusy === `${editing}-${doc.key}` ? 'Abriendo…' : 'Ver PDF actual'}</button>}</div>)}
        <div className="col-12 d-flex gap-2"><button className="btn btn-success" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ficha'}</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setEditing(null); setFiles({}) }}>Cancelar</button></div>
      </form>
    </div></div>}

    {!editing && <div className="card border-0 shadow-sm"><div className="card-body p-3 p-md-4">
      <div className="d-flex flex-column flex-md-row gap-2 mb-3"><div className="btn-group" role="group" aria-label="Estado de fichas"><button className={`btn ${!archive ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setArchive(false)}>Fichas activas</button><button className={`btn ${archive ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setArchive(true)}>Bajas / archivo</button></div><input className="form-control" placeholder="Buscar por nombre, apellidos o DNI…" aria-label="Buscar ficha" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
      {loading ? <p className="text-secondary">Cargando fichas…</p> : filtered.length === 0 ? <div className="text-center text-secondary py-4">No hay fichas que coincidan con la búsqueda.</div> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Trabajador</th><th>DNI / NIE</th><th>Teléfono</th><th>Estado</th><th className="text-end">Acciones</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.id}><td className="fw-semibold">{record.last_name}, {record.first_name}</td><td>{record.dni}</td><td>{record.phone || '—'}</td><td><span className={`badge ${record.termination_date ? 'text-bg-secondary' : 'text-bg-success'}`}>{record.termination_date ? `Baja: ${record.termination_date}` : 'Activa'}</span></td><td><div className="d-flex flex-wrap justify-content-end gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => startEdit(record)}>Ver / editar</button><button className={`btn btn-sm ${record.termination_date ? 'btn-outline-success' : 'btn-outline-danger'}`} onClick={() => toggleArchive(record)}>{record.termination_date ? 'Reactivar' : 'Dar de baja'}</button></div></td></tr>)}</tbody></table></div>}
      <div className="small text-secondary">{filtered.length} fichas en este apartado.</div>
    </div></div>}
  </>
}
