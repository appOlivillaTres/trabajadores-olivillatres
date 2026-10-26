import { supabase } from '../../../lib/supabase'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  }
  return supabase
}

/**
 * Lee los horarios diarios de un intervalo. RLS permite al administrador
 * consultar todos los horarios; el filtro de trabajador reduce la consulta
 * cuando la pantalla ya tiene una persona seleccionada.
 */
export async function getWorkdaySchedulesForRange({ fromDate = '', toDate = '', workerId = '' } = {}) {
  const client = requireSupabase()
  const rows = []
  const pageSize = 500
  let offset = 0

  while (true) {
    let query = client
      .from('workday_schedules')
      .select('worker_id, work_date, entry_time, exit_time')
      .order('work_date', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (fromDate) query = query.gte('work_date', fromDate)
    if (toDate) query = query.lte('work_date', toDate)
    if (workerId) query = query.eq('worker_id', workerId)

    const { data, error } = await query
    if (error) throw error

    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    offset += pageSize
  }

  return rows
}
