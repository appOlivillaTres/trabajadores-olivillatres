import { supabase } from '../../../lib/supabase'

const REPORT_BATCH_SIZE = 100
const PAGE_SIZE = 200
const PROFILE_BATCH_SIZE = 100

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  return supabase
}

export async function getReportChangeHistoryForReports(reportIds = []) {
  const client = requireSupabase()
  const ids = [...new Set((reportIds ?? []).filter(Boolean))]
  if (!ids.length) return []

  const entries = []
  for (let index = 0; index < ids.length; index += REPORT_BATCH_SIZE) {
    const batch = ids.slice(index, index + REPORT_BATCH_SIZE)
    let offset = 0
    while (true) {
      const { data, error } = await client
        .from('report_change_history')
        .select('id, report_id, correction_request_id, target_type, target_worker_row_id, field_name, old_value, new_value, changed_by, changed_at')
        .in('report_id', batch)
        .order('changed_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) {
        if (error.message?.includes('report_change_history')) {
          throw new Error('Falta instalar la migración SQL de correcciones y auditoría en Supabase.')
        }
        throw error
      }
      entries.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }

  if (!entries.length) return []
  const actorIds = [...new Set(entries.map((entry) => entry.changed_by).filter(Boolean))]
  const profiles = []
  for (let index = 0; index < actorIds.length; index += PROFILE_BATCH_SIZE) {
    const batch = actorIds.slice(index, index + PROFILE_BATCH_SIZE)
    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, username')
      .in('id', batch)
    if (error) throw error
    profiles.push(...(data ?? []))
  }
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]))
  return entries.map((entry) => ({ ...entry, actor: profilesById.get(entry.changed_by) ?? null }))
}
