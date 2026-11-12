import { supabase } from '../../../lib/supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  return supabase
}

export async function getWorksites() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('worksites')
    .select('id, name, address, active, created_at')
    .order('active', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createWorksite({ name, address }) {
  const client = requireSupabase()
  const cleanName = String(name ?? '').trim()
  const cleanAddress = String(address ?? '').trim()
  if (!cleanName) throw new Error('Escribe el nombre de la obra.')
  if (cleanName.length > 120) throw new Error('El nombre no puede superar los 120 caracteres.')
  if (cleanAddress.length > 250) throw new Error('La dirección no puede superar los 250 caracteres.')

  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!userResult.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')

  const { data, error } = await client
    .from('worksites')
    .insert({ name: cleanName, address: cleanAddress || null, created_by: userResult.user.id })
    .select('id, name, address, active, created_at')
    .single()
  if (error) throw error
  return data
}

export async function updateWorksiteStatus(id, active) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('worksites')
    .update({ active })
    .eq('id', id)
    .select('id, name, address, active, created_at')
    .single()
  if (error) throw error
  return data
}


export async function updateWorksite(id, { name, address }) {
  const client = requireSupabase()
  const cleanName = String(name ?? '').trim()
  const cleanAddress = String(address ?? '').trim()
  if (!cleanName) throw new Error('Escribe el nombre de la obra.')
  if (cleanName.length > 120) throw new Error('El nombre no puede superar los 120 caracteres.')
  if (cleanAddress.length > 250) throw new Error('La dirección no puede superar los 250 caracteres.')

  const { data, error } = await client
    .from('worksites')
    .update({ name: cleanName, address: cleanAddress || null })
    .eq('id', id)
    .select('id, name, address, active, created_at')
    .single()
  if (error) {
    if (error.code === '42501') throw new Error('Supabase ha bloqueado la modificación de obras. Ejecuta la migración SQL de permisos incluida en el ZIP.')
    throw error
  }
  return data
}

export async function deleteWorksite(id) {
  const client = requireSupabase()

  // Comprobación previa para dar un mensaje claro y conservar el historial.
  const { data: reports, error: reportsError } = await client
    .from('work_reports')
    .select('id')
    .eq('worksite_id', id)
    .limit(1)
  if (reportsError) throw reportsError
  if (reports?.length) {
    throw new Error('No se puede eliminar esta obra porque ya aparece en partes de trabajo. Puedes marcarla como terminada.')
  }

  const { data: deleted, error } = await client
    .from('worksites')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) {
    if (error.code === '42501') throw new Error('Supabase ha bloqueado la eliminación de obras. Ejecuta la migración SQL de permisos incluida en el ZIP.')
    if (error.code === '23503') {
      throw new Error('No se puede eliminar esta obra porque está vinculada a otros registros. Puedes marcarla como terminada.')
    }
    throw error
  }
  if (!deleted) throw new Error('No se ha podido eliminar la obra. Comprueba que tienes permisos de administrador.')
}
