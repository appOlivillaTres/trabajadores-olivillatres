import { supabase } from '../../../lib/supabase'

const PAGE_SIZE = 200
const IN_BATCH_SIZE = 100

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  }
  return supabase
}

async function fetchByIds(table, select, column, ids) {
  const client = requireSupabase()
  const rows = []

  for (let index = 0; index < ids.length; index += IN_BATCH_SIZE) {
    const batch = ids.slice(index, index + IN_BATCH_SIZE)
    if (!batch.length) continue

    const { data, error } = await client
      .from(table)
      .select(select)
      .in(column, batch)

    if (error) throw error
    rows.push(...(data ?? []))
  }

  return rows
}

/**
 * Lee los partes visibles para la sesión actual. Supabase RLS determina qué
 * filas puede ver cada usuario; los filtros del cliente no sustituyen RLS.
 */
export async function getReportsWithDetails({
  fromDate = '',
  toDate = '',
  workerId = '',
  hasIncidentOnly = false,
  searchText = '',
  reportIds: filterReportIds = null,
} = {}) {
  const client = requireSupabase()
  if (Array.isArray(filterReportIds) && filterReportIds.length === 0) return []
  const rows = []
  let offset = 0

  while (true) {
    let query = client
      .from('work_reports')
      .select('id, submission_id, work_date, worksite_id, created_by, activity_description, observations, has_incident, incident_details, review_status, created_at, updated_at')
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (fromDate) query = query.gte('work_date', fromDate)
    if (toDate) query = query.lte('work_date', toDate)
    if (hasIncidentOnly) query = query.eq('has_incident', true)
    if (Array.isArray(filterReportIds)) query = query.in('id', filterReportIds)

    const { data, error } = await query
    if (error) throw error

    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (!rows.length) return []

  const reportIds = rows.map((row) => row.id)
  const worksiteIds = [...new Set(rows.map((row) => row.worksite_id).filter(Boolean))]
  const profileIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))]

  // Las obras no dependen de los participantes: pedirlas en paralelo evita
  // una espera de red innecesaria cuando el historial contiene muchos partes.
  const [participants, worksites] = await Promise.all([
    fetchByIds(
      'work_report_workers',
      'id, report_id, worker_id, hours, created_at',
      'report_id',
      reportIds,
    ),
    fetchByIds('worksites', 'id, name, address, active', 'id', worksiteIds),
  ])
  profileIds.push(...participants.map((participant) => participant.worker_id).filter(Boolean))

  const profiles = await fetchByIds(
    'profiles',
    'id, username, display_name, role, active',
    'id',
    [...new Set(profileIds)],
  )

  const worksitesById = new Map(worksites.map((row) => [row.id, row]))
  const profilesById = new Map(profiles.map((row) => [row.id, row]))
  const participantsByReport = new Map()

  for (const participant of participants) {
    const list = participantsByReport.get(participant.report_id) ?? []
    list.push({
      ...participant,
      profile: profilesById.get(participant.worker_id) ?? null,
    })
    participantsByReport.set(participant.report_id, list)
  }

  let detailed = rows.map((row) => ({
    ...row,
    worksite: worksitesById.get(row.worksite_id) ?? null,
    author: profilesById.get(row.created_by) ?? null,
    participants: (participantsByReport.get(row.id) ?? []).sort((a, b) =>
      (a.profile?.display_name ?? '').localeCompare(b.profile?.display_name ?? '', 'es'),
    ),
  }))

  if (workerId) {
    detailed = detailed.filter((report) =>
      report.participants.some((participant) => participant.worker_id === workerId),
    )
  }

  const normalizedSearch = normalizeSearchText(searchText)
  if (normalizedSearch) {
    detailed = detailed.filter((report) => {
      const searchableValues = [
        report.worksite?.name,
        report.worksite?.address,
        report.activity_description,
        report.observations,
        report.incident_details,
      ]
      return searchableValues.some((value) => normalizeSearchText(value).includes(normalizedSearch))
    })
  }

  return detailed
}

export async function getWorkersForFilter() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, active, role')
    .eq('role', 'worker')
    .order('display_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function updateReportReviewStatus(reportId, reviewStatus) {
  const client = requireSupabase()
  const allowedStatuses = ['pending', 'approved', 'needs_changes']
  if (!allowedStatuses.includes(reviewStatus)) {
    throw new Error('El estado de revisión seleccionado no es válido.')
  }

  const { data, error } = await client.rpc('set_work_report_review_status', {
    p_report_id: reportId,
    p_review_status: reviewStatus,
    p_comment: null,
  })

  if (error) {
    if (error.message?.includes('set_work_report_review_status')) {
      throw new Error('Falta instalar la migración SQL de correcciones y auditoría en Supabase.')
    }
    throw error
  }
  return { id: reportId, review_status: data }
}

export async function updateWorkReportDirectly(reportId, values) {
  const client = requireSupabase()
  const workerHours = (values.workerHours ?? []).map((item) => ({
    worker_row_id: item.workerRowId,
    hours: String(item.hours),
  }))

  const { data, error } = await client.rpc('admin_update_work_report', {
    p_report_id: reportId,
    p_work_date: values.workDate,
    p_worksite_id: values.worksiteId,
    p_activity_description: values.activityDescription,
    p_observations: values.observations || null,
    p_has_incident: Boolean(values.hasIncident),
    p_incident_details: values.hasIncident ? values.incidentDetails || null : null,
    p_worker_hours: workerHours,
  })

  if (error) {
    if (error.message?.includes('admin_update_work_report')) {
      throw new Error('Falta instalar la versión actualizada de la migración SQL, que incluye la edición directa del administrador.')
    }
    throw error
  }
  return data
}
