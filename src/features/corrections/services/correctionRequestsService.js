import { supabase } from '../../../lib/supabase'
import { getReportsWithDetails } from '../../reports/services/reportsQueryService'

const PAGE_SIZE = 200
const IN_BATCH_SIZE = 100

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  }
  return supabase
}

function migrationHint(error) {
  if (error?.message?.includes('create_add_worksite_correction_request_v2') || error?.message?.includes('resolve_add_worksite_correction_request_v2') || error?.message?.includes('requested_participants')) {
    return new Error('Falta instalar la migración para solicitudes de obra con varios trabajadores. Ejecuta supabase/migrations/20261025_multiworker_worksite_corrections.sql en Supabase y vuelve a intentarlo.')
  }
  if (error?.message?.includes('create_add_worksite_correction_request') || error?.message?.includes('resolve_add_worksite_correction_request') || error?.message?.includes('requested_worksite_id') || error?.message?.includes('requested_activity_description')) {
    return new Error('Falta instalar la migración para solicitudes de añadir una obra. Ejecuta supabase/migrations/20261024_add_worksite_correction_requests.sql en Supabase y vuelve a intentarlo.')
  }
  if (error?.message?.includes('create_correction_request') || error?.message?.includes('resolve_correction_request') || error?.message?.includes('correction_requests')) {
    return new Error('Falta instalar la migración SQL de solicitudes de corrección en Supabase. Ejecuta la migración de solicitudes de corrección y vuelve a intentarlo.')
  }
  return error
}

export async function createCorrectionRequest({
  reportId,
  targetType,
  targetWorkerRowId = null,
  fieldName,
  reason,
  suggestedValue = '',
  requestedWorksiteId = '',
  requestedActivityDescription = '',
  requestedHours = '',
  requestedParticipants = [],
  requestedObservations = '',
  requestedHasIncident = false,
  requestedIncidentDetails = '',
}) {
  const client = requireSupabase()
  const cleanReason = String(reason ?? '').trim()
  if (cleanReason.length < 5) throw new Error('Explica el error con al menos 5 caracteres.')
  if (cleanReason.length > 2000) throw new Error('La explicación no puede superar los 2000 caracteres.')

  if (targetType === 'new_worksite') {
    const hours = Number(String(requestedHours ?? '').replace(',', '.'))
    if (!requestedWorksiteId) throw new Error('Selecciona la obra que falta.')
    if (!String(requestedActivityDescription ?? '').trim()) throw new Error('Describe el trabajo realizado en esa obra.')
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.abs(hours * 4 - Math.round(hours * 4)) > 0.00001) {
      throw new Error('Las horas deben ser mayores que 0, como máximo 24 y en incrementos de 0,25.')
    }
    if (requestedHasIncident && !String(requestedIncidentDetails ?? '').trim()) {
      throw new Error('Describe la incidencia o desmarca la opción de incidencia.')
    }
    const participants = (requestedParticipants ?? []).map((participant) => ({
      worker_id: participant.workerId ?? participant.worker_id,
      hours: Number(String(participant.hours ?? '').replace(',', '.')),
    }))
    if (!participants.length) throw new Error('Selecciona al menos un trabajador e indica sus horas.')
    if (participants.some((participant) => !participant.worker_id || !Number.isFinite(participant.hours) || participant.hours <= 0 || participant.hours > 24 || Math.abs(participant.hours * 4 - Math.round(participant.hours * 4)) > 0.00001)) {
      throw new Error('Revisa las horas de cada trabajador: deben ser entre 0,25 y 24, en incrementos de 0,25.')
    }
    const uniqueIds = new Set(participants.map((participant) => participant.worker_id))
    if (uniqueIds.size !== participants.length) throw new Error('Hay un trabajador repetido en la solicitud.')
    const { data, error } = await client.rpc('create_add_worksite_correction_request_v2', {
      p_report_id: reportId,
      p_worksite_id: requestedWorksiteId,
      p_activity_description: String(requestedActivityDescription).trim(),
      p_participants: participants,
      p_reason: cleanReason,
      p_observations: String(requestedObservations ?? '').trim() || null,
      p_has_incident: Boolean(requestedHasIncident),
      p_incident_details: requestedHasIncident ? String(requestedIncidentDetails ?? '').trim() || null : null,
    })
    if (error) throw migrationHint(error)
    return data
  }

  const { data, error } = await client.rpc('create_correction_request', {
    p_report_id: reportId,
    p_target_type: targetType,
    p_target_worker_row_id: targetWorkerRowId,
    p_field_name: fieldName,
    p_reason: cleanReason,
    p_suggested_value: String(suggestedValue ?? '').trim() || null,
  })
  if (error) throw migrationHint(error)
  return data
}

