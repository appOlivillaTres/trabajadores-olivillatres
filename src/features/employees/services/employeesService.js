import { supabase } from '../../../lib/supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
}

export async function getActiveWorkers() {
  const workers = await getWorkers()
  return workers.filter((worker) => worker.active)
}

export async function getWorkers() {
  requireSupabase()
  const { data, error } = await supabase.from('profiles')
    .select('id, username, display_name, role, active')
    .eq('role', 'worker').order('display_name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createWorkerAccount({ username, displayName, password }) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('admin-manage-worker', {
    body: { action: 'create', username, displayName, password },
  })
  if (error) throw new Error(await getFunctionError(error))
  if (data?.error) throw new Error(data.error)
  return data
}

export async function resetWorkerPassword({ workerId, password }) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('admin-manage-worker', {
    body: { action: 'reset-password', workerId, password },
  })
  if (error) throw new Error(await getFunctionError(error))
  if (data?.error) throw new Error(data.error)
  return data
}

async function getFunctionError(error) {
  try {
    const body = await error.context?.json?.()
    if (body?.error) return body.error
  } catch { /* mensaje genérico de Functions */ }
  return error.message || 'No se ha podido completar la operación.'
}

export async function setWorkerActive(workerId, active) {
  requireSupabase()
  const { error } = await supabase.from('profiles').update({ active }).eq('id', workerId).eq('role', 'worker')
  if (error) throw error
}
