import { useState } from 'react'

const FIELD_LABELS = {
  work_date: 'Fecha del trabajo',
  worksite_id: 'Obra',
  activity_description: 'Trabajo realizado',
  observations: 'Observaciones',
  has_incident: 'Si hubo incidencia',
  incident_details: 'Detalle de la incidencia',
  hours: 'Horas',
  review_status: 'Estado de revisión',
}

function formatDateTime(value) {
  if (!value) return 'Fecha desconocida'
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function displayValue(value, fieldName) {
  if (value === null || value === undefined || value === '') return '— vacío —'
  if (fieldName === 'has_incident') return value === 'true' ? 'Sí' : 'No'
  if (fieldName === 'review_status') {
    return ({ pending: 'Pendiente', approved: 'Revisado', needs_changes: 'Necesita corrección' })[value] ?? value
  }
  return String(value)
}

export default function ReportChangeHistory({ entries = [] }) {
  const [open, setOpen] = useState(false)
  if (!entries.length) return null

  return (
    <section className="mt-3 border-top pt-3">
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? 'Ocultar historial de cambios' : `Ver historial de cambios (${entries.length})`}
      </button>
      {open && (
        <div className="table-responsive mt-3">
          <table className="table table-sm align-middle mb-0">
            <thead><tr><th>Fecha</th><th>Dato</th><th>Antes</th><th>Después</th><th>Modificado por</th></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="text-nowrap">{formatDateTime(entry.changed_at)}</td>
                  <td>{FIELD_LABELS[entry.field_name] ?? entry.field_name}</td>
                  <td style={{ whiteSpace: 'pre-wrap', minWidth: '8rem' }}>{displayValue(entry.old_value, entry.field_name)}</td>
                  <td style={{ whiteSpace: 'pre-wrap', minWidth: '8rem' }}>{displayValue(entry.new_value, entry.field_name)}</td>
                  <td>{entry.actor?.display_name ?? 'Administrador'}{entry.actor?.username ? ` (${entry.actor.username})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
