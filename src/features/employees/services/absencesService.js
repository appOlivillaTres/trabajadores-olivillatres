import { supabase } from '../../../lib/supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
}

export async function getAbsences({ from, to, workerId = '', absenceType = '' } = {}) {
  requireSupabase()
  let query = supabase.from('absences')
    .select('id, worker_id, absence_type, starts_on, ends_on, admin_note, created_at, profiles:profiles!absences_worker_id_fkey(id, display_name, username, active)')
    .lte('starts_on', to || '9999-12-31').gte('ends_on', from || '0001-01-01')
    .order('starts_on', { ascending: true })
  if (workerId) query = query.eq('worker_id', workerId)
  if (absenceType) query = query.eq('absence_type', absenceType)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function saveAbsence(absence) {
  requireSupabase()
  const payload = {
    worker_id: absence.worker_id,
    absence_type: absence.absence_type,
    starts_on: absence.starts_on,
    ends_on: absence.ends_on,
    admin_note: absence.admin_note?.trim() || null,
  }
  if (!absence.id) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (authData.user?.id) payload.created_by = authData.user.id
  }
  const query = absence.id
    ? supabase.from('absences').update(payload).eq('id', absence.id)
    : supabase.from('absences').insert(payload)
  const { error } = await query
  if (error) {
    if (error.code === '23P01' || /overlap|solap/i.test(error.message)) throw new Error('Este trabajador ya tiene una ausencia que coincide con esas fechas.')
    throw error
  }
}

export async function deleteAbsence(id) {
  requireSupabase()
  const { error } = await supabase.from('absences').delete().eq('id', id)
  if (error) throw error
}


// Comprueba únicamente la ausencia del usuario autenticado, sin exponer al trabajador
// el listado administrativo de ausencias de otras personas.
export async function hasCurrentWorkerAbsence(workDate) {
  requireSupabase()
  const { data, error } = await supabase.rpc('has_current_worker_absence', { p_work_date: workDate })
  if (error) throw error
  return Boolean(data)
}
