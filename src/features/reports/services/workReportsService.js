import { supabase } from '../../../lib/supabase'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  }
  return supabase
}

function cleanEntry(entry, index) {
  const worksiteId = String(entry.worksiteId ?? '').trim()
  const activityDescription = String(entry.activityDescription ?? '').trim()
  const observations = String(entry.observations ?? '').trim()
  const incidentDetails = String(entry.incidentDetails ?? '').trim()
  const hasIncident = Boolean(entry.hasIncident)

  if (!worksiteId) throw new Error(`Selecciona una obra en el bloque ${index + 1}.`)
  if (!activityDescription) throw new Error(`Describe el trabajo realizado en el bloque ${index + 1}.`)
  if (hasIncident && !incidentDetails) {
    throw new Error(`Describe la incidencia del bloque ${index + 1}.`)
  }
  if (!Array.isArray(entry.participants) || entry.participants.length === 0) {
    throw new Error(`Añade al menos un trabajador al bloque ${index + 1}.`)
  }

  const participants = entry.participants.map((participant) => {
    const hours = Number(participant.hours)
    if (!participant.workerId || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
      throw new Error(`Indica las horas de cada trabajador en el bloque ${index + 1}.`)
    }
    const quarterHours = Math.round(hours * 4)
    if (Math.abs(hours * 4 - quarterHours) > 0.00001) {
      throw new Error(`Las horas del bloque ${index + 1} deben ir en incrementos de 0,25 horas.`)
    }
    return { worker_id: participant.workerId, hours }
  })

  if (new Set(participants.map((item) => item.worker_id)).size !== participants.length) {
    throw new Error(`Hay un trabajador duplicado en el bloque ${index + 1}.`)
  }

  return {
    worksite_id: worksiteId,
    activity_description: activityDescription,
    observations: observations || null,
    has_incident: hasIncident,
    incident_details: hasIncident ? incidentDetails : null,
    workers: participants,
  }
}

function cleanSchedule(schedule) {
  if (!schedule) return null

  const fields = {
    entry_time: schedule.entryTime || null,
    exit_time: schedule.exitTime || null,
  }

  if (!fields.entry_time || !fields.exit_time) {
    throw new Error('Indica la hora de entrada y la hora de salida de la jornada completa.')
  }
  if (fields.entry_time === fields.exit_time) {
    throw new Error('La hora de entrada y la hora de salida no pueden ser iguales.')
  }

  return { ...fields, update_auth_user: Boolean(schedule.dirty) }
}

export async function getWorkdaySchedule(workDate, workerId = null) {
  const client = requireSupabase()
  if (!workDate) throw new Error('Selecciona la fecha del trabajo.')
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
  const targetWorkerId = workerId || authData.user.id

  const { data, error } = await client
    .from('workday_schedules')
    .select('work_date, entry_time, exit_time')
    .eq('worker_id', targetWorkerId)
    .eq('work_date', workDate)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function createWorkReport({ workDate, entries, schedule = null }) {
  const client = requireSupabase()
  if (!workDate) throw new Error('Selecciona la fecha del trabajo.')
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Añade al menos una obra al parte.')
  }
  if (entries.length > 20) throw new Error('Puedes registrar hasta 20 bloques de trabajo en un mismo envío.')

  const cleanEntries = entries.map(cleanEntry)
  const cleanWorkdaySchedule = cleanSchedule(schedule)
  const totalsByWorker = new Map()
  for (const entry of cleanEntries) {
    for (const participant of entry.workers) {
      totalsByWorker.set(
        participant.worker_id,
        (totalsByWorker.get(participant.worker_id) ?? 0) + participant.hours,
      )
    }
  }
  for (const [, totalHours] of totalsByWorker) {
    if (totalHours > 24) {
      throw new Error('La suma de horas de una persona en el día no puede superar las 24 horas. Revisa sus horas en cada obra.')
    }
  }

  const { data, error } = await client.rpc('create_work_reports_batch_with_schedule', {
    p_work_date: workDate,
    p_entries: cleanEntries,
    p_schedule: cleanWorkdaySchedule,
  })

  if (error) {
    if (error.message?.includes('create_work_reports_batch_with_schedule') && error.message?.toLowerCase().includes('schema cache')) {
      throw new Error('Falta instalar las migraciones de horario diario en Supabase. Ejecuta el SQL incluido en la actualización y vuelve a intentarlo.')
    }
    throw error
  }
  return data
}

// Permite al administrador guardar el horario diario de un trabajador concreto.
export async function saveWorkdayScheduleForWorker(workerId, workDate, schedule) {
  const client = requireSupabase()
  if (!workerId || !workDate) throw new Error('Selecciona el trabajador y la fecha del horario.')
  const fields = {
    worker_id: workerId,
    work_date: workDate,
    entry_time: schedule.entryTime || null,
    exit_time: schedule.exitTime || null,
    updated_at: new Date().toISOString(),
  }
  if (!fields.entry_time || !fields.exit_time) {
    throw new Error('Indica la hora de entrada y la hora de salida de la jornada completa.')
  }
  if (fields.entry_time === fields.exit_time) {
    throw new Error('La hora de entrada y la hora de salida no pueden ser iguales.')
  }
  const query = client.from('workday_schedules').upsert(fields, { onConflict: 'worker_id,work_date' })
  const { error } = await query
  if (error) throw error
}