export async function getCorrectionRequestsForReports(reportIds = []) {
  const client = requireSupabase()
  const ids = [...new Set((reportIds ?? []).filter(Boolean))]
  if (!ids.length) return []

  const requests = []
  for (let index = 0; index < ids.length; index += IN_BATCH_SIZE) {
    const batch = ids.slice(index, index + IN_BATCH_SIZE)
    const { data, error } = await client
      .from('correction_requests')
      .select('id, report_id, requested_by, target_type, target_worker_row_id, field_name, reason, suggested_value, status, admin_response, resolved_by, resolved_at, created_at, updated_at, requested_worksite_id, requested_activity_description, requested_hours, requested_observations, requested_has_incident, requested_incident_details, requested_participants')
      .in('report_id', batch)
      .order('created_at', { ascending: false })
    if (error) throw migrationHint(error)
    requests.push(...(data ?? []))
  }
  return enrichRequestedParticipants(requests)
}

async function enrichRequestedParticipants(requests) {
  const client = requireSupabase()
  const workerIds = [...new Set((requests ?? []).flatMap((request) =>
    (request.requested_participants ?? []).map((participant) => participant.worker_id).filter(Boolean),
  ))]
  if (!workerIds.length) return requests
  const profiles = []
  for (let index = 0; index < workerIds.length; index += IN_BATCH_SIZE) {
    const batch = workerIds.slice(index, index + IN_BATCH_SIZE)
    const { data, error } = await client.from('profiles').select('id, username, display_name').in('id', batch)
    if (error) throw error
    profiles.push(...(data ?? []))
  }
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))
  return requests.map((request) => ({
    ...request,
    requested_participants: (request.requested_participants ?? []).map((participant) => ({
      ...participant,
      worker: byId.get(participant.worker_id) ?? null,
    })),
  }))
}

export async function getPendingCorrectionRequests(filters = {}) {
  const client = requireSupabase()
  const requests = []
  let offset = 0

  while (true) {
    const { data, error } = await client
      .from('correction_requests')
      .select('id, report_id, requested_by, target_type, target_worker_row_id, field_name, reason, suggested_value, status, admin_response, resolved_by, resolved_at, created_at, updated_at, requested_worksite_id, requested_activity_description, requested_hours, requested_observations, requested_has_incident, requested_incident_details, requested_participants')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw migrationHint(error)
    requests.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (!requests.length) return []

  const reportIds = [...new Set(requests.map((request) => request.report_id))]
  const reports = []
  for (let index = 0; index < reportIds.length; index += IN_BATCH_SIZE) {
    const batch = reportIds.slice(index, index + IN_BATCH_SIZE)
    reports.push(...await getReportsWithDetails({ ...filters, reportIds: batch }))
  }

  const reportsById = new Map(reports.map((report) => [report.id, report]))
  const matchingRequests = requests.filter((request) => reportsById.has(request.report_id))
  if (!matchingRequests.length) return []

  const requesterIds = [...new Set(matchingRequests.map((request) => request.requested_by))]
  const requesterProfiles = []
  for (let index = 0; index < requesterIds.length; index += IN_BATCH_SIZE) {
    const batch = requesterIds.slice(index, index + IN_BATCH_SIZE)
    const { data, error } = await client
      .from('profiles')
      .select('id, username, display_name')
      .in('id', batch)
    if (error) throw error
    requesterProfiles.push(...(data ?? []))
  }

  const profilesById = new Map(requesterProfiles.map((profile) => [profile.id, profile]))

  const withPeople = await enrichRequestedParticipants(matchingRequests)
  return withPeople.map((request) => ({
    ...request,
    requester: profilesById.get(request.requested_by) ?? null,
    report: reportsById.get(request.report_id),
  }))
}

export async function resolveCorrectionRequest({ requestId, decision, correctedValue = '', adminResponse = '', targetType = '' }) {
  const client = requireSupabase()
  if (decision === 'rejected' && String(adminResponse).trim().length < 3) {
    throw new Error('Explica al trabajador por qué se rechaza la solicitud.')
  }
  if (targetType === 'new_worksite') {
    const { data, error } = await client.rpc('resolve_add_worksite_correction_request_v2', {
      p_request_id: requestId,
      p_decision: decision,
      p_admin_response: String(adminResponse ?? '').trim() || null,
    })
    if (error) throw migrationHint(error)
    return data
  }
  const { data, error } = await client.rpc('resolve_correction_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_corrected_value: decision === 'accepted' ? String(correctedValue) : null,
    p_admin_response: String(adminResponse ?? '').trim() || null,
  })
  if (error) throw migrationHint(error)
  return data
}
